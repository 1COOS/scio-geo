import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { unzipSync } from 'fflate'
import prettier from 'prettier'
import * as shapefile from 'shapefile'

import {
  desertGeometryCatalogSchema,
  type DesertGeometry,
  type DesertSurfaceGeometry,
} from '../src/data/desertSchema'
import {
  desertGeometryDefinitions,
  NATURAL_EARTH_DESERT_ARCHIVE_SHA256,
  NATURAL_EARTH_DESERT_ARCHIVE_URL,
  NATURAL_EARTH_DESERT_ARCHIVE_VERSION,
  type DesertGeometryDefinition,
} from './desert-geometry-content'

type Position = [number, number]

type SourceFeature = {
  properties: Record<string, unknown>
  geometry: DesertSurfaceGeometry | null
}

const projectRoot = path.resolve(import.meta.dirname, '..')
const outputPath = path.join(
  projectRoot,
  'src/data/generated/desert-geometries.json',
)
const archiveOverrideEnvironmentVariable = 'SCIO_GEO_DESERT_ARCHIVE'

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

function pointToSegmentDistanceKilometers(
  point: Position,
  start: Position,
  end: Position,
) {
  const latitudeReference = toRadians((start[1] + end[1] + point[1]) / 3)
  const project = ([longitude, latitude]: Position) =>
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

function samePosition(left: Position, right: Position) {
  return left[0] === right[0] && left[1] === right[1]
}

function simplifyOpenLine(
  points: Position[],
  toleranceKilometers: number,
): Position[] {
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
    ...simplifyOpenLine(
      points.slice(0, splitIndex + 1),
      toleranceKilometers,
    ).slice(0, -1),
    ...simplifyOpenLine(points.slice(splitIndex), toleranceKilometers),
  ]
}

function simplifyRing(sourceRing: Position[], toleranceKilometers: number) {
  const ring = samePosition(sourceRing[0], sourceRing.at(-1)!)
    ? sourceRing.slice(0, -1)
    : sourceRing
  if (ring.length <= 3) return [...ring, ring[0]]

  let oppositeIndex = 1
  let maximumDistance = 0
  for (let index = 1; index < ring.length; index += 1) {
    const deltaLongitude =
      (ring[index][0] - ring[0][0]) *
      Math.cos(toRadians((ring[index][1] + ring[0][1]) / 2))
    const distance = Math.hypot(deltaLongitude, ring[index][1] - ring[0][1])
    if (distance > maximumDistance) {
      maximumDistance = distance
      oppositeIndex = index
    }
  }

  const firstArc = simplifyOpenLine(
    ring.slice(0, oppositeIndex + 1),
    toleranceKilometers,
  )
  const secondArc = simplifyOpenLine(
    [...ring.slice(oppositeIndex), ring[0]],
    toleranceKilometers,
  )
  const simplified = [...firstArc.slice(0, -1), ...secondArc.slice(0, -1)]
  if (simplified.length < 3) {
    const fallback = [
      ring[0],
      ring[Math.floor(ring.length / 3)],
      ring[Math.floor((ring.length * 2) / 3)],
    ]
    return [...fallback, fallback[0]]
  }
  return [...simplified, simplified[0]]
}

function roundPosition([longitude, latitude]: Position) {
  return [
    Number(longitude.toFixed(5)),
    Number(latitude.toFixed(5)),
  ] satisfies Position
}

function mapGeometryRings(
  geometry: DesertSurfaceGeometry,
  transform: (ring: Position[]) => Position[],
): DesertSurfaceGeometry {
  return geometry.type === 'Polygon'
    ? {
        type: 'Polygon',
        coordinates: geometry.coordinates.map((ring) => transform(ring)),
      }
    : {
        type: 'MultiPolygon',
        coordinates: geometry.coordinates.map((polygon) =>
          polygon.map((ring) => transform(ring)),
        ),
      }
}

function roundGeometry(geometry: DesertSurfaceGeometry) {
  return mapGeometryRings(geometry, (ring) => ring.map(roundPosition))
}

function simplifyGeometry(
  geometry: DesertSurfaceGeometry,
  toleranceKilometers: number,
) {
  return mapGeometryRings(geometry, (ring) =>
    simplifyRing(ring, toleranceKilometers).map(roundPosition),
  )
}

export function countDesertGeometryPoints(geometry: DesertSurfaceGeometry) {
  return geometry.type === 'Polygon'
    ? geometry.coordinates.reduce((total, ring) => total + ring.length, 0)
    : geometry.coordinates.reduce(
        (total, polygon) =>
          total + polygon.reduce((sum, ring) => sum + ring.length, 0),
        0,
      )
}

function buildLowDetailGeometry(
  geometry: DesertSurfaceGeometry,
  definition: DesertGeometryDefinition,
) {
  let toleranceKilometers = 4
  let simplified = simplifyGeometry(geometry, toleranceKilometers)
  while (
    countDesertGeometryPoints(simplified) > definition.lowDetailMaximumPoints
  ) {
    toleranceKilometers *= 1.35
    simplified = simplifyGeometry(geometry, toleranceKilometers)
    if (toleranceKilometers > 5_000) {
      throw new Error(`Unable to simplify ${definition.id} within its budget`)
    }
  }
  return simplified
}

async function readNaturalEarthDeserts(archiveBytes: Uint8Array) {
  const files = unzipSync(archiveBytes)
  const basename = 'ne_10m_geography_regions_polys'
  const shp = files[`${basename}.shp`]
  const dbf = files[`${basename}.dbf`]
  const version = files[`${basename}.VERSION.txt`]
  if (!shp || !dbf || !version) {
    throw new Error(
      'Natural Earth desert archive is missing SHP, DBF or version',
    )
  }
  if (
    new TextDecoder().decode(version).trim() !==
    NATURAL_EARTH_DESERT_ARCHIVE_VERSION
  ) {
    throw new Error(
      `Natural Earth desert archive is not version ${NATURAL_EARTH_DESERT_ARCHIVE_VERSION}`,
    )
  }

  const source = await shapefile.open(shp, dbf)
  const geometriesByRecord = new Map<number, DesertSurfaceGeometry>()
  while (true) {
    const result = await source.read()
    if (result.done) break
    const feature = result.value as unknown as SourceFeature
    const neId = Number(feature.properties.NE_ID ?? feature.properties.ne_id)
    if (
      !Number.isFinite(neId) ||
      !feature.geometry ||
      (feature.geometry.type !== 'Polygon' &&
        feature.geometry.type !== 'MultiPolygon')
    ) {
      continue
    }
    geometriesByRecord.set(neId, feature.geometry)
  }
  return geometriesByRecord
}

export function buildDesertGeometryCatalog(
  archiveSha256: string,
  geometriesByRecord: ReadonlyMap<number, DesertSurfaceGeometry>,
) {
  const geometries = desertGeometryDefinitions.map((definition) => {
    const sourceGeometry = geometriesByRecord.get(definition.naturalEarthNeId)
    if (!sourceGeometry) {
      throw new Error(
        `Missing Natural Earth desert record ${definition.naturalEarthNeId} for ${definition.id}`,
      )
    }
    const geometry = roundGeometry(sourceGeometry)
    return {
      id: definition.id,
      geometry,
      lowDetailGeometry: buildLowDetailGeometry(geometry, definition),
      provenance: {
        archiveVersion: NATURAL_EARTH_DESERT_ARCHIVE_VERSION,
        archiveSha256,
        naturalEarthNeId: definition.naturalEarthNeId,
      },
    } satisfies DesertGeometry
  })

  const lowDetailPointCount = geometries.reduce(
    (total, geometry) =>
      total + countDesertGeometryPoints(geometry.lowDetailGeometry),
    0,
  )
  if (lowDetailPointCount > 3_600) {
    throw new Error(
      `Desert low-detail geometry budget exceeded: ${lowDetailPointCount}`,
    )
  }
  return desertGeometryCatalogSchema.parse(geometries)
}

export async function generateDesertGeometryCatalogFromArchive(
  archiveBytes: Uint8Array,
) {
  const archiveSha256 = createHash('sha256').update(archiveBytes).digest('hex')
  if (archiveSha256 !== NATURAL_EARTH_DESERT_ARCHIVE_SHA256) {
    throw new Error(
      `Natural Earth desert SHA-256 mismatch: received ${archiveSha256}`,
    )
  }
  return buildDesertGeometryCatalog(
    archiveSha256,
    await readNaturalEarthDeserts(archiveBytes),
  )
}

async function loadArchive() {
  const archiveOverride = process.env[archiveOverrideEnvironmentVariable]
  if (archiveOverride) return new Uint8Array(await readFile(archiveOverride))
  const response = await fetch(NATURAL_EARTH_DESERT_ARCHIVE_URL)
  if (!response.ok) {
    throw new Error(
      `Unable to download Natural Earth desert polygons: HTTP ${response.status}`,
    )
  }
  return new Uint8Array(await response.arrayBuffer())
}

export async function generateDesertGeometries() {
  const geometries = await generateDesertGeometryCatalogFromArchive(
    await loadArchive(),
  )
  const formatted = await prettier.format(JSON.stringify(geometries), {
    parser: 'json',
  })
  await writeFile(outputPath, formatted)
  return geometries
}

if (import.meta.main) {
  const geometries = await generateDesertGeometries()
  console.log(
    `Generated ${geometries.length} high and low-detail desert geometries.`,
  )
}
