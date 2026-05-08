// ESM version: Sync @matter/main version into getMatterJsVersion in utils.ts

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const pkgPath = path.resolve(__dirname, '../package.json')
const utilsPath = path.resolve(__dirname, '../src/matter/utils.ts')
const pkgRaw = await fs.readFile(pkgPath, 'utf8')
const pkg = JSON.parse(pkgRaw)

const matterVersion = pkg.dependencies && pkg.dependencies['@matter/main']
if (!matterVersion) {
  console.error('No @matter/main dependency found in package.json')
  process.exit(1)
}

const utilsSrc = await fs.readFile(utilsPath, 'utf8')

// Replace the version string in getMatterJsVersion (look for 'return "..."' or 'return \"...\"')
const newSrc = utilsSrc.replace(
  /export async function getMatterJsVersion\(\): Promise<string> \{[^}]*?return ['"]([\w\-.]+)['"][^}]*\}/,
  `export async function getMatterJsVersion(): Promise<string> {\n  return '${matterVersion}'\n}`,
)

if (utilsSrc !== newSrc) {
  await fs.writeFile(utilsPath, newSrc)
  console.log(`Updated getMatterJsVersion() to return ${matterVersion}`)
} else {
  console.log('getMatterJsVersion() already up to date')
}
