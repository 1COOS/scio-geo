import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { geoBounds, geoContains } from 'd3-geo'
import { unzipSync } from 'fflate'
import prettier from 'prettier'
import * as shapefile from 'shapefile'

import {
  mountainRangeGeometryCatalogSchema,
  type MountainRangeGeometry,
} from '../src/data/mountainRangeSchema'
import {
  mountainGeometryDefinitions,
  NATURAL_EARTH_MOUNTAIN_ARCHIVE_SHA256,
  NATURAL_EARTH_MOUNTAIN_ARCHIVE_URL,
  type MountainGeometryDefinition,
  type MountainPosition,
} from './mountain-geometry-content'

type RangeFeature = {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: unknown
  } | null
}

const projectRoot = path.resolve(import.meta.dirname, '..')
const outputPath = path.join(
  projectRoot,
  'src/data/generated/mountain-geometries.json',
)
const archiveOverrideEnvironmentVariable = 'SCIO_GEO_MOUNTAIN_ARCHIVE'
const earthRadiusKilometers = 6371.0088

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

function getDistanceKilometers(
  left: MountainPosition,
  right: MountainPosition,
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
  point: MountainPosition,
  start: MountainPosition,
  end: MountainPosition,
) {
  const latitudeReference = toRadians((start[1] + end[1] + point[1]) / 3)
  const project = ([longitude, latitude]: MountainPosition) =>
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
  points: MountainPosition[],
  toleranceKilometers: number,
): MountainPosition[] {
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
  return [
    ...simplifyChunk(
      points.slice(0, splitIndex + 1),
      toleranceKilometers,
    ).slice(0, -1),
    ...simplifyChunk(points.slice(splitIndex), toleranceKilometers),
  ]
}

function simplifyRidge(
  points: MountainPosition[],
  mandatoryIndices: number[],
  baseToleranceKilometers: number,
  maximumPoints: number,
) {
  const uniqueMandatoryIndices = [...new Set(mandatoryIndices)].sort(
    (left, right) => left - right,
  )
  const simplifyAtTolerance = (toleranceKilometers: number) => {
    const simplified: MountainPosition[] = []
    for (let index = 1; index < uniqueMandatoryIndices.length; index += 1) {
      const chunk = points.slice(
        uniqueMandatoryIndices[index - 1],
        uniqueMandatoryIndices[index] + 1,
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

function roundPosition([longitude, latitude]: MountainPosition) {
  return [
    Number(longitude.toFixed(5)),
    Number(latitude.toFixed(5)),
  ] as MountainPosition
}

function interpolateCatmullRom(
  previous: MountainPosition,
  start: MountainPosition,
  end: MountainPosition,
  next: MountainPosition,
  progress: number,
): MountainPosition {
  const interpolate = (p0: number, p1: number, p2: number, p3: number) => {
    const squared = progress * progress
    const cubed = squared * progress
    return (
      0.5 *
      (2 * p1 +
        (-p0 + p2) * progress +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * squared +
        (-p0 + 3 * p1 - 3 * p2 + p3) * cubed)
    )
  }
  return [
    interpolate(previous[0], start[0], end[0], next[0]),
    interpolate(previous[1], start[1], end[1], next[1]),
  ]
}

function buildRidge(definition: MountainGeometryDefinition) {
  const points: MountainPosition[] = []
  const mandatoryIndices: number[] = []
  for (let index = 0; index < definition.controlPoints.length - 1; index += 1) {
    const previous = definition.controlPoints[Math.max(0, index - 1)]
    const start = definition.controlPoints[index]
    const end = definition.controlPoints[index + 1]
    const next =
      definition.controlPoints[
        Math.min(definition.controlPoints.length - 1, index + 2)
      ]
    const segmentDistance = getDistanceKilometers(start, end)
    const steps = Math.max(2, Math.ceil(segmentDistance / 24))
    mandatoryIndices.push(points.length)
    for (let step = 0; step <= steps; step += 1) {
      if (index > 0 && step === 0) continue
      points.push(
        interpolateCatmullRom(previous, start, end, next, step / steps),
      )
    }
  }
  mandatoryIndices.push(points.length - 1)

  let peakIndex = 0
  let peakDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < points.length; index += 1) {
    const distance = getDistanceKilometers(points[index], definition.peak)
    if (distance < peakDistance) {
      peakDistance = distance
      peakIndex = index
    }
  }
  mandatoryIndices.push(peakIndex)

  return {
    high: simplifyRidge(points, mandatoryIndices, 1.5, 600).map(roundPosition),
    medium: simplifyRidge(points, mandatoryIndices, 18, 140).map(roundPosition),
    low: simplifyRidge(points, mandatoryIndices, 55, 48).map(roundPosition),
  }
}

function withinEnvelope(
  feature: RangeFeature,
  position: MountainPosition,
  paddingDegrees = 0.8,
) {
  if (geoContains(feature as never, position)) return true
  const [
    [minimumLongitude, minimumLatitude],
    [maximumLongitude, maximumLatitude],
  ] = geoBounds(feature as never)
  return (
    position[0] >= minimumLongitude - paddingDegrees &&
    position[0] <= maximumLongitude + paddingDegrees &&
    position[1] >= minimumLatitude - paddingDegrees &&
    position[1] <= maximumLatitude + paddingDegrees
  )
}

async function readNaturalEarthRanges(archiveBytes: Uint8Array) {
  const files = unzipSync(archiveBytes)
  const basename = 'ne_10m_geography_regions_polys'
  const shp = files[`${basename}.shp`]
  const dbf = files[`${basename}.dbf`]
  const version = files[`${basename}.VERSION.txt`]
  if (!shp || !dbf || !version) {
    throw new Error(
      'Natural Earth mountain archive is missing SHP, DBF or version',
    )
  }
  if (new TextDecoder().decode(version).trim() !== '5.0.0') {
    throw new Error('Natural Earth mountain archive is not version 5.0.0')
  }

  const source = await shapefile.open(shp, dbf)
  const rangesById = new Map<number, RangeFeature>()
  while (true) {
    const result = await source.read()
    if (result.done) break
    const feature = result.value as unknown as RangeFeature
    const neId = Number(feature.properties.NE_ID ?? feature.properties.ne_id)
    if (Number.isFinite(neId) && feature.geometry) rangesById.set(neId, feature)
  }
  return rangesById
}

export async function generateMountainGeometryCatalogFromArchive(
  archiveBytes: Uint8Array,
) {
  const archiveSha256 = createHash('sha256').update(archiveBytes).digest('hex')
  if (archiveSha256 !== NATURAL_EARTH_MOUNTAIN_ARCHIVE_SHA256) {
    throw new Error(
      `Natural Earth mountain SHA-256 mismatch: received ${archiveSha256}`,
    )
  }
  const rangesById = await readNaturalEarthRanges(archiveBytes)
  const geometries = mountainGeometryDefinitions.map((definition) => {
    const envelope = rangesById.get(definition.naturalEarthNeId)
    if (!envelope) {
      throw new Error(
        `Missing Natural Earth mountain range ${definition.naturalEarthNeId} for ${definition.id}`,
      )
    }
    for (const position of [...definition.controlPoints, definition.peak]) {
      if (!withinEnvelope(envelope, position)) {
        throw new Error(
          `${definition.id} contains a reviewed point outside its Natural Earth envelope: ${position.join(',')}`,
        )
      }
    }
    const ridge = buildRidge(definition)
    return {
      id: definition.id,
      geometry: {
        type: 'MultiLineString' as const,
        coordinates: [ridge.high],
      },
      mediumDetailGeometry: {
        type: 'MultiLineString' as const,
        coordinates: [ridge.medium],
      },
      lowDetailGeometry: {
        type: 'MultiLineString' as const,
        coordinates: [ridge.low],
      },
      provenance: {
        archiveSha256,
        naturalEarthNeId: definition.naturalEarthNeId,
        controlPoints: definition.controlPoints,
        correctionSourceIds: definition.correctionSourceIds,
      },
    } satisfies MountainRangeGeometry
  })

  const mediumPointCount = geometries.reduce(
    (total, geometry) =>
      total + geometry.mediumDetailGeometry.coordinates.flat().length,
    0,
  )
  const lowPointCount = geometries.reduce(
    (total, geometry) =>
      total + geometry.lowDetailGeometry.coordinates.flat().length,
    0,
  )
  if (mediumPointCount > 4_200 || lowPointCount > 1_440) {
    throw new Error(
      `Mountain geometry budget exceeded: ${mediumPointCount} medium, ${lowPointCount} low`,
    )
  }
  return mountainRangeGeometryCatalogSchema.parse(geometries)
}

async function loadArchive() {
  const archiveOverride = process.env[archiveOverrideEnvironmentVariable]
  if (archiveOverride) return new Uint8Array(await readFile(archiveOverride))
  const response = await fetch(NATURAL_EARTH_MOUNTAIN_ARCHIVE_URL)
  if (!response.ok) {
    throw new Error(
      `Unable to download Natural Earth mountain ranges: HTTP ${response.status}`,
    )
  }
  return new Uint8Array(await response.arrayBuffer())
}

export async function generateMountainGeometries() {
  const archiveBytes = await loadArchive()
  const geometries =
    await generateMountainGeometryCatalogFromArchive(archiveBytes)
  const formatted = await prettier.format(JSON.stringify(geometries), {
    parser: 'json',
  })
  await writeFile(outputPath, formatted)
  return geometries
}

if (import.meta.main) {
  const geometries = await generateMountainGeometries()
  console.log(
    `Generated ${geometries.length} high, medium and low-detail mountain geometries.`,
  )
}
