import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function loadPackageJson(): any {
  const packageJSONPath = join(__dirname, '../package.json')
  return JSON.parse(readFileSync(packageJSONPath, { encoding: 'utf8' }))
}

export default function getVersion(): string {
  return loadPackageJson().version
}

export function getRequiredNodeVersion(): string {
  return loadPackageJson().engines.node
}
