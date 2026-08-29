import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface PackageMetadata {
  version: string
  engines: {
    node: string
  }
}

const packageJSONPath = join(__dirname, '../package.json')
const packageMetadata = JSON.parse(readFileSync(packageJSONPath, 'utf8')) as PackageMetadata

export default function getVersion(): string {
  return packageMetadata.version
}

export function getRequiredNodeVersion(): string {
  return packageMetadata.engines.node
}
