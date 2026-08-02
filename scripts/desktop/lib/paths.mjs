/**
 * Shared filesystem layout for the desktop build scripts.
 *
 * Everything the desktop build produces lives under `.desktop-build/` so a
 * regular `npm run build` (which only touches `dist/`) is never disturbed:
 *
 *   .desktop-build/cache            downloaded archives, reused between builds
 *   .desktop-build/staging/node     bundled Node.js runtime (node.exe + npm)
 *   .desktop-build/staging/server   homebridge + homebridge-config-ui-x
 *   .desktop-build/release          electron-builder output
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const repoRoot = resolve(__dirname, '../../..')
export const desktopDir = join(repoRoot, 'desktop')
export const buildDir = join(repoRoot, '.desktop-build')
export const cacheDir = join(buildDir, 'cache')
export const stagingDir = join(buildDir, 'staging')
export const nodeStagingDir = join(stagingDir, 'node')
export const serverStagingDir = join(stagingDir, 'server')
export const releaseDir = join(buildDir, 'release')
export const resourcesDir = join(desktopDir, 'resources')

/**
 * Versions and identity shared by the build scripts and the running app.
 */
export function readAppConfig() {
  return JSON.parse(readFileSync(join(desktopDir, 'app-config.json'), 'utf8'))
}

/**
 * The Node.js version to bundle. `HOMEBRIDGE_DESKTOP_NODE_VERSION` overrides
 * the pinned version so a build can be tested against a newer Node 22 release
 * without editing the checked-in config.
 */
export function resolveNodeVersion(appConfig = readAppConfig()) {
  const version = process.env.HOMEBRIDGE_DESKTOP_NODE_VERSION || appConfig.nodeVersion
  const normalised = version.startsWith('v') ? version.slice(1) : version

  if (!/^22\.\d+\.\d+$/.test(normalised)) {
    throw new Error(`Homebridge Desktop bundles Node.js 22, refusing to bundle "${normalised}"`)
  }

  return normalised
}

/**
 * The CPU architecture of the bundled Windows runtime.
 */
export function resolveNodeArch(appConfig = readAppConfig()) {
  const arch = process.env.HOMEBRIDGE_DESKTOP_NODE_ARCH || appConfig.nodeArch

  if (!['x64', 'arm64'].includes(arch)) {
    throw new Error(`Unsupported Windows architecture "${arch}", expected x64 or arm64`)
  }

  return arch
}
