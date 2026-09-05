import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { getDevelopmentAssetUrl } from './minified-json-assets'

describe('minified JSON assets', () => {
  it('serves project geometry files through a fetchable Vite development URL', () => {
    const projectRoot = path.resolve('/workspace/scio geo')
    const filename = path.join(
      projectRoot,
      'src/data/generated/country-boundaries.json',
    )

    expect(getDevelopmentAssetUrl(filename, projectRoot)).toBe(
      '/src/data/generated/country-boundaries.json',
    )
  })

  it('uses the Vite filesystem route for assets outside the project root', () => {
    expect(
      getDevelopmentAssetUrl('/shared/maps/world.json', '/workspace/scio-geo'),
    ).toBe('/@fs//shared/maps/world.json')
  })
})
