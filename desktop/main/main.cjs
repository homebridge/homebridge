'use strict'

/**
 * Homebridge Desktop — Electron entry point.
 *
 * The app is a native shell around the Homebridge stack it bundles: a pinned
 * Node.js 22 runtime, Homebridge itself, and the homebridge-config-ui-x web UI.
 * The window shows a local boot screen while the server starts and then becomes
 * the web UI; the tray keeps the bridge running with the window closed.
 */

const { existsSync } = require('node:fs')
const process = require('node:process')

const { app, dialog, ipcMain, shell } = require('electron')

const menu = require('./menu.cjs')
const { appConfig, isBundleStaged, readStageInfo, storageLayout } = require('./paths.cjs')
const settings = require('./settings.cjs')
const { Supervisor } = require('./supervisor.cjs')
const tray = require('./tray.cjs')
const { uiUrl } = require('./uiEndpoint.cjs')
const windows = require('./windows.cjs')

const supervisor = new Supervisor()
let isQuitting = false

/**
 * Only the app's own pages may drive the server. The same preload is attached
 * to the web UI, so without this check any page loaded over http could start or
 * stop Homebridge through these channels.
 */
function isTrustedSender(event) {
  return (event.senderFrame?.url ?? '').startsWith('file://')
}

function versions() {
  const stage = readStageInfo()

  return {
    app: app.getVersion(),
    arch: stage?.arch ?? appConfig.nodeArch,
    chrome: process.versions.chrome,
    configUi: stage?.configUiVersion ?? null,
    crossStaged: stage?.crossStaged ?? false,
    electron: process.versions.electron,
    homebridge: stage?.homebridgeVersion ?? null,
    node: stage?.nodeVersion ?? appConfig.nodeVersion,
    productName: appConfig.productName,
  }
}

function bootstrapPayload() {
  return {
    bundleStaged: isBundleStaged(),
    logs: supervisor.getLogLines(),
    settings: settings.read(),
    state: supervisor.getState(),
    versions: versions(),
  }
}

const actions = {
  start: () => supervisor.start(settings.read()),
  stop: () => supervisor.stop(),
  restart: () => supervisor.restart(settings.read()),
  showWindow: () => {
    if (!windows.getMainWindow()) {
      windows.createMainWindow({ onCloseRequested: handleMainWindowClose })
    }
    windows.showWindow()
  },
  showUi: () => {
    const { uiUrl: url } = supervisor.getState()
    if (supervisor.status === 'running' && url) {
      windows.showUi(url)
    }
  },
  openInBrowser: () => {
    const port = supervisor.getState().uiPort
    if (port) {
      void shell.openExternal(uiUrl(port))
    }
  },
  openStorage: () => {
    const { storagePath } = storageLayout(settings.read().storagePath)
    void shell.openPath(storagePath)
  },
  openLogFile: () => {
    const { logPath } = storageLayout(settings.read().storagePath)
    if (existsSync(logPath)) {
      void shell.openPath(logPath)
      return
    }

    void dialog.showMessageBox(windows.getMainWindow() ?? undefined, {
      type: 'info',
      title: 'No log file yet',
      message: 'Homebridge has not written a log file yet.',
      detail: `It will appear at:\n${logPath}`,
      buttons: ['OK'],
    })
  },
  openSettings: () => windows.openSettingsWindow(),
  showAbout,
  quit: () => app.quit(),
}

function showAbout({ detail, version }) {
  void dialog.showMessageBox(windows.getMainWindow() ?? undefined, {
    type: 'info',
    title: `About ${appConfig.productName}`,
    message: `${appConfig.productName} ${version}`,
    detail,
    buttons: ['OK'],
  })
}

/**
 * Closing the window normally leaves the bridge running in the tray, which is
 * the behaviour people expect from a home automation service.
 */
function handleMainWindowClose() {
  if (isQuitting) {
    return true
  }

  if (settings.read().closeToTray) {
    return false
  }

  actions.quit()
  return false
}

/**
 * Keep the window, tray and renderers in step with the server.
 */
function onSupervisorState(state) {
  tray.update(state)
  windows.broadcast('hbd:state', state)

  if (state.status === 'running' && state.uiUrl) {
    windows.showUi(state.uiUrl)
  } else if (windows.isShowingUi()) {
    // The server went away underneath the web UI — take the window back so the
    // user sees the reason instead of a browser error page.
    windows.showShell()
  }
}

function applyLaunchAtLogin(enabled) {
  if (process.platform === 'linux') {
    return
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: ['--hidden'],
  })
}

function registerIpc() {
  ipcMain.handle('hbd:bootstrap', (event) => {
    if (!isTrustedSender(event)) {
      return null
    }
    return bootstrapPayload()
  })

  ipcMain.handle('hbd:server-action', async (event, action) => {
    if (!isTrustedSender(event)) {
      return null
    }

    switch (action) {
      case 'start':
        actions.start()
        break
      case 'stop':
        await supervisor.stop()
        break
      case 'restart':
        await supervisor.restart(settings.read())
        break
      default:
        break
    }

    return supervisor.getState()
  })

  ipcMain.handle('hbd:settings-save', async (event, patch) => {
    if (!isTrustedSender(event) || !patch || typeof patch !== 'object') {
      return settings.read()
    }

    const previous = settings.read()
    const next = settings.update(patch)

    if (next.zoomFactor !== previous.zoomFactor) {
      windows.applyZoom(next.zoomFactor)
    }
    if (next.launchAtLogin !== previous.launchAtLogin) {
      applyLaunchAtLogin(next.launchAtLogin)
    }

    windows.broadcast('hbd:settings', next)

    // These three decide how the server process is launched, so a running
    // server has to be restarted for them to take effect.
    const needsRestart = next.storagePath !== previous.storagePath
      || next.uiPort !== previous.uiPort
      || next.debugLogging !== previous.debugLogging

    if (needsRestart && supervisor.status !== 'stopped') {
      await supervisor.restart(next)
    }

    return next
  })

  ipcMain.handle('hbd:pick-storage', async (event) => {
    if (!isTrustedSender(event)) {
      return null
    }

    const result = await dialog.showOpenDialog(windows.getSettingsWindow() ?? windows.getMainWindow() ?? undefined, {
      title: 'Choose the Homebridge storage folder',
      defaultPath: settings.read().storagePath,
      properties: ['openDirectory', 'createDirectory'],
    })

    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('hbd:open', (event, target) => {
    if (!isTrustedSender(event)) {
      return false
    }

    switch (target) {
      case 'browser':
        actions.openInBrowser()
        break
      case 'log':
        actions.openLogFile()
        break
      case 'settings':
        actions.openSettings()
        break
      case 'storage':
        actions.openStorage()
        break
      case 'ui':
        actions.showUi()
        break
      default:
        return false
    }

    return true
  })
}

function start() {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  app.setAppUserModelId(appConfig.appId)

  app.on('second-instance', () => actions.showWindow())

  app.on('activate', () => actions.showWindow())

  app.on('before-quit', (event) => {
    if (isQuitting) {
      return
    }

    // Stop the server tree before Electron tears the process down, otherwise
    // Homebridge and its child bridges are orphaned and keep their ports.
    event.preventDefault()
    isQuitting = true

    void (async () => {
      try {
        await supervisor.shutdown()
      } finally {
        tray.destroy()
        app.exit(0)
      }
    })()
  })

  app.whenReady().then(() => {
    const stored = settings.read()

    // `--hidden` is what the login item passes; it must not be persisted, or a
    // manual launch would come up invisible too.
    const startHidden = stored.startHidden || process.argv.includes('--hidden')

    supervisor.on('state', onSupervisorState)
    supervisor.on('log', line => windows.broadcast('hbd:log', line))

    registerIpc()
    menu.build(actions)
    tray.create(actions)
    windows.createMainWindow({ onCloseRequested: handleMainWindowClose, startHidden })
    applyLaunchAtLogin(stored.launchAtLogin)

    if (stored.startServerOnLaunch) {
      supervisor.start(stored)
    } else {
      tray.update(supervisor.getState())
    }
  })
}

start()
