import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { unzipSync } from 'fflate'
import prettier from 'prettier'
import * as shapefile from 'shapefile'

import {
  NATURAL_EARTH_LAKES_ARCHIVE_SHA256,
  NATURAL_EARTH_LAKES_ARCHIVE_URL,
  NATURAL_EARTH_MARINE_ARCHIVE_SHA256,
  NATURAL_EARTH_MARINE_ARCHIVE_URL,
  waterbodyGeometryDefinitions,
  type NaturalEarthWaterbodyDataset,
  type WaterbodyGeometryDefinition,
  type WaterbodyPosition,
} from './waterbody-geometry-content'

type PolygonCoordinates = WaterbodyPosition[][]
type MultiPolygonCoordinates = WaterbodyPosition[][][]

export type SurfaceGeometry =
  | { type: 'Polygon'; coordinates: PolygonCoordinates }
  | { type: 'MultiPolygon'; coordinates: MultiPolygonCoordinates }

type SourceFeature = {
  properties: { ne_id?: number | string }
  geometry: SurfaceGeometry | null
}

export type GeneratedWaterbodyGeometry = {
  id: string
  kind: 'surface'
  geometry: SurfaceGeometry
  lowDetailGeometry: SurfaceGeometry
  provenance: {
    archiveSha256: string
    naturalEarthRecords: { neId: number }[]
    supplements: {
      kind: 'reviewed-outline'
      sourceIds: string[]
    }[]
  }
}

const projectRoot = path.resolve(import.meta.dirname, '..')
const outputPath = path.join(
  projectRoot,
  'src/data/generated/waterbody-geometries.json',
)
const archiveOverrideEnvironmentVariable = 'SCIO_GEO_WATERBODY_ARCHIVE'
const lakeArchiveOverrideEnvironmentVariable = 'SCIO_GEO_LAKE_ARCHIVE'

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

function getDistanceKilometers(
  left: WaterbodyPosition,
  right: WaterbodyPosition,
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
  return 12_742.0176 * Math.asin(Math.min(1, Math.sqrt(haversine)))
}

function pointToSegmentDistanceKilometers(
  point: WaterbodyPosition,
  start: WaterbodyPosition,
  end: WaterbodyPosition,
) {
  const latitudeReference = toRadians((start[1] + end[1] + point[1]) / 3)
  const project = ([longitude, latitude]: WaterbodyPosition) =>
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

function samePosition(left: WaterbodyPosition, right: WaterbodyPosition) {
  return left[0] === right[0] && left[1] === right[1]
}

function unwrapRing(ring: WaterbodyPosition[]) {
  const unwrapped: WaterbodyPosition[] = []
  for (const point of ring) {
    const previous = unwrapped.at(-1)
    let longitude = point[0]
    if (previous) {
      while (longitude - previous[0] > 180) longitude -= 360
      while (longitude - previous[0] < -180) longitude += 360
    }
    unwrapped.push([longitude, point[1]])
  }
  return unwrapped
}

function simplifyOpenLine(
  points: WaterbodyPosition[],
  toleranceKilometers: number,
): WaterbodyPosition[] {
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
  const left = simplifyOpenLine(
    points.slice(0, splitIndex + 1),
    toleranceKilometers,
  )
  const right = simplifyOpenLine(points.slice(splitIndex), toleranceKilometers)
  return [...left.slice(0, -1), ...right]
}

function simplifyRing(
  sourceRing: WaterbodyPosition[],
  toleranceKilometers: number,
) {
  const closed = samePosition(sourceRing[0], sourceRing.at(-1)!)
  const ring = unwrapRing(closed ? sourceRing.slice(0, -1) : sourceRing)
  if (ring.length <= 3) return [...ring, ring[0]]

  let oppositeIndex = 1
  let maximumDistance = 0
  for (let index = 1; index < ring.length; index += 1) {
    const distance = getDistanceKilometers(ring[0], ring[index])
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

function roundPosition([longitude, latitude]: WaterbodyPosition) {
  const normalizedLongitude = ((((longitude + 180) % 360) + 360) % 360) - 180
  return [
    Number(normalizedLongitude.toFixed(5)),
    Number(latitude.toFixed(5)),
  ] satisfies WaterbodyPosition
}

function roundGeometry(geometry: SurfaceGeometry): SurfaceGeometry {
  return geometry.type === 'Polygon'
    ? {
        type: 'Polygon',
        coordinates: geometry.coordinates.map((ring) =>
          ring.map(roundPosition),
        ),
      }
    : {
        type: 'MultiPolygon',
        coordinates: geometry.coordinates.map((polygon) =>
          polygon.map((ring) => ring.map(roundPosition)),
        ),
      }
}

function simplifyGeometry(
  geometry: SurfaceGeometry,
  toleranceKilometers: number,
): SurfaceGeometry {
  return geometry.type === 'Polygon'
    ? {
        type: 'Polygon',
        coordinates: geometry.coordinates.map((ring) =>
          simplifyRing(ring, toleranceKilometers).map(roundPosition),
        ),
      }
    : {
        type: 'MultiPolygon',
        coordinates: geometry.coordinates.map((polygon) =>
          polygon.map((ring) =>
            simplifyRing(ring, toleranceKilometers).map(roundPosition),
          ),
        ),
      }
}

export function countWaterbodyGeometryPoints(geometry: SurfaceGeometry) {
  return geometry.type === 'Polygon'
    ? geometry.coordinates.reduce((total, ring) => total + ring.length, 0)
    : geometry.coordinates.reduce(
        (total, polygon) =>
          total +
          polygon.reduce((polygonTotal, ring) => polygonTotal + ring.length, 0),
        0,
      )
}

function getInitialTolerance(definition: WaterbodyGeometryDefinition) {
  if (definition.kind === 'ocean') return 15
  if (definition.kind === 'strait') return 1
  return 5
}

function buildLowDetailGeometry(
  geometry: SurfaceGeometry,
  definition: WaterbodyGeometryDefinition,
) {
  let toleranceKilometers = getInitialTolerance(definition)
  let simplified = simplifyGeometry(geometry, toleranceKilometers)
  while (
    countWaterbodyGeometryPoints(simplified) > definition.lowDetailMaximumPoints
  ) {
    toleranceKilometers *= 1.35
    simplified = simplifyGeometry(geometry, toleranceKilometers)
    if (toleranceKilometers > 5_000) {
      throw new Error(`Unable to simplify ${definition.id} within its budget`)
    }
  }
  return simplified
}

function combineGeometries(geometries: SurfaceGeometry[]): SurfaceGeometry {
  if (geometries.length === 1) return geometries[0]
  return {
    type: 'MultiPolygon',
    coordinates: geometries.flatMap((geometry) =>
      geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.coordinates,
    ),
  }
}

async function readNaturalEarthGeometries(
  archiveBytes: Uint8Array,
  basename: string,
  expectedVersion: string,
) {
  const files = unzipSync(archiveBytes)
  const shp = files[`${basename}.shp`]
  const dbf = files[`${basename}.dbf`]
  const version = files[`${basename}.VERSION.txt`]
  if (!shp || !dbf || !version) {
    throw new Error(
      `Natural Earth ${basename} archive is missing SHP, DBF or version`,
    )
  }
  if (new TextDecoder().decode(version).trim() !== expectedVersion) {
    throw new Error(
      `Natural Earth ${basename} archive is not version ${expectedVersion}`,
    )
  }

  const source = await shapefile.open(shp, dbf)
  const geometriesByRecord = new Map<number, SurfaceGeometry>()
  while (true) {
    const result = await source.read()
    if (result.done) break
    const feature = result.value as unknown as SourceFeature
    const neId = Number(feature.properties.ne_id)
    if (!Number.isFinite(neId) || !feature.geometry) continue
    if (
      feature.geometry.type !== 'Polygon' &&
      feature.geometry.type !== 'MultiPolygon'
    )
      continue
    geometriesByRecord.set(neId, feature.geometry)
  }
  return geometriesByRecord
}

function verifyArchive(
  archiveBytes: Uint8Array,
  expectedSha256: string,
  label: string,
) {
  const archiveSha256 = createHash('sha256').update(archiveBytes).digest('hex')
  if (archiveSha256 !== expectedSha256) {
    throw new Error(
      `Natural Earth ${label} SHA-256 mismatch: received ${archiveSha256}`,
    )
  }
  return archiveSha256
}

export async function generateWaterbodyGeometryCatalogFromArchives(
  marineArchiveBytes: Uint8Array,
  lakeArchiveBytes: Uint8Array,
) {
  const marineArchiveSha256 = verifyArchive(
    marineArchiveBytes,
    NATURAL_EARTH_MARINE_ARCHIVE_SHA256,
    'marine',
  )
  const lakeArchiveSha256 = verifyArchive(
    lakeArchiveBytes,
    NATURAL_EARTH_LAKES_ARCHIVE_SHA256,
    'lakes',
  )
  const [marineGeometries, lakeGeometries] = await Promise.all([
    readNaturalEarthGeometries(
      marineArchiveBytes,
      'ne_10m_geography_marine_polys',
      '5.1.0',
    ),
    readNaturalEarthGeometries(lakeArchiveBytes, 'ne_10m_lakes', '5.0.0'),
  ])

  return buildWaterbodyGeometryCatalog({
    marine: {
      archiveSha256: marineArchiveSha256,
      geometriesByRecord: marineGeometries,
    },
    lakes: {
      archiveSha256: lakeArchiveSha256,
      geometriesByRecord: lakeGeometries,
    },
  })
}

export function buildWaterbodyGeometryCatalog(
  sources: Record<
    NaturalEarthWaterbodyDataset,
    {
      archiveSha256: string
      geometriesByRecord: ReadonlyMap<number, SurfaceGeometry>
    }
  >,
) {
  const geometries = waterbodyGeometryDefinitions.map((definition) => {
    const source = sources[definition.dataset]
    const sourceGeometries = definition.naturalEarthNeIds.map((neId) => {
      const geometry = source.geometriesByRecord.get(neId)
      if (!geometry) {
        throw new Error(
          `Missing Natural Earth ${definition.dataset} record ${neId} for ${definition.id}`,
        )
      }
      return geometry
    })
    const reviewedOutline = definition.reviewedOutline
      ? {
          type: definition.reviewedOutline.type,
          coordinates: definition.reviewedOutline.coordinates,
        }
      : null
    if (sourceGeometries.length === 0 && !reviewedOutline) {
      throw new Error(`No surface geometry declared for ${definition.id}`)
    }
    const geometry = roundGeometry(
      reviewedOutline ?? combineGeometries(sourceGeometries),
    )
    const lowDetailGeometry = buildLowDetailGeometry(geometry, definition)
    return {
      id: definition.id,
      kind: 'surface' as const,
      geometry,
      lowDetailGeometry,
      provenance: {
        archiveSha256: source.archiveSha256,
        naturalEarthRecords: definition.naturalEarthNeIds.map((neId) => ({
          neId,
        })),
        supplements: definition.reviewedOutline
          ? [
              {
                kind: 'reviewed-outline' as const,
                sourceIds: definition.reviewedOutline.sourceIds,
              },
            ]
          : [],
      },
    } satisfies GeneratedWaterbodyGeometry
  })

  const lowDetailPointCount = geometries.reduce(
    (total, geometry) =>
      total + countWaterbodyGeometryPoints(geometry.lowDetailGeometry),
    0,
  )
  if (lowDetailPointCount > 11_000) {
    throw new Error(
      `Waterbody low-detail geometry budget exceeded: ${lowDetailPointCount}`,
    )
  }
  return geometries
}

async function loadArchive(
  url: string,
  archiveOverrideEnvironmentVariableName: string,
  label: string,
) {
  const archiveOverride = process.env[archiveOverrideEnvironmentVariableName]
  if (archiveOverride) return new Uint8Array(await readFile(archiveOverride))
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Unable to download Natural Earth ${label} polygons: HTTP ${response.status}`,
    )
  }
  return new Uint8Array(await response.arrayBuffer())
}

export async function generateWaterbodyGeometries() {
  const [marineArchiveBytes, lakeArchiveBytes] = await Promise.all([
    loadArchive(
      NATURAL_EARTH_MARINE_ARCHIVE_URL,
      archiveOverrideEnvironmentVariable,
      'marine',
    ),
    loadArchive(
      NATURAL_EARTH_LAKES_ARCHIVE_URL,
      lakeArchiveOverrideEnvironmentVariable,
      'lakes',
    ),
  ])
  const geometries = await generateWaterbodyGeometryCatalogFromArchives(
    marineArchiveBytes,
    lakeArchiveBytes,
  )
  const formatted = await prettier.format(JSON.stringify(geometries), {
    parser: 'json',
  })
  await writeFile(outputPath, formatted)
  return geometries
}

if (import.meta.main) {
  const geometries = await generateWaterbodyGeometries()
  console.log(
    `Generated ${geometries.length} high and low-detail surface waterbody geometries.`,
  )
}
