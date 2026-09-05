import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { generateMountainGeometryCatalogFromArchive } from './generate-mountain-geometries'

const archivePath = process.env.SCIO_GEO_MOUNTAIN_ARCHIVE

describe.skipIf(!archivePath)(
  'mountain geometry generator reproducibility',
  () => {
    it('produces byte-equivalent data for the same pinned input', async () => {
      const bytes = new Uint8Array(await readFile(archivePath!))
      const first = await generateMountainGeometryCatalogFromArchive(bytes)
      const second = await generateMountainGeometryCatalogFromArchive(bytes)
      const committed = JSON.parse(
        await readFile(
          path.resolve(
            import.meta.dirname,
            '../src/data/generated/mountain-geometries.json',
          ),
          'utf8',
        ),
      ) as unknown

      expect(JSON.stringify(first)).toBe(JSON.stringify(second))
      expect(first).toEqual(committed)
    })
  },
)
