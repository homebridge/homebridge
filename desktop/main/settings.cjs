'use strict'

/**
 * Small JSON-backed settings store kept in the Electron userData directory.
 *
 * Only desktop-shell preferences live here — everything about the bridge itself
 * stays in the user's `config.json`, which the bundled web UI owns.
 */

const { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs')
const { dirname, isAbsolute, join } = require('node:path')

const { app } = require('electron')

const { appConfig, defaultStoragePath } = require('./paths.cjs')

const SETTINGS_FILE = 'desktop-settings.json'

function defaults() {
  return {
    storagePath: defaultStoragePath(),
    uiPort: appConfig.defaultUiPort,
    startServerOnLaunch: true,
    startHidden: false,
    closeToTray: true,
    launchAtLogin: false,
    debugLogging: false,
    zoomFactor: 1,
    windowBounds: null,
  }
}

function settingsPath() {
  return join(app.getPath('userData'), SETTINGS_FILE)
}

/**
 * Coerce persisted values back into range — the file is user-editable, and a
 * bad value should degrade to the default rather than break startup.
 */
function sanitise(raw) {
  const base = defaults()
  if (!raw || typeof raw !== 'object') {
    return base
  }

  const port = Number(raw.uiPort)
  const zoom = Number(raw.zoomFactor)

  return {
    storagePath: typeof raw.storagePath === 'string' && isAbsolute(raw.storagePath) ? raw.storagePath : base.storagePath,
    uiPort: Number.isInteger(port) && port > 0 && port < 65536 ? port : base.uiPort,
    startServerOnLaunch: typeof raw.startServerOnLaunch === 'boolean' ? raw.startServerOnLaunch : base.startServerOnLaunch,
    startHidden: typeof raw.startHidden === 'boolean' ? raw.startHidden : base.startHidden,
    closeToTray: typeof raw.closeToTray === 'boolean' ? raw.closeToTray : base.closeToTray,
    launchAtLogin: typeof raw.launchAtLogin === 'boolean' ? raw.launchAtLogin : base.launchAtLogin,
    debugLogging: typeof raw.debugLogging === 'boolean' ? raw.debugLogging : base.debugLogging,
    zoomFactor: Number.isFinite(zoom) && zoom >= 0.5 && zoom <= 3 ? zoom : base.zoomFactor,
    windowBounds: raw.windowBounds && typeof raw.windowBounds === 'object' ? raw.windowBounds : null,
  }
}

let cached = null

function read() {
  if (cached) {
    return cached
  }

  try {
    cached = sanitise(JSON.parse(readFileSync(settingsPath(), 'utf8')))
  } catch {
    cached = defaults()
  }

  return cached
}

/**
 * Merge a partial update and persist it. Writing via a temporary file keeps the
 * settings readable if the app is killed mid-write.
 */
function update(patch) {
  cached = sanitise({ ...read(), ...patch })

  const target = settingsPath()
  const temporary = `${target}.tmp`

  if (!existsSync(dirname(target))) {
    mkdirSync(dirname(target), { recursive: true })
  }

  writeFileSync(temporary, `${JSON.stringify(cached, null, 2)}\n`)
  renameSync(temporary, target)

  return cached
}

module.exports = { defaults, read, settingsPath, update }
