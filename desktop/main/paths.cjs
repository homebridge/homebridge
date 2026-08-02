'use strict'

/**
 * Resolves everything the app needs on disk, for both a packaged install and a
 * plain `npm run desktop:start` against the staging directory.
 *
 * Packaged (Windows):            Development:
 *   resources/node/node.exe        .desktop-build/staging/node/node.exe
 *   resources/server/node_modules  .desktop-build/staging/server/node_modules
 */

const { existsSync, readFileSync } = require('node:fs')
const { homedir } = require('node:os')
const { join, resolve } = require('node:path')
const process = require('node:process')

const { app } = require('electron')

const repoRoot = resolve(__dirname, '../..')

/**
 * Root of the staged payload: `resources/` in a packaged app, the staging
 * directory produced by `scripts/desktop/*` otherwise.
 */
const bundleRoot = app.isPackaged
  ? process.resourcesPath
  : join(repoRoot, '.desktop-build', 'staging')

const runtimeDir = join(bundleRoot, 'node')
const serverDir = join(bundleRoot, 'server')
const serverModulesDir = join(serverDir, 'node_modules')
const configUiDir = join(serverModulesDir, 'homebridge-config-ui-x')
const hbServiceScript = join(configUiDir, 'dist', 'bin', 'hb-service.js')

const appConfig = JSON.parse(readFileSync(join(__dirname, '..', 'app-config.json'), 'utf8'))

/**
 * The Node.js runtime that executes Homebridge.
 *
 * The bundled runtime is a Windows build, so a development run on macOS or
 * Linux falls back to the host's `node` — the app itself is unchanged, only the
 * interpreter differs.
 */
function resolveNodeBinary() {
  if (process.env.HOMEBRIDGE_DESKTOP_NODE_BIN) {
    return process.env.HOMEBRIDGE_DESKTOP_NODE_BIN
  }

  const bundled = join(runtimeDir, process.platform === 'win32' ? 'node.exe' : join('bin', 'node'))
  return existsSync(bundled) ? bundled : 'node'
}

/**
 * Versions baked into this build, shown on the boot screen and in About.
 */
function readStageInfo() {
  try {
    return JSON.parse(readFileSync(join(serverDir, '.stage-info.json'), 'utf8'))
  } catch {
    return null
  }
}

/**
 * Default Homebridge storage directory — the same `~/.homebridge` the CLI uses,
 * so an existing installation is picked up rather than orphaned.
 */
function defaultStoragePath() {
  return join(homedir(), '.homebridge')
}

/**
 * Everything derived from the user's chosen storage directory.
 */
function storageLayout(storagePath) {
  return {
    storagePath,
    configPath: join(storagePath, 'config.json'),
    logPath: join(storagePath, 'homebridge.log'),
    // `homebridge-config-ui-x` treats the custom plugin path as a node_modules
    // directory, matching the official Debian/Synology package layout.
    pluginPath: join(storagePath, 'node_modules'),
  }
}

/**
 * True when the payload needed to run Homebridge is actually present. A missing
 * payload means the staging scripts were never run.
 */
function isBundleStaged() {
  return existsSync(hbServiceScript) && existsSync(join(serverModulesDir, 'homebridge', 'package.json'))
}

module.exports = {
  appConfig,
  bundleRoot,
  configUiDir,
  defaultStoragePath,
  hbServiceScript,
  isBundleStaged,
  readStageInfo,
  repoRoot,
  resolveNodeBinary,
  runtimeDir,
  serverDir,
  serverModulesDir,
  storageLayout,
}
