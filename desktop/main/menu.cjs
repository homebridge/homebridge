'use strict'

/**
 * Application menu.
 *
 * The bundled web UI has no browser chrome around it, so the menu carries the
 * things a browser would normally provide (reload, zoom, dev tools) alongside
 * the server controls that only the desktop shell can perform.
 */

const process = require('node:process')

const { app, Menu, shell } = require('electron')

const { appConfig, readStageInfo } = require('./paths.cjs')
const settings = require('./settings.cjs')
const windows = require('./windows.cjs')

const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]

function stepZoom(direction) {
  const current = settings.read().zoomFactor
  const index = ZOOM_STEPS.reduce(
    (best, value, i) => (Math.abs(value - current) < Math.abs(ZOOM_STEPS[best] - current) ? i : best),
    0,
  )
  const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))]

  settings.update({ zoomFactor: next })
  windows.applyZoom(next)
}

function aboutDetail() {
  const stage = readStageInfo()

  return [
    `Homebridge ${stage?.homebridgeVersion ?? 'unknown'}`,
    `Homebridge UI ${stage?.configUiVersion ?? 'unknown'}`,
    `Bundled Node.js ${stage?.nodeVersion ?? appConfig.nodeVersion} (${stage?.arch ?? appConfig.nodeArch})`,
    `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
  ].join('\n')
}

function build(actions) {
  const template = [
    {
      label: 'Homebridge',
      submenu: [
        { label: 'Start', click: () => actions.start() },
        { label: 'Restart', click: () => actions.restart() },
        { label: 'Stop', click: () => actions.stop() },
        { type: 'separator' },
        { label: 'Open Web UI in Browser', click: () => actions.openInBrowser() },
        { label: 'Open Storage Folder', click: () => actions.openStorage() },
        { label: 'Open Log File', click: () => actions.openLogFile() },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => actions.openSettings() },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => actions.quit() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload Web UI', accelerator: 'CmdOrCtrl+R', click: () => windows.reloadUi() },
        { label: 'Status and Logs', accelerator: 'CmdOrCtrl+L', click: () => windows.showShell() },
        { label: 'Back to Web UI', accelerator: 'CmdOrCtrl+U', click: () => actions.showUi() },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: () => stepZoom(1) },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => stepZoom(-1) },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            settings.update({ zoomFactor: 1 })
            windows.applyZoom(1)
          },
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { label: 'Toggle Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Homebridge Documentation', click: () => shell.openExternal('https://github.com/homebridge/homebridge/wiki') },
        { label: 'Verified Plugins', click: () => shell.openExternal('https://github.com/homebridge/homebridge/wiki/Verified-Plugins') },
        { type: 'separator' },
        {
          label: `About ${appConfig.productName}`,
          click: () => actions.showAbout({ version: app.getVersion(), detail: aboutDetail() }),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

module.exports = { aboutDetail, build }
