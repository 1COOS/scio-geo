import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { unzipSync } from 'fflate'
import prettier from 'prettier'
import * as shapefile from 'shapefile'

import {
  NATURAL_EARTH_RIVER_ARCHIVE_SHA256,
  NATURAL_EARTH_RIVER_ARCHIVE_URL,
  riverGeometryDefinitions,
  type RiverGeometryDefinition,
  type RiverPosition,
} from './river-geometry-content'

type SourceFeature = {
  properties: { ne_id?: number | string }
  geometry:
    | { type: 'LineString'; coordinates: RiverPosition[] }
    | { type: 'MultiLineString'; coordinates: RiverPosition[][] }
    | null
}

type SupplementRecord = {
  kind: 'reviewed-gap' | 'authoritative-open-data'
  sourceIds: string[]
  start: RiverPosition
  end: RiverPosition
  distanceKilometers: number
}

export type GeneratedRiverGeometry = {
  id: string
  geometry: { type: 'MultiLineString'; coordinates: RiverPosition[][] }
  mediumDetailGeometry: {
    type: 'MultiLineString'
    coordinates: RiverPosition[][]
  }
  lowDetailGeometry: {
    type: 'MultiLineString'
    coordinates: RiverPosition[][]
  }
  provenance: {
    archiveSha256: string
    naturalEarthParts: { neId: number; part: number }[]
    supplements: SupplementRecord[]
  }
}

const projectRoot = path.resolve(import.meta.dirname, '..')
const outputPath = path.join(
  projectRoot,
  'src/data/generated/river-geometries.json',
)
const archiveOverrideEnvironmentVariable = 'SCIO_GEO_RIVER_ARCHIVE'
const earthRadiusKilometers = 6371.0088

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

export function getRiverDistanceKilometers(
  left: RiverPosition,
  right: RiverPosition,
) {
  const latitudeDelta = toRadians(right[1] - left[1])
  const longitudeDelta = toRadians(right[0] - left[0])
  const leftLatitude = toRadians(left[1])
  const rightLatitude = toRadians(right[1])
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2
  return (
    2 * earthRadiusKilometers * Math.asin(Math.min(1, Math.sqrt(haversine)))
  )
}

function pointToSegmentDistanceKilometers(
  point: RiverPosition,
  start: RiverPosition,
  end: RiverPosition,
) {
  const latitudeReference = toRadians((start[1] + end[1] + point[1]) / 3)
  const project = ([longitude, latitude]: RiverPosition) =>
    [
      longitude * Math.cos(latitudeReference) * 111.32,
      latitude * 110.574,
    ] as const
  const [pointX, pointY] = project(point)
  const [startX, startY] = project(start)
  const [endX, endY] = project(end)
  const deltaX = endX - startX
  const deltaY = endY - startY
  const lengthSquared = deltaX ** 2 + deltaY ** 2
  if (lengthSquared === 0) return Math.hypot(pointX - startX, pointY - startY)
  const progress = Math.max(
    0,
    Math.min(
      1,
      ((pointX - startX) * deltaX + (pointY - startY) * deltaY) / lengthSquared,
    ),
  )
  return Math.hypot(
    pointX - (startX + progress * deltaX),
    pointY - (startY + progress * deltaY),
  )
}

function simplifyChunk(
  points: RiverPosition[],
  toleranceKilometers: number,
): RiverPosition[] {
  if (points.length <= 2) return points
  let maximumDistance = 0
  let splitIndex = 0
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointToSegmentDistanceKilometers(
      points[index],
      points[0],
      points.at(-1)!,
    )
    if (distance > maximumDistance) {
      maximumDistance = distance
      splitIndex = index
    }
  }
  if (maximumDistance <= toleranceKilometers) {
    return [points[0], points.at(-1)!]
  }
  const left: RiverPosition[] = simplifyChunk(
    points.slice(0, splitIndex + 1),
    toleranceKilometers,
  )
  const right: RiverPosition[] = simplifyChunk(
    points.slice(splitIndex),
    toleranceKilometers,
  )
  return [...left.slice(0, -1), ...right]
}

function simplifyStem(
  points: RiverPosition[],
  mandatoryIndices: number[],
  baseToleranceKilometers: number,
  maximumPoints: number,
) {
  const simplifyAtTolerance = (toleranceKilometers: number) => {
    const simplified: RiverPosition[] = []
    for (let index = 1; index < mandatoryIndices.length; index += 1) {
      const chunk = points.slice(
        mandatoryIndices[index - 1],
        mandatoryIndices[index] + 1,
      )
      const simplifiedChunk = simplifyChunk(chunk, toleranceKilometers)
      simplified.push(
        ...(index === 1 ? simplifiedChunk : simplifiedChunk.slice(1)),
      )
    }
    return simplified
  }

  let toleranceKilometers = baseToleranceKilometers
  let simplified = simplifyAtTolerance(toleranceKilometers)
  while (simplified.length > maximumPoints) {
    toleranceKilometers *= 1.25
    simplified = simplifyAtTolerance(toleranceKilometers)
  }
  return simplified
}

function roundPosition([longitude, latitude]: RiverPosition): RiverPosition {
  return [Number(longitude.toFixed(5)), Number(latitude.toFixed(5))]
}

function samePosition(left: RiverPosition, right: RiverPosition) {
  return left[0] === right[0] && left[1] === right[1]
}

function orientLine(line: RiverPosition[], previous: RiverPosition) {
  return getRiverDistanceKilometers(previous, line[0]) <=
    getRiverDistanceKilometers(previous, line.at(-1)!)
    ? line
    : [...line].reverse()
}

function appendLine(
  target: RiverPosition[],
  mandatoryIndices: number[],
  line: RiverPosition[],
) {
  if (line.length < 2)
    throw new Error('River line contains fewer than two points')
  const previous = target.at(-1)
  const points =
    previous && samePosition(previous, line[0]) ? line.slice(1) : line
  target.push(...points)
  mandatoryIndices.push(target.length - 1)
}

function buildStem(
  definition: RiverGeometryDefinition,
  stemIndex: number,
  linesByRecord: Map<number, RiverPosition[][]>,
) {
  const stem = definition.stems[stemIndex]
  const points: RiverPosition[] = []
  const mandatoryIndices = [0]
  const supplements: SupplementRecord[] = []
  const supplementKind = definition.supplementKind ?? 'reviewed-gap'
  const supplementSourceIds = definition.supplementalSourceIds ?? []

  const recordSupplement = (line: RiverPosition[]) => {
    if (line.length < 2) return
    supplements.push({
      kind: supplementKind,
      sourceIds: supplementSourceIds,
      start: roundPosition(line[0]),
      end: roundPosition(line.at(-1)!),
      distanceKilometers: Number(
        getRiverDistanceKilometers(line[0], line.at(-1)!).toFixed(1),
      ),
    })
  }

  if (stem.sourceSupplement) {
    appendLine(points, mandatoryIndices, stem.sourceSupplement)
    recordSupplement(stem.sourceSupplement)
  }

  for (let partIndex = 0; partIndex < stem.parts.length; partIndex += 1) {
    const recordPart = stem.parts[partIndex]
    const sourceLines = linesByRecord.get(recordPart.neId)
    const sourceLine = sourceLines?.[recordPart.part]
    if (!sourceLine) {
      throw new Error(
        `Missing Natural Earth ${recordPart.neId} part ${recordPart.part} for ${definition.id}`,
      )
    }
    const previous = points.at(-1) ?? stem.sourceAnchor
    const oriented = orientLine(sourceLine, previous)
    const gapDistance = getRiverDistanceKilometers(previous, oriented[0])
    if (gapDistance > 15) {
      if (supplementSourceIds.length === 0) {
        throw new Error(
          `${definition.id} has an undeclared ${gapDistance.toFixed(1)} km join before ${recordPart.neId}:${recordPart.part}`,
        )
      }
      const via = stem.bridgeVias?.[partIndex - 1] ?? []
      const bridge = [previous, ...via, oriented[0]]
      appendLine(points, mandatoryIndices, bridge)
      recordSupplement(bridge)
    }
    appendLine(points, mandatoryIndices, oriented)
  }

  if (stem.mouthSupplement) {
    const previous = points.at(-1)
    const supplement = previous
      ? orientLine(stem.mouthSupplement, previous)
      : stem.mouthSupplement
    appendLine(points, mandatoryIndices, supplement)
    recordSupplement(supplement)
  }

  if (points.length < 2) {
    throw new Error(`No river geometry assembled for ${definition.id}`)
  }
  mandatoryIndices[0] = 0
  if (mandatoryIndices.at(-1) !== points.length - 1) {
    mandatoryIndices.push(points.length - 1)
  }

  const sourceDistance = getRiverDistanceKilometers(
    points[0],
    stem.sourceAnchor,
  )
  const mouthDistance = getRiverDistanceKilometers(
    points.at(-1)!,
    stem.mouthAnchor,
  )
  if (sourceDistance > 75 || mouthDistance > 75) {
    throw new Error(
      `${definition.id} endpoint audit failed (${sourceDistance.toFixed(1)} km source, ${mouthDistance.toFixed(1)} km mouth)`,
    )
  }

  return {
    high: simplifyStem(points, mandatoryIndices, 2, 2_000).map(roundPosition),
    medium: simplifyStem(points, mandatoryIndices, 12, 320).map(roundPosition),
    low: simplifyStem(points, mandatoryIndices, 35, 96).map(roundPosition),
    supplements,
  }
}

async function readNaturalEarthLines(archiveBytes: Uint8Array) {
  const files = unzipSync(archiveBytes)
  const basename = 'ne_10m_rivers_lake_centerlines'
  const shp = files[`${basename}.shp`]
  const dbf = files[`${basename}.dbf`]
  const version = files[`${basename}.VERSION.txt`]
  if (!shp || !dbf || !version) {
    throw new Error(
      'Natural Earth river archive is missing SHP, DBF or version',
    )
  }
  if (new TextDecoder().decode(version).trim() !== '5.0.0') {
    throw new Error('Natural Earth river archive is not version 5.0.0')
  }

  const source = await shapefile.open(shp, dbf)
  const linesByRecord = new Map<number, RiverPosition[][]>()
  while (true) {
    const result = await source.read()
    if (result.done) break
    const feature = result.value as unknown as SourceFeature
    const neId = Number(feature.properties.ne_id)
    if (!Number.isFinite(neId) || !feature.geometry) continue
    if (feature.geometry.type === 'LineString') {
      linesByRecord.set(neId, [feature.geometry.coordinates])
    } else if (feature.geometry.type === 'MultiLineString') {
      linesByRecord.set(neId, feature.geometry.coordinates)
    }
  }
  return linesByRecord
}

export async function generateRiverGeometryCatalogFromArchive(
  archiveBytes: Uint8Array,
) {
  const archiveSha256 = createHash('sha256').update(archiveBytes).digest('hex')
  if (archiveSha256 !== NATURAL_EARTH_RIVER_ARCHIVE_SHA256) {
    throw new Error(
      `Natural Earth river SHA-256 mismatch: received ${archiveSha256}`,
    )
  }
  const linesByRecord = await readNaturalEarthLines(archiveBytes)

  const geometries = riverGeometryDefinitions.map((definition) => {
    const stems = definition.stems.map((_, stemIndex) =>
      buildStem(definition, stemIndex, linesByRecord),
    )
    return {
      id: definition.id,
      geometry: {
        type: 'MultiLineString' as const,
        coordinates: stems.map((stem) => stem.high),
      },
      mediumDetailGeometry: {
        type: 'MultiLineString' as const,
        coordinates: stems.map((stem) => stem.medium),
      },
      lowDetailGeometry: {
        type: 'MultiLineString' as const,
        coordinates: stems.map((stem) => stem.low),
      },
      provenance: {
        archiveSha256,
        naturalEarthParts: definition.stems.flatMap((stem) => stem.parts),
        supplements: stems.flatMap((stem) => stem.supplements),
      },
    } satisfies GeneratedRiverGeometry
  })

  const balancedPointCount = geometries.reduce(
    (total, geometry) =>
      total + geometry.mediumDetailGeometry.coordinates.flat().length,
    0,
  )
  const lowPointCount = geometries.reduce(
    (total, geometry) =>
      total + geometry.lowDetailGeometry.coordinates.flat().length,
    0,
  )
  if (balancedPointCount > 10_000 || lowPointCount > 3_000) {
    throw new Error(
      `River geometry budget exceeded: ${balancedPointCount} medium, ${lowPointCount} low`,
    )
  }
  return geometries
}

async function loadArchive() {
  const archiveOverride = process.env[archiveOverrideEnvironmentVariable]
  if (archiveOverride) return new Uint8Array(await readFile(archiveOverride))
  const response = await fetch(NATURAL_EARTH_RIVER_ARCHIVE_URL)
  if (!response.ok) {
    throw new Error(
      `Unable to download Natural Earth rivers: HTTP ${response.status}`,
    )
  }
  return new Uint8Array(await response.arrayBuffer())
}

export async function generateRiverGeometries() {
  const archiveBytes = await loadArchive()
  const geometries = await generateRiverGeometryCatalogFromArchive(archiveBytes)
  const formatted = await prettier.format(JSON.stringify(geometries), {
    parser: 'json',
  })
  await writeFile(outputPath, formatted)
  return geometries
}

if (import.meta.main) {
  // Keep a dedicated temporary directory available for future source adapters;
  // it is always removed and never becomes a runtime dependency.
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'scio-geo-rivers-'),
  )
  try {
    const geometries = await generateRiverGeometries()
    console.log(
      `Generated ${geometries.length} high, medium and low-detail river geometries.`,
    )
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}
