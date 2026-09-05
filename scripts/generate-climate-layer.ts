import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { unzipSync, zlibSync } from 'fflate'
import { fromArrayBuffer } from 'geotiff'
import { format } from 'prettier'

import { mapKoppenValueToClimateType } from '../src/data/climateClassification'
import { climateTypes } from '../src/data/climateLearning'
import {
  climateLayerManifestSchema,
  climateOceanRgb,
  climateTypeIds,
  type ClimateTypeId,
} from '../src/data/climateLearningSchema'

export const KOPPEN_ARCHIVE_BYTES = 130_618_411
export const KOPPEN_ARCHIVE_MD5 = '7fc2f5a15d4f5fe0ce59c9a9b502aa09'
export const KOPPEN_RASTER_PATH = '1991_2020/koppen_geiger_0p1.tif'

const projectRoot = path.resolve(import.meta.dirname, '..')
const archiveEnvironmentVariable = 'SCIO_GEO_KOPPEN_ARCHIVE'
const publicDirectory = path.join(projectRoot, 'public/climate')
const manifestPath = path.join(
  projectRoot,
  'src/data/generated/climate-layer.json',
)

const outputDefinitions = {
  balanced: {
    url: '/climate/climate-types-2048-v2.png' as const,
    filename: 'climate-types-2048-v2.png',
    width: 2048 as const,
    height: 1024 as const,
    boundaryWidth: 3 as const,
  },
  low: {
    url: '/climate/climate-types-1024-v2.png' as const,
    filename: 'climate-types-1024-v2.png',
    width: 1024 as const,
    height: 512 as const,
    boundaryWidth: 2 as const,
  },
}

const anchors = {
  manaus: { latitude: -3.1, longitude: -60 },
  mumbai: { latitude: 19.1, longitude: 72.9 },
  nairobi: { latitude: -1.3, longitude: 36.8 },
  cairo: { latitude: 30.0, longitude: 31.2 },
  shanghai: { latitude: 31.2, longitude: 121.5 },
  beijing: { latitude: 39.9, longitude: 116.4 },
  london: { latitude: 51.5, longitude: -0.1 },
  rome: { latitude: 41.9, longitude: 12.5 },
  moscow: { latitude: 55.8, longitude: 37.6 },
  yakutsk: { latitude: 62.0, longitude: 129.7 },
  utqiagvik: { latitude: 71.3, longitude: -156.8 },
  antarcticInterior: { latitude: -78.5, longitude: 106.8 },
  lhasa: { latitude: 29.7, longitude: 91.1 },
  quito: { latitude: -0.2, longitude: -78.5 },
  addisAbaba: { latitude: 9.0, longitude: 38.7 },
}

function parseHexColor(color: string) {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ] as [number, number, number]
}

const palette = climateTypes.map((climateType) => ({
  id: climateType.id,
  color: climateType.color,
  rgb: parseHexColor(climateType.color),
}))

const paletteById = new Map(palette.map((item) => [item.id, item.rgb]))
const paletteIndexById = new Map(
  climateTypeIds.map((climateTypeId, index) => [climateTypeId, index]),
)
const HIGHLIGHT_EDGE_RGB = [255, 242, 168] as const
const HIGHLIGHT_WHITE_MIX = 0.35

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function uint32(value: number) {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ])
}

function concatBytes(parts: Uint8Array[]) {
  const result = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  )
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function pngChunk(type: string, data: Uint8Array) {
  const typeBytes = new TextEncoder().encode(type)
  return concatBytes([
    uint32(data.length),
    typeBytes,
    data,
    uint32(crc32(concatBytes([typeBytes, data]))),
  ])
}

function encodeRgbaPng(width: number, height: number, rgba: Uint8Array) {
  const scanlines = new Uint8Array(height * (width * 4 + 1))
  for (let y = 0; y < height; y += 1) {
    const targetOffset = y * (width * 4 + 1)
    scanlines[targetOffset] = 0
    scanlines.set(
      rgba.subarray(y * width * 4, (y + 1) * width * 4),
      targetOffset + 1,
    )
  }
  const ihdr = concatBytes([
    uint32(width),
    uint32(height),
    new Uint8Array([8, 6, 0, 0, 0]),
  ])
  return concatBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlibSync(scanlines, { level: 9 })),
    pngChunk('IEND', new Uint8Array()),
  ])
}

function getSourceValue(
  raster: Uint8Array,
  width: number,
  height: number,
  position: { latitude: number; longitude: number },
) {
  const longitude = Math.min(179.999999, Math.max(-180, position.longitude))
  const latitude = Math.min(89.999999, Math.max(-89.999999, position.latitude))
  const x = Math.min(width - 1, Math.floor(((longitude + 180) / 360) * width))
  const y = Math.min(height - 1, Math.floor(((90 - latitude) / 180) * height))
  return raster[y * width + x] ?? 0
}

type RenderedClimateRaster = {
  rgba: Uint8Array
  climateTypeIndexes: Int8Array
}

export function renderClimateRaster(
  raster: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
): RenderedClimateRaster {
  const rgba = new Uint8Array(width * height * 4)
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = climateOceanRgb[0]
    rgba[offset + 1] = climateOceanRgb[1]
    rgba[offset + 2] = climateOceanRgb[2]
    rgba[offset + 3] = 255
  }
  const climateTypeIndexes = new Int8Array(width * height)
  climateTypeIndexes.fill(-1)
  for (let y = 0; y < height; y += 1) {
    const latitude = 90 - ((y + 0.5) / height) * 180
    for (let x = 0; x < width; x += 1) {
      const longitude = -180 + ((x + 0.5) / width) * 360
      const sourceValue = getSourceValue(raster, sourceWidth, sourceHeight, {
        latitude,
        longitude,
      })
      const climateTypeId = mapKoppenValueToClimateType(sourceValue, {
        latitude,
        longitude,
      })
      if (!climateTypeId) continue
      const rgb = paletteById.get(climateTypeId)
      if (!rgb) throw new Error(`Missing palette color for ${climateTypeId}`)
      const climateTypeIndex = paletteIndexById.get(climateTypeId)
      if (climateTypeIndex === undefined) {
        throw new Error(`Missing palette index for ${climateTypeId}`)
      }
      climateTypeIndexes[y * width + x] = climateTypeIndex
      const offset = (y * width + x) * 4
      rgba[offset] = rgb[0]
      rgba[offset + 1] = rgb[1]
      rgba[offset + 2] = rgb[2]
      rgba[offset + 3] = 255
    }
  }
  return { rgba, climateTypeIndexes }
}

function isClimateHighlightBoundary(
  climateTypeIndexes: Int8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  selectedIndex: number,
) {
  const leftX = (x - 1 + width) % width
  const rightX = (x + 1) % width
  return (
    y === 0 ||
    y === height - 1 ||
    climateTypeIndexes[y * width + leftX] !== selectedIndex ||
    climateTypeIndexes[y * width + rightX] !== selectedIndex ||
    climateTypeIndexes[(y - 1) * width + x] !== selectedIndex ||
    climateTypeIndexes[(y + 1) * width + x] !== selectedIndex
  )
}

export function createClimateHighlightRgba(
  baseRgba: Uint8Array,
  climateTypeIndexes: Int8Array,
  width: number,
  height: number,
  selectedClimateTypeId: ClimateTypeId,
) {
  if (
    baseRgba.length !== width * height * 4 ||
    climateTypeIndexes.length !== width * height
  ) {
    throw new Error('Climate highlight raster dimensions do not match')
  }
  const selectedIndex = paletteIndexById.get(selectedClimateTypeId)
  if (selectedIndex === undefined) {
    throw new Error(`Missing palette index for ${selectedClimateTypeId}`)
  }
  const selectedRgb = paletteById.get(selectedClimateTypeId)
  if (!selectedRgb) {
    throw new Error(`Missing palette color for ${selectedClimateTypeId}`)
  }
  const interiorRgb = selectedRgb.map((channel) =>
    Math.round(channel + (255 - channel) * HIGHLIGHT_WHITE_MIX),
  ) as [number, number, number]
  const highlighted = new Uint8Array(baseRgba)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (climateTypeIndexes[y * width + x] !== selectedIndex) continue
      const rgb = isClimateHighlightBoundary(
        climateTypeIndexes,
        width,
        height,
        x,
        y,
        selectedIndex,
      )
        ? HIGHLIGHT_EDGE_RGB
        : interiorRgb
      const offset = (y * width + x) * 4
      highlighted[offset] = rgb[0]
      highlighted[offset + 1] = rgb[1]
      highlighted[offset + 2] = rgb[2]
    }
  }
  return highlighted
}

function isClimateBoundaryWithinWidth(
  climateTypeIndexes: Int8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  selectedIndex: number,
  boundaryWidth: number,
) {
  for (
    let latitudeOffset = -boundaryWidth;
    latitudeOffset <= boundaryWidth;
    latitudeOffset += 1
  ) {
    const neighbourY = y + latitudeOffset
    if (neighbourY < 0 || neighbourY >= height) return true
    const remainingWidth = boundaryWidth - Math.abs(latitudeOffset)
    for (
      let longitudeOffset = -remainingWidth;
      longitudeOffset <= remainingWidth;
      longitudeOffset += 1
    ) {
      const neighbourX = (x + longitudeOffset + width) % width
      if (
        climateTypeIndexes[neighbourY * width + neighbourX] !== selectedIndex
      ) {
        return true
      }
    }
  }
  return false
}

export function createClimateBoundaryRgba(
  climateTypeIndexes: Int8Array,
  width: number,
  height: number,
  selectedClimateTypeId: ClimateTypeId,
  boundaryWidth: number,
) {
  if (
    climateTypeIndexes.length !== width * height ||
    !Number.isInteger(boundaryWidth) ||
    boundaryWidth < 1
  ) {
    throw new Error('Climate boundary raster dimensions are invalid')
  }
  const selectedIndex = paletteIndexById.get(selectedClimateTypeId)
  if (selectedIndex === undefined) {
    throw new Error(`Missing palette index for ${selectedClimateTypeId}`)
  }
  const boundary = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (climateTypeIndexes[y * width + x] !== selectedIndex) continue
      if (
        !isClimateBoundaryWithinWidth(
          climateTypeIndexes,
          width,
          height,
          x,
          y,
          selectedIndex,
          boundaryWidth,
        )
      ) {
        continue
      }
      const offset = (y * width + x) * 4
      boundary[offset] = 255
      boundary[offset + 1] = 255
      boundary[offset + 2] = 255
      boundary[offset + 3] = 255
    }
  }
  return boundary
}

export async function generateClimateAssetsFromArchive(
  archiveBytes: Uint8Array,
) {
  if (archiveBytes.byteLength !== KOPPEN_ARCHIVE_BYTES) {
    throw new Error(
      `Köppen archive size mismatch: expected ${KOPPEN_ARCHIVE_BYTES}, received ${archiveBytes.byteLength}`,
    )
  }
  const archiveMd5 = createHash('md5').update(archiveBytes).digest('hex')
  if (archiveMd5 !== KOPPEN_ARCHIVE_MD5) {
    throw new Error(
      `Köppen archive MD5 mismatch: expected ${KOPPEN_ARCHIVE_MD5}, received ${archiveMd5}`,
    )
  }
  const files = unzipSync(archiveBytes, {
    filter: (file) => file.name === KOPPEN_RASTER_PATH,
  })
  const rasterBytes = files[KOPPEN_RASTER_PATH]
  if (!rasterBytes) throw new Error(`Missing ${KOPPEN_RASTER_PATH}`)
  const rasterBuffer = rasterBytes.buffer.slice(
    rasterBytes.byteOffset,
    rasterBytes.byteOffset + rasterBytes.byteLength,
  )
  const tiff = await fromArrayBuffer(rasterBuffer)
  const image = await tiff.getImage()
  const sourceWidth = image.getWidth()
  const sourceHeight = image.getHeight()
  if (sourceWidth !== 3600 || sourceHeight !== 1800) {
    throw new Error(
      `Unexpected Köppen raster size: ${sourceWidth}x${sourceHeight}`,
    )
  }
  const rasters = await image.readRasters()
  const raster = rasters[0]
  if (!(raster instanceof Uint8Array)) {
    throw new Error('Expected an 8-bit Köppen raster')
  }

  const assets = Object.fromEntries(
    Object.entries(outputDefinitions).map(([quality, definition]) => {
      const rendered = renderClimateRaster(
        raster,
        sourceWidth,
        sourceHeight,
        definition.width,
        definition.height,
      )
      const png = encodeRgbaPng(
        definition.width,
        definition.height,
        rendered.rgba,
      )
      const highlights = Object.fromEntries(
        climateTypeIds.map((climateTypeId) => {
          const highlightDefinition = {
            url: `/climate/highlights-v2/${quality}/${climateTypeId}.png`,
            filename: `highlights-v2/${quality}/${climateTypeId}.png`,
            width: definition.width,
            height: definition.height,
          }
          const highlightRgba = createClimateHighlightRgba(
            rendered.rgba,
            rendered.climateTypeIndexes,
            definition.width,
            definition.height,
            climateTypeId,
          )
          return [
            climateTypeId,
            {
              definition: highlightDefinition,
              png: encodeRgbaPng(
                definition.width,
                definition.height,
                highlightRgba,
              ),
            },
          ]
        }),
      ) as Record<
        ClimateTypeId,
        {
          definition: {
            url: string
            filename: string
            width: 2048 | 1024
            height: 1024 | 512
          }
          png: Uint8Array
        }
      >
      const boundaries = Object.fromEntries(
        climateTypeIds.map((climateTypeId) => {
          const boundaryDefinition = {
            url: `/climate/highlight-boundaries/${quality}/${climateTypeId}.png`,
            filename: `highlight-boundaries/${quality}/${climateTypeId}.png`,
            width: definition.width,
            height: definition.height,
          }
          const boundaryRgba = createClimateBoundaryRgba(
            rendered.climateTypeIndexes,
            definition.width,
            definition.height,
            climateTypeId,
            definition.boundaryWidth,
          )
          return [
            climateTypeId,
            {
              definition: boundaryDefinition,
              png: encodeRgbaPng(
                definition.width,
                definition.height,
                boundaryRgba,
              ),
            },
          ]
        }),
      ) as Record<
        ClimateTypeId,
        {
          definition: {
            url: string
            filename: string
            width: 2048 | 1024
            height: 1024 | 512
          }
          png: Uint8Array
        }
      >
      return [quality, { definition, png, highlights, boundaries }]
    }),
  ) as Record<
    keyof typeof outputDefinitions,
    {
      definition: (typeof outputDefinitions)[keyof typeof outputDefinitions]
      png: Uint8Array
      highlights: Record<
        ClimateTypeId,
        {
          definition: {
            url: string
            filename: string
            width: 2048 | 1024
            height: 1024 | 512
          }
          png: Uint8Array
        }
      >
      boundaries: Record<
        ClimateTypeId,
        {
          definition: {
            url: string
            filename: string
            width: 2048 | 1024
            height: 1024 | 512
          }
          png: Uint8Array
        }
      >
    }
  >

  const anchorClassifications = Object.fromEntries(
    Object.entries(anchors).map(([id, position]) => {
      const value = getSourceValue(raster, sourceWidth, sourceHeight, position)
      return [id, mapKoppenValueToClimateType(value, position)]
    }),
  )

  const manifest = climateLayerManifestSchema.parse({
    period: '1991–2020',
    source: {
      archiveName: 'koppen_geiger_tif.zip',
      archiveBytes: KOPPEN_ARCHIVE_BYTES,
      archiveMd5: KOPPEN_ARCHIVE_MD5,
      rasterPath: KOPPEN_RASTER_PATH,
      rasterWidth: sourceWidth,
      rasterHeight: sourceHeight,
    },
    palette,
    assets: Object.fromEntries(
      Object.entries(assets).map(([quality, asset]) => [
        quality,
        {
          url: asset.definition.url,
          width: asset.definition.width,
          height: asset.definition.height,
          bytes: asset.png.byteLength,
          sha256: createHash('sha256').update(asset.png).digest('hex'),
        },
      ]),
    ),
    highlightAssets: Object.fromEntries(
      Object.entries(assets).map(([quality, asset]) => [
        quality,
        Object.fromEntries(
          Object.entries(asset.highlights).map(([climateTypeId, highlight]) => [
            climateTypeId,
            {
              url: highlight.definition.url,
              width: highlight.definition.width,
              height: highlight.definition.height,
              bytes: highlight.png.byteLength,
              sha256: createHash('sha256').update(highlight.png).digest('hex'),
            },
          ]),
        ),
      ]),
    ),
    highlightBoundaryAssets: Object.fromEntries(
      Object.entries(assets).map(([quality, asset]) => [
        quality,
        Object.fromEntries(
          Object.entries(asset.boundaries).map(([climateTypeId, boundary]) => [
            climateTypeId,
            {
              url: boundary.definition.url,
              width: boundary.definition.width,
              height: boundary.definition.height,
              bytes: boundary.png.byteLength,
              sha256: createHash('sha256').update(boundary.png).digest('hex'),
            },
          ]),
        ),
      ]),
    ),
    anchors: anchorClassifications,
  })

  return { assets, manifest }
}

async function main() {
  const archivePath = process.env[archiveEnvironmentVariable]
  if (!archivePath) {
    throw new Error(
      `Set ${archiveEnvironmentVariable} to the pinned koppen_geiger_tif.zip archive`,
    )
  }
  const archiveBytes = new Uint8Array(await readFile(archivePath))
  const generated = await generateClimateAssetsFromArchive(archiveBytes)
  await mkdir(publicDirectory, { recursive: true })
  await Promise.all(
    Object.values(generated.assets).flatMap((asset) => [
      writeFile(
        path.join(publicDirectory, asset.definition.filename),
        asset.png,
      ),
      ...Object.values(asset.highlights).map(async (highlight) => {
        const outputPath = path.join(
          publicDirectory,
          highlight.definition.filename,
        )
        await mkdir(path.dirname(outputPath), { recursive: true })
        await writeFile(outputPath, highlight.png)
      }),
      ...Object.values(asset.boundaries).map(async (boundary) => {
        const outputPath = path.join(
          publicDirectory,
          boundary.definition.filename,
        )
        await mkdir(path.dirname(outputPath), { recursive: true })
        await writeFile(outputPath, boundary.png)
      }),
    ]),
  )
  await writeFile(
    manifestPath,
    await format(JSON.stringify(generated.manifest), { parser: 'json' }),
  )
}

if (import.meta.main) await main()
