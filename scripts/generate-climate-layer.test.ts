// @vitest-environment node

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  climateOceanRgb,
  climateTypeIds,
} from '../src/data/climateLearningSchema'
import {
  createClimateBoundaryRgba,
  createClimateHighlightRgba,
  generateClimateAssetsFromArchive,
  renderClimateRaster,
} from './generate-climate-layer'

const archivePath = process.env.SCIO_GEO_KOPPEN_ARCHIVE

function getPixel(rgba: Uint8Array, width: number, x: number, y: number) {
  const offset = (y * width + x) * 4
  return Array.from(rgba.slice(offset, offset + 4))
}

describe('climate highlight raster generation', () => {
  it('initializes ocean and no-data pixels as opaque deep blue', () => {
    const rendered = renderClimateRaster(new Uint8Array([0]), 1, 1, 1, 1)

    expect(getPixel(rendered.rgba, 1, 0, 0)).toEqual([...climateOceanRgb, 255])
    expect(Array.from(rendered.climateTypeIndexes)).toEqual([-1])
  })

  it('preserves other pixels and keeps seam-spanning interiors continuous', () => {
    const width = 4
    const height = 3
    const rainforestIndex = climateTypeIds.indexOf('tropical-rainforest')
    const desertIndex = climateTypeIds.indexOf('tropical-desert')
    const indexes = new Int8Array(width * height)
    indexes.fill(-1)
    const rgba = new Uint8Array(width * height * 4)
    for (let offset = 0; offset < rgba.length; offset += 4) {
      rgba.set([...climateOceanRgb, 255], offset)
    }

    for (let y = 0; y < height; y += 1) {
      for (const x of [3, 0, 1]) {
        indexes[y * width + x] = rainforestIndex
        rgba.set([21, 108, 54, 255], (y * width + x) * 4)
      }
    }
    indexes[width + 2] = desertIndex
    rgba.set([231, 179, 79, 255], (width + 2) * 4)

    const highlighted = createClimateHighlightRgba(
      rgba,
      indexes,
      width,
      height,
      'tropical-rainforest',
    )

    expect(getPixel(highlighted, width, 0, 1)).toEqual([103, 159, 124, 255])
    expect(getPixel(highlighted, width, 1, 1)).toEqual([255, 242, 168, 255])
    expect(getPixel(highlighted, width, 2, 1)).toEqual([231, 179, 79, 255])
    expect(getPixel(highlighted, width, 2, 0)).toEqual([
      ...climateOceanRgb,
      255,
    ])
  })

  it('rejects mismatched raster dimensions', () => {
    expect(() =>
      createClimateHighlightRgba(
        new Uint8Array(4),
        new Int8Array(2),
        1,
        1,
        'tropical-rainforest',
      ),
    ).toThrow('dimensions do not match')
  })

  it('creates exact inward boundary widths without filling interiors', () => {
    const width = 9
    const height = 9
    const rainforestIndex = climateTypeIds.indexOf('tropical-rainforest')
    const indexes = new Int8Array(width * height)
    indexes.fill(rainforestIndex)

    const balancedBoundary = createClimateBoundaryRgba(
      indexes,
      width,
      height,
      'tropical-rainforest',
      3,
    )
    expect(getPixel(balancedBoundary, width, 4, 2)).toEqual([
      255, 255, 255, 255,
    ])
    expect(getPixel(balancedBoundary, width, 4, 3)).toEqual([0, 0, 0, 0])

    const lowBoundary = createClimateBoundaryRgba(
      indexes,
      width,
      height,
      'tropical-rainforest',
      2,
    )
    expect(getPixel(lowBoundary, width, 4, 1)).toEqual([255, 255, 255, 255])
    expect(getPixel(lowBoundary, width, 4, 2)).toEqual([0, 0, 0, 0])
  })

  it('keeps a seam-spanning boundary continuous across the antimeridian', () => {
    const width = 7
    const height = 7
    const rainforestIndex = climateTypeIds.indexOf('tropical-rainforest')
    const indexes = new Int8Array(width * height)
    indexes.fill(-1)
    for (let y = 0; y < height; y += 1) {
      for (const x of [6, 0, 1]) indexes[y * width + x] = rainforestIndex
    }
    const boundary = createClimateBoundaryRgba(
      indexes,
      width,
      height,
      'tropical-rainforest',
      1,
    )
    expect(getPixel(boundary, width, 0, 3)).toEqual([0, 0, 0, 0])
    expect(getPixel(boundary, width, 1, 3)).toEqual([255, 255, 255, 255])
    expect(getPixel(boundary, width, 2, 3)).toEqual([0, 0, 0, 0])
  })
})

describe.skipIf(!archivePath)('climate layer generator reproducibility', () => {
  it('reproduces the committed manifest and PNG assets', async () => {
    const archive = new Uint8Array(await readFile(archivePath!))
    const generated = await generateClimateAssetsFromArchive(archive)
    const projectRoot = path.resolve(import.meta.dirname, '..')
    const committedManifest = JSON.parse(
      await readFile(
        path.join(projectRoot, 'src/data/generated/climate-layer.json'),
        'utf8',
      ),
    ) as unknown
    expect(generated.manifest).toEqual(committedManifest)
    for (const asset of Object.values(generated.assets)) {
      const committed = new Uint8Array(
        await readFile(
          path.join(projectRoot, 'public/climate', asset.definition.filename),
        ),
      )
      expect(asset.png).toEqual(committed)
      for (const highlight of Object.values(asset.highlights)) {
        const committedHighlight = new Uint8Array(
          await readFile(
            path.join(
              projectRoot,
              'public/climate',
              highlight.definition.filename,
            ),
          ),
        )
        expect(highlight.png).toEqual(committedHighlight)
      }
      for (const boundary of Object.values(asset.boundaries)) {
        const committedBoundary = new Uint8Array(
          await readFile(
            path.join(
              projectRoot,
              'public/climate',
              boundary.definition.filename,
            ),
          ),
        )
        expect(boundary.png).toEqual(committedBoundary)
      }
    }
  }, 30_000)
})
