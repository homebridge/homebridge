/* global document, HomebridgeAnsi, navigator, window */

/**
 * The desktop shell's boot and diagnostics screen.
 *
 * This is what the window shows before the bundled web UI is reachable, and
 * what it falls back to when the server stops or fails — so it has to be able
 * to explain a failure entirely on its own.
 *
 * Loaded as a classic script: `file://` pages cannot use module scripts.
 */
;(function () {
  'use strict'

  const MAX_RENDERED_LINES = 1000

  const STATUS = {
    error: { label: 'Stopped — needs attention', title: 'Homebridge is not running' },
    running: { label: 'Running', title: 'Homebridge is running' },
    starting: { label: 'Starting…', title: 'Starting Homebridge…' },
    stopped: { label: 'Stopped', title: 'Homebridge is not running' },
    stopping: { label: 'Stopping…', title: 'Stopping Homebridge…' },
  }

  const ELEMENT_IDS = [
    'autoscroll',
    'banner',
    'clear-log',
    'copy-log',
    'filter',
    'footer',
    'hero-hint',
    'hero-message',
    'hero-title',
    'log',
    'open-browser',
    'open-log',
    'open-settings',
    'open-storage',
    'open-ui',
    'restart',
    'start',
    'status-dot',
    'status-text',
    'stop',
  ]

  const api = window.homebridgeDesktop
  const elements = {}
  let filterText = ''

  function cacheElements() {
    for (const id of ELEMENT_IDS) {
      elements[id] = document.getElementById(id)
    }
  }

  /* Log ------------------------------------------------------------------- */

  function matchesFilter(text) {
    return !filterText || text.toLowerCase().includes(filterText)
  }

  function appendLine(text) {
    const plain = HomebridgeAnsi.stripAnsi(text)

    // Lines that carry nothing but escape sequences would render as stray blank
    // rows, which reads as a rendering bug rather than as log output.
    if (!plain.trim()) {
      return
    }

    // Clearing the whole container rather than just the placeholder also drops
    // the source markup's own indentation, which `white-space: pre-wrap` would
    // otherwise render as blank leading rows.
    if (elements.log.querySelector('.log-empty')) {
      elements.log.textContent = ''
    }

    const line = document.createElement('div')
    line.className = 'line'
    line.dataset.plain = plain
    line.appendChild(HomebridgeAnsi.ansiToFragment(text, document))

    if (!matchesFilter(plain)) {
      line.classList.add('is-hidden')
    }

    elements.log.appendChild(line)

    while (elements.log.childElementCount > MAX_RENDERED_LINES) {
      elements.log.removeChild(elements.log.firstElementChild)
    }

    if (elements.autoscroll.checked) {
      elements.log.scrollTop = elements.log.scrollHeight
    }
  }

  function applyFilter() {
    for (const line of elements.log.querySelectorAll('.line')) {
      line.classList.toggle('is-hidden', !matchesFilter(line.dataset.plain ?? ''))
    }
  }

  function visibleLogText() {
    return [...elements.log.querySelectorAll('.line:not(.is-hidden)')]
      .map(line => line.dataset.plain ?? '')
      .join('\n')
  }

  /* State ----------------------------------------------------------------- */

  function setBanner(message, isError) {
    elements.banner.hidden = !message
    elements.banner.textContent = message ?? ''
    elements.banner.classList.toggle('is-error', Boolean(isError))
  }

  function describe(state) {
    if (state.status === 'running' && state.uiUrl) {
      return `The Homebridge web interface is being loaded from ${state.uiUrl}.`
    }
    if (state.status === 'starting') {
      return state.uiPort
        ? `Waiting for the web interface to come up on port ${state.uiPort}…`
        : 'The bundled Homebridge server is starting up.'
    }
    if (state.status === 'stopping') {
      return 'Shutting down Homebridge and any child bridges.'
    }
    return 'Start Homebridge to bring the bridge and its web interface online.'
  }

  function renderState(state) {
    const status = STATUS[state.status] ?? STATUS.stopped
    const running = state.status === 'running'
    const busy = state.status === 'starting' || state.status === 'stopping'

    elements['status-text'].textContent = status.label
    elements['status-dot'].className = `dot is-${state.status}`
    elements['hero-title'].textContent = status.title
    elements['hero-message'].textContent = describe(state)
    elements['hero-hint'].textContent = state.storagePath ? `Storage folder: ${state.storagePath}` : ''

    setBanner(state.error, true)

    elements['open-ui'].hidden = !running
    elements.start.disabled = running || busy
    elements.restart.disabled = !running && !busy
    elements.stop.disabled = state.status === 'stopped'
    elements['open-browser'].disabled = !running
  }

  function renderFooter(versions) {
    const parts = []

    if (versions.homebridge) {
      parts.push(`Homebridge ${versions.homebridge}`)
    }
    if (versions.configUi) {
      parts.push(`UI ${versions.configUi}`)
    }
    parts.push(`Node.js ${versions.node} (${versions.arch})`, `Electron ${versions.electron}`)

    elements.footer.textContent = ''
    for (const part of parts) {
      const span = document.createElement('span')
      span.textContent = part
      elements.footer.appendChild(span)
    }
  }

  /* Wiring ---------------------------------------------------------------- */

  function wireEvents() {
    const serverButtons = { restart: 'restart', start: 'start', stop: 'stop' }
    for (const [id, action] of Object.entries(serverButtons)) {
      elements[id].addEventListener('click', () => api.serverAction(action))
    }

    const openButtons = {
      'open-browser': 'browser',
      'open-log': 'log',
      'open-settings': 'settings',
      'open-storage': 'storage',
      'open-ui': 'ui',
    }
    for (const [id, target] of Object.entries(openButtons)) {
      elements[id].addEventListener('click', () => api.open(target))
    }

    elements.filter.addEventListener('input', (event) => {
      filterText = event.target.value.trim().toLowerCase()
      applyFilter()
    })

    elements['copy-log'].addEventListener('click', () => navigator.clipboard.writeText(visibleLogText()))
    elements['clear-log'].addEventListener('click', () => {
      elements.log.textContent = ''
    })

    api.onState(renderState)
    api.onLog(appendLine)
  }

  function showUnavailable() {
    elements['hero-title'].textContent = 'Desktop bridge unavailable'
    elements['hero-message'].textContent
      = 'This page was loaded without the desktop shell, so it cannot control Homebridge.'
  }

  async function init() {
    cacheElements()

    if (!api) {
      showUnavailable()
      return
    }

    wireEvents()

    const payload = await api.bootstrap()
    if (!payload) {
      showUnavailable()
      return
    }

    renderFooter(payload.versions)
    payload.logs.forEach(appendLine)
    renderState(payload.state)

    if (!payload.bundleStaged) {
      setBanner(
        'The bundled Homebridge server is missing from this build. Run "npm run desktop:prepare" to stage it.',
        true,
      )
    } else if (payload.versions.crossStaged) {
      setBanner(
        'This build was staged on a non-Windows host, so its native modules are incomplete. It is meant for '
        + 'inspection only — re-stage on Windows before shipping.',
        false,
      )
    }

    if (payload.state.status === 'stopped' && !payload.settings.startServerOnLaunch) {
      elements['hero-hint'].textContent
        = 'Automatic start is turned off in Settings, so Homebridge is waiting for you.'
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    void init()
  })
})()
