'use strict'

/**
 * Window management.
 *
 * The main window is the whole product: it opens on a local boot screen and,
 * once the bundled web UI answers, navigates to it. Everything after that point
 * is homebridge-config-ui-x rendered inside Electron rather than a browser.
 */

const { join } = require('node:path')

const { BrowserWindow, shell } = require('electron')

const { appConfig } = require('./paths.cjs')
const settings = require('./settings.cjs')

const SHELL_PAGE = join(__dirname, '..', 'renderer', 'shell.html')
const SETTINGS_PAGE = join(__dirname, '..', 'renderer', 'settings.html')
const SHELL_PRELOAD = join(__dirname, '..', 'preload', 'shell.cjs')
const ICON = join(__dirname, '..', 'resources', 'icon.png')

// One persistent session so the web UI's login stays valid between launches.
const PARTITION = 'persist:homebridge-ui'

let mainWindow = null
let settingsWindow = null
let currentUiOrigin = null

function webPreferences() {
  return {
    preload: SHELL_PRELOAD,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    partition: PARTITION,
    spellcheck: false,
  }
}

/**
 * Send links that are not part of the web UI to the user's browser instead of
 * opening a chrome-less Electron window for them.
 */
function attachNavigationPolicy(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const isShell = url.startsWith('file://')
    const isUi = currentUiOrigin && url.startsWith(currentUiOrigin)

    if (!isShell && !isUi) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })
}

let persistBoundsTimer = null

/**
 * Remember the window geometry. Debounced because resize and move fire
 * continuously while dragging, and each write touches disk.
 */
function persistBounds({ immediate = false } = {}) {
  if (persistBoundsTimer) {
    clearTimeout(persistBoundsTimer)
    persistBoundsTimer = null
  }

  const write = () => {
    persistBoundsTimer = null

    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) {
      return
    }

    const { height, width, x, y } = mainWindow.getNormalBounds()
    settings.update({ windowBounds: { height, width, x, y } })
  }

  if (immediate) {
    write()
    return
  }

  persistBoundsTimer = setTimeout(write, 500)
}

function createMainWindow({ onCloseRequested, startHidden = false }) {
  const stored = settings.read()
  const bounds = stored.windowBounds ?? {}

  mainWindow = new BrowserWindow({
    width: bounds.width ?? 1280,
    height: bounds.height ?? 860,
    x: bounds.x,
    y: bounds.y,
    minWidth: 640,
    minHeight: 480,
    show: false,
    title: appConfig.productName,
    icon: ICON,
    backgroundColor: '#12141a',
    autoHideMenuBar: false,
    webPreferences: webPreferences(),
  })

  attachNavigationPolicy(mainWindow)

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomFactor(settings.read().zoomFactor)
  })

  mainWindow.on('resize', () => persistBounds())
  mainWindow.on('move', () => persistBounds())

  mainWindow.on('close', (event) => {
    persistBounds({ immediate: true })
    if (onCloseRequested && onCloseRequested(event) === false) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  void mainWindow.loadFile(SHELL_PAGE)

  if (!startHidden) {
    mainWindow.once('ready-to-show', () => mainWindow.show())
  }

  return mainWindow
}

function getMainWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

function showWindow() {
  const window = getMainWindow()
  if (!window) {
    return
  }

  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
}

function isShowingUi() {
  const window = getMainWindow()
  return Boolean(window && currentUiOrigin && window.webContents.getURL().startsWith(currentUiOrigin))
}

/**
 * Hand the window over to the bundled web UI.
 */
function showUi(url) {
  const window = getMainWindow()
  if (!window) {
    return
  }

  currentUiOrigin = url
  if (!isShowingUi()) {
    void window.loadURL(url)
  }
}

/**
 * Bring back the local boot/diagnostics screen — used while starting up, after
 * a failure, and from the View menu.
 */
function showShell() {
  const window = getMainWindow()
  if (!window) {
    return
  }

  if (!window.webContents.getURL().startsWith('file://')) {
    void window.loadFile(SHELL_PAGE)
  }
}

function reloadUi() {
  const window = getMainWindow()
  if (window && isShowingUi()) {
    window.webContents.reloadIgnoringCache()
  }
}

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return settingsWindow
  }

  settingsWindow = new BrowserWindow({
    width: 620,
    height: 620,
    resizable: true,
    minimizable: false,
    maximizable: false,
    parent: getMainWindow() ?? undefined,
    title: `${appConfig.productName} Settings`,
    icon: ICON,
    backgroundColor: '#12141a',
    autoHideMenuBar: true,
    show: false,
    webPreferences: webPreferences(),
  })

  attachNavigationPolicy(settingsWindow)
  void settingsWindow.loadFile(SETTINGS_PAGE)
  settingsWindow.once('ready-to-show', () => settingsWindow.show())
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  return settingsWindow
}

function getSettingsWindow() {
  return settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : null
}

/**
 * Push an update to every renderer that cares. Safe to call when the main
 * window is showing the web UI — nothing there listens.
 */
function broadcast(channel, payload) {
  for (const window of [getMainWindow(), getSettingsWindow()]) {
    if (window) {
      window.webContents.send(channel, payload)
    }
  }
}

function applyZoom(factor) {
  for (const window of [getMainWindow(), getSettingsWindow()]) {
    if (window) {
      window.webContents.setZoomFactor(factor)
    }
  }
}

module.exports = {
  applyZoom,
  broadcast,
  createMainWindow,
  getMainWindow,
  getSettingsWindow,
  isShowingUi,
  openSettingsWindow,
  reloadUi,
  showShell,
  showUi,
  showWindow,
}
