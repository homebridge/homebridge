/* global document, window */

/**
 * Settings window for the desktop shell.
 *
 * Only preferences the Electron app itself owns live here. Anything about the
 * bridge — accessories, plugins, ports, users — belongs to the bundled web UI,
 * which edits config.json directly.
 *
 * Loaded as a classic script: `file://` pages cannot use module scripts.
 */
;(function () {
  'use strict'

  const FIELD_IDS = {
    banner: 'banner',
    browse: 'browse',
    close: 'close',
    closeToTray: 'close-to-tray',
    debugLogging: 'debug-logging',
    launchAtLogin: 'launch-at-login',
    save: 'save',
    startHidden: 'start-hidden',
    startServer: 'start-server',
    storagePath: 'storage-path',
    uiPort: 'ui-port',
  }

  const api = window.homebridgeDesktop
  const fields = {}
  let initial = null

  function cacheElements() {
    for (const [key, id] of Object.entries(FIELD_IDS)) {
      fields[key] = document.getElementById(id)
    }
  }

  function fill(settings) {
    initial = settings
    fields.storagePath.value = settings.storagePath
    fields.uiPort.value = String(settings.uiPort)
    fields.startServer.checked = settings.startServerOnLaunch
    fields.closeToTray.checked = settings.closeToTray
    fields.startHidden.checked = settings.startHidden
    fields.launchAtLogin.checked = settings.launchAtLogin
    fields.debugLogging.checked = settings.debugLogging
  }

  function setBanner(message, isError) {
    fields.banner.hidden = !message
    fields.banner.textContent = message ?? ''
    fields.banner.classList.toggle('is-error', Boolean(isError))
  }

  function collect() {
    const port = Number.parseInt(fields.uiPort.value, 10)

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setBanner('Enter a web UI port between 1 and 65535.', true)
      return null
    }

    const storagePath = fields.storagePath.value.trim()
    if (!storagePath) {
      setBanner('Choose a storage folder.', true)
      return null
    }

    return {
      closeToTray: fields.closeToTray.checked,
      debugLogging: fields.debugLogging.checked,
      launchAtLogin: fields.launchAtLogin.checked,
      startHidden: fields.startHidden.checked,
      startServerOnLaunch: fields.startServer.checked,
      storagePath,
      uiPort: port,
    }
  }

  async function save() {
    const patch = collect()
    if (!patch) {
      return
    }

    // Only these three change how the server process is launched.
    const restarts = Boolean(initial) && (
      patch.storagePath !== initial.storagePath
      || patch.uiPort !== initial.uiPort
      || patch.debugLogging !== initial.debugLogging
    )

    fields.save.disabled = true
    setBanner(restarts ? 'Saving — Homebridge will restart…' : 'Saving…', false)

    fill(await api.saveSettings(patch))
    fields.save.disabled = false
    setBanner(restarts ? 'Saved. Homebridge is restarting.' : 'Saved.', false)
  }

  function wireEvents() {
    fields.save.addEventListener('click', () => {
      void save()
    })

    fields.close.addEventListener('click', () => window.close())

    fields.browse.addEventListener('click', async () => {
      const chosen = await api.pickStoragePath()
      if (chosen) {
        fields.storagePath.value = chosen
      }
    })

    api.onSettings(fill)
  }

  async function init() {
    cacheElements()

    if (!api) {
      setBanner('This page was loaded without the desktop shell.', true)
      return
    }

    wireEvents()

    const payload = await api.bootstrap()
    if (payload) {
      fill(payload.settings)
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    void init()
  })
})()
