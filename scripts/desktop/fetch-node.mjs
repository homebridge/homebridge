#!/usr/bin/env node

/**
 * Download the Node.js 22 Windows runtime that gets bundled into the desktop
 * app and extract it to `.desktop-build/staging/node`.
 *
 * The runtime is what actually executes Homebridge: Electron's own Node build
 * is not used, so native plugin modules resolve against a stock Node 22 ABI and
 * the bundled npm can install plugins without any system-wide Node install.
 *
 * The archive is cached in `.desktop-build/cache` and always checked against
 * the SHASUMS256.txt published alongside it.
 *
 * Usage: node scripts/desktop/fetch-node.mjs [--force]
 */

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

import { cacheDir, nodeStagingDir, readAppConfig, resolveNodeArch, resolveNodeVersion } from './lib/paths.mjs'
import { extractZip } from './lib/zip.mjs'

const DIST_BASE_URL = process.env.HOMEBRIDGE_DESKTOP_NODE_MIRROR || 'https://nodejs.org/dist'

function log(message) {
  process.stdout.write(`[fetch-node] ${message}\n`)
}

async function download(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

/**
 * Pull the expected digest for `fileName` out of the release's SHASUMS256.txt.
 */
function findExpectedDigest(shasums, fileName) {
  for (const line of shasums.split('\n')) {
    const [digest, name] = line.trim().split(/\s+/)
    if (name === fileName) {
      return digest
    }
  }
  throw new Error(`${fileName} is not listed in SHASUMS256.txt`)
}

async function readCachedArchive(archivePath, expectedDigest) {
  if (!existsSync(archivePath)) {
    return null
  }

  const cached = await readFile(archivePath)
  if (createHash('sha256').update(cached).digest('hex') === expectedDigest) {
    return cached
  }

  log('cached archive failed checksum verification, re-downloading')
  return null
}

async function main() {
  const force = process.argv.includes('--force')
  const appConfig = readAppConfig()
  const version = resolveNodeVersion(appConfig)
  const arch = resolveNodeArch(appConfig)

  const distribution = `node-v${version}-win-${arch}`
  const fileName = `${distribution}.zip`
  const releaseUrl = `${DIST_BASE_URL}/v${version}`
  const archivePath = join(cacheDir, fileName)
  const stampPath = join(nodeStagingDir, '.node-version')

  if (!force && existsSync(stampPath) && (await readFile(stampPath, 'utf8')).trim() === `v${version}-win-${arch}`) {
    log(`Node.js v${version} (win-${arch}) already staged, nothing to do`)
    return
  }

  await mkdir(cacheDir, { recursive: true })

  log(`resolving ${fileName} from ${releaseUrl}`)
  const shasums = (await download(`${releaseUrl}/SHASUMS256.txt`)).toString('utf8')
  const expectedDigest = findExpectedDigest(shasums, fileName)

  let archive = force ? null : await readCachedArchive(archivePath, expectedDigest)

  if (archive) {
    log(`using cached ${fileName}`)
  } else {
    log(`downloading ${fileName} (~30 MB)`)
    archive = await download(`${releaseUrl}/${fileName}`)

    const actualDigest = createHash('sha256').update(archive).digest('hex')
    if (actualDigest !== expectedDigest) {
      throw new Error(`Checksum mismatch for ${fileName}: expected ${expectedDigest}, got ${actualDigest}`)
    }

    await writeFile(archivePath, archive)
    log('checksum verified')
  }

  log(`extracting to ${nodeStagingDir}`)
  await rm(nodeStagingDir, { recursive: true, force: true })
  await mkdir(nodeStagingDir, { recursive: true })

  // The archive nests everything under `node-v<version>-win-<arch>/`; drop that
  // prefix so `node.exe` lands directly in the staging root.
  const prefix = `${distribution}/`
  const written = await extractZip(archive, nodeStagingDir, {
    rewrite: name => (name.startsWith(prefix) ? name.slice(prefix.length) : null),
  })

  if (!existsSync(join(nodeStagingDir, 'node.exe'))) {
    throw new Error('Extraction completed but node.exe is missing from the staged runtime')
  }
  if (!existsSync(join(nodeStagingDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'))) {
    throw new Error('Extraction completed but the bundled npm is missing from the staged runtime')
  }

  await writeFile(stampPath, `v${version}-win-${arch}\n`)
  log(`staged ${written} files for Node.js v${version} (win-${arch})`)
}

main().catch((error) => {
  process.stderr.write(`[fetch-node] ${error.message}\n`)
  process.exitCode = 1
})
