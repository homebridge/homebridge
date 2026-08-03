'use strict'

/**
 * System tray icon.
 *
 * Homebridge is a background service, so the app is designed to keep running
 * with its window closed. The tray is what makes that discoverable: it shows
 * whether the bridge is up and offers the same start/stop controls as the menu.
 */

const { join } = require('node:path')

const { Menu, nativeImage, Tray } = require('electron')

const { appConfig } = require('./paths.cjs')

const ICON = join(__dirname, '..', 'resources', 'tray.png')

const STATUS_LABELS = {
  error: 'Stopped — needs attention',
  running: 'Running',
  starting: 'Starting…',
  stopped: 'Stopped',
  stopping: 'Stopping…',
}

let tray = null
let actions = null
let lastState = { status: 'stopped' }

function buildMenu() {
  const running = lastState.status === 'running'
  const busy = lastState.status === 'starting' || lastState.status === 'stopping'

  return Menu.buildFromTemplate([
    { label: `${appConfig.productName} — ${STATUS_LABELS[lastState.status] ?? lastState.status}`, enabled: false },
    { type: 'separator' },
    { label: 'Open Window', click: () => actions.showWindow() },
    { label: 'Open Web UI in Browser', enabled: running, click: () => actions.openInBrowser() },
    { type: 'separator' },
    { label: 'Start Homebridge', enabled: !running && !busy, click: () => actions.start() },
    { label: 'Restart Homebridge', enabled: running, click: () => actions.restart() },
    { label: 'Stop Homebridge', enabled: running || busy, click: () => actions.stop() },
    { type: 'separator' },
    { label: 'Settings…', click: () => actions.openSettings() },
    { label: `Quit ${appConfig.productName}`, click: () => actions.quit() },
  ])
}

function refresh() {
  if (!tray || tray.isDestroyed()) {
    return
  }

  tray.setToolTip(`${appConfig.productName} — ${STATUS_LABELS[lastState.status] ?? lastState.status}`)
  tray.setContextMenu(buildMenu())
}

function create(trayActions) {
  actions = trayActions

  const image = nativeImage.createFromPath(ICON)
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
  tray.on('click', () => actions.showWindow())
  tray.on('double-click', () => actions.showWindow())
  refresh()

  return tray
}

function update(state) {
  lastState = state
  refresh()
}

function destroy() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy()
  }
  tray = null
}

module.exports = { create, destroy, update }
