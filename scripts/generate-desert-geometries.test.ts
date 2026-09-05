import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildDesertGeometryCatalog,
  generateDesertGeometryCatalogFromArchive,
} from './generate-desert-geometries'
import {
  desertGeometryDefinitions,
  NATURAL_EARTH_DESERT_ARCHIVE_SHA256,
} from './desert-geometry-content'

const archivePath = process.env.SCIO_GEO_DESERT_ARCHIVE

describe('desert geometry source contract', () => {
  it('declares 20 unique reviewed Natural Earth records', () => {
    expect(desertGeometryDefinitions).toHaveLength(20)
    expect(
      new Set(desertGeometryDefinitions.map((definition) => definition.id))
        .size,
    ).toBe(20)
    expect(
      new Set(
        desertGeometryDefinitions.map(
          (definition) => definition.naturalEarthNeId,
        ),
      ).size,
    ).toBe(20)
  })

  it('fails closed when a reviewed Natural Earth record is missing', () => {
    expect(() =>
      buildDesertGeometryCatalog(
        NATURAL_EARTH_DESERT_ARCHIVE_SHA256,
        new Map(),
      ),
    ).toThrow(/Missing Natural Earth desert record/)
  })
})

describe.skipIf(!archivePath)(
  'desert geometry generator reproducibility',
  () => {
    it('produces byte-equivalent data for the same pinned input', async () => {
      const bytes = new Uint8Array(await readFile(archivePath!))
      const first = await generateDesertGeometryCatalogFromArchive(bytes)
      const second = await generateDesertGeometryCatalogFromArchive(bytes)
      const committed = JSON.parse(
        await readFile(
          path.resolve(
            import.meta.dirname,
            '../src/data/generated/desert-geometries.json',
          ),
          'utf8',
        ),
      ) as unknown

      expect(JSON.stringify(first)).toBe(JSON.stringify(second))
      expect(first).toEqual(committed)
    })

    it('rejects bytes that do not match the pinned archive', async () => {
      const bytes = new Uint8Array(await readFile(archivePath!))
      bytes[0] ^= 0xff
      await expect(
        generateDesertGeometryCatalogFromArchive(bytes),
      ).rejects.toThrow(/SHA-256 mismatch/)
    })
  },
)
