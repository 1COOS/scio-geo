import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildWaterbodyGeometryCatalog,
  generateWaterbodyGeometryCatalogFromArchives,
} from './generate-waterbody-geometries'
import {
  NATURAL_EARTH_LAKES_ARCHIVE_SHA256,
  NATURAL_EARTH_MARINE_ARCHIVE_SHA256,
  waterbodyGeometryDefinitions,
} from './waterbody-geometry-content'

const archivePath = process.env.SCIO_GEO_WATERBODY_ARCHIVE
const lakeArchivePath = process.env.SCIO_GEO_LAKE_ARCHIVE

describe('waterbody geometry source contract', () => {
  it('declares 65 sourced objects and two reviewed supplements', () => {
    expect(waterbodyGeometryDefinitions).toHaveLength(67)
    expect(
      waterbodyGeometryDefinitions.filter(
        (definition) => definition.naturalEarthNeIds.length > 0,
      ),
    ).toHaveLength(65)
    expect(
      waterbodyGeometryDefinitions
        .filter((definition) => definition.reviewedOutline)
        .map((definition) => definition.id),
    ).toEqual(['bering-strait', 'strait-of-hormuz'])
    expect(
      new Set(waterbodyGeometryDefinitions.map((definition) => definition.id))
        .size,
    ).toBe(67)
  })

  it('fails closed when a reviewed Natural Earth record is missing', () => {
    expect(() =>
      buildWaterbodyGeometryCatalog({
        marine: {
          archiveSha256: NATURAL_EARTH_MARINE_ARCHIVE_SHA256,
          geometriesByRecord: new Map(),
        },
        lakes: {
          archiveSha256: NATURAL_EARTH_LAKES_ARCHIVE_SHA256,
          geometriesByRecord: new Map(),
        },
      }),
    ).toThrow(/Missing Natural Earth marine record/)
  })
})

describe.skipIf(!archivePath || !lakeArchivePath)(
  'waterbody geometry generator reproducibility',
  () => {
    it('produces byte-equivalent data for the same pinned input', async () => {
      const marineBytes = new Uint8Array(await readFile(archivePath!))
      const lakeBytes = new Uint8Array(await readFile(lakeArchivePath!))
      const first = await generateWaterbodyGeometryCatalogFromArchives(
        marineBytes,
        lakeBytes,
      )
      const second = await generateWaterbodyGeometryCatalogFromArchives(
        marineBytes,
        lakeBytes,
      )
      const committed = JSON.parse(
        await readFile(
          path.resolve(
            import.meta.dirname,
            '../src/data/generated/waterbody-geometries.json',
          ),
          'utf8',
        ),
      ) as unknown

      expect(JSON.stringify(first)).toBe(JSON.stringify(second))
      expect(first).toEqual(committed)
    })

    it('rejects bytes that do not match the pinned archive', async () => {
      const marineBytes = new Uint8Array(await readFile(archivePath!))
      const lakeBytes = new Uint8Array(await readFile(lakeArchivePath!))
      lakeBytes[0] ^= 0xff
      await expect(
        generateWaterbodyGeometryCatalogFromArchives(marineBytes, lakeBytes),
      ).rejects.toThrow(/SHA-256 mismatch/)
    })
  },
)
