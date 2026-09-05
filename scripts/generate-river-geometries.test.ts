import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { generateRiverGeometryCatalogFromArchive } from './generate-river-geometries'

const archivePath = process.env.SCIO_GEO_RIVER_ARCHIVE

describe.skipIf(!archivePath)(
  'river geometry generator reproducibility',
  () => {
    it('produces byte-equivalent data for the same pinned input', async () => {
      const bytes = new Uint8Array(await readFile(archivePath!))
      const first = await generateRiverGeometryCatalogFromArchive(bytes)
      const second = await generateRiverGeometryCatalogFromArchive(bytes)
      const committed = JSON.parse(
        await readFile(
          path.resolve(
            import.meta.dirname,
            '../src/data/generated/river-geometries.json',
          ),
          'utf8',
        ),
      ) as unknown

      expect(JSON.stringify(first)).toBe(JSON.stringify(second))
      expect(first).toEqual(committed)
    })
  },
)
