import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { Plugin } from 'vite'

export function getDevelopmentAssetUrl(filename: string, projectRoot: string) {
  const relativePath = path.relative(projectRoot, filename)
  return relativePath.startsWith('..')
    ? `/@fs/${filename}`
    : `/${relativePath.split(path.sep).map(encodeURIComponent).join('/')}`
}

export function minifiedJsonAssets(): Plugin {
  const prefix = '\0scio-geo-minified-json:'
  let command: 'build' | 'serve' = 'build'
  let projectRoot = process.cwd()
  return {
    name: 'scio-geo-minified-json-assets',
    enforce: 'pre',
    configResolved(config) {
      command = config.command
      projectRoot = config.root
    },
    resolveId(source: string, importer?: string) {
      if (!importer) return null
      const [filename, query = ''] = source.split('?', 2)
      if (!new URLSearchParams(query).has('minified-url')) return null
      return `${prefix}${encodeURIComponent(path.resolve(path.dirname(importer), filename))}.js`
    },
    load(id: string) {
      if (!id.startsWith(prefix)) return null
      const filename = decodeURIComponent(id.slice(prefix.length, -3))
      if (process.env.VITEST) {
        return `export default ${JSON.stringify(filename)}`
      }
      if (command === 'serve') {
        const url = getDevelopmentAssetUrl(filename, projectRoot)
        return `export default ${JSON.stringify(url)}`
      }
      const source = JSON.stringify(
        JSON.parse(readFileSync(filename, 'utf8')) as unknown,
      )
      const referenceId = this.emitFile({
        type: 'asset',
        name: path.basename(filename),
        source,
      })
      return `export default import.meta.ROLLUP_FILE_URL_${referenceId}`
    },
  }
}
