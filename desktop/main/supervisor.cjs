'use strict'

/**
 * Owns the Homebridge server process.
 *
 * The desktop app runs `hb-service run` from the bundled `homebridge-config-ui-x`
 * on the bundled Node.js 22 runtime. That single command starts the web UI and
 * forks Homebridge itself, which is why the app supervises one process rather
 * than two: it is the same entry point the official Windows service uses, so
 * restarting Homebridge from inside the web UI keeps working.
 */

const { spawn, spawnSync } = require('node:child_process')
const { EventEmitter } = require('node:events')
const { mkdirSync } = require('node:fs')
const { delimiter } = require('node:path')
const process = require('node:process')
const { StringDecoder } = require('node:string_decoder')

const { LogTail } = require('./logTail.cjs')
const { hbServiceScript, isBundleStaged, resolveNodeBinary, runtimeDir, storageLayout } = require('./paths.cjs')
const { probe, readUiPort, uiUrl } = require('./uiEndpoint.cjs')

const MAX_LOG_LINES = 600
const READINESS_TIMEOUT = 180_000
const READINESS_INTERVAL = 750
const STOP_GRACE_PERIOD = 8000
const RAPID_FAILURE_WINDOW = 15_000
const MAX_RAPID_FAILURES = 5
const RESTART_BACKOFF = [1000, 2000, 5000, 10_000, 30_000]

const STAGING_HINT = 'The bundled Homebridge server is missing. Run "npm run desktop:prepare" to stage it.'

/**
 * `hb-service` inherits our environment, so anything Electron or a dev shell
 * leaves behind has to be cleaned up before it reaches npm or Homebridge.
 */
function buildEnvironment({ storagePath, uiPort, debugLogging }) {
  const env = {}
  let inheritedPath = ''

  for (const [key, value] of Object.entries(process.env)) {
    // Inherited npm_config_* values (from `npm run desktop:start`) would
    // silently override the settings below.
    if (key.startsWith('npm_config_') || key === 'npm_lifecycle_event' || key === 'ELECTRON_RUN_AS_NODE') {
      continue
    }

    // Windows spells it `Path`. Environment blocks passed to a child are
    // case-sensitive, so the existing key has to be dropped rather than left
    // beside the `PATH` set below — otherwise the child sees both and may
    // resolve against the one without the bundled runtime.
    if (key.toUpperCase() === 'PATH') {
      inheritedPath = value ?? ''
      continue
    }

    env[key] = value
  }

  // Put the bundled runtime first so a bare `npm` resolves to ours.
  env.PATH = `${runtimeDir}${delimiter}${inheritedPath}`

  // homebridge-config-ui-x looks for npm.cmd at %APPDATA%\npm, then
  // %ProgramFiles%\nodejs, then %NVM_SYMLINK%. Only the last is a path we can
  // aim at the bundled runtime, so a machine with no system-wide Node.js still
  // gets working plugin management. If the user does have Node.js installed,
  // theirs wins — plugins still install to the right place, but native modules
  // are built against that Node.js version.
  env.NVM_SYMLINK = runtimeDir

  // On Windows the web UI always installs plugins with `npm install -g`. Point
  // the global prefix at the storage directory so plugins land in the same
  // node_modules Homebridge is told to search, and survive app updates instead
  // of being wiped with the install directory.
  env.npm_config_prefix = storagePath

  // Only consulted when config.json has no port yet, i.e. on first run.
  env.HOMEBRIDGE_CONFIG_UI_PORT = String(uiPort)

  if (debugLogging) {
    env.UIX_DEBUG_LOGGING = '1'
  }

  return env
}

class Supervisor extends EventEmitter {
  constructor() {
    super()
    this.status = 'stopped'
    this.error = null
    this.child = null
    this.tail = null
    this.logLines = []
    this.uiPort = null
    this.readinessToken = 0
    this.stopping = false
    this.quitting = false
    this.restartTimer = null
    this.rapidFailures = 0
    this.startedAt = 0
    this.layout = null
    this.lastSettings = null
  }

  getState() {
    return {
      status: this.status,
      error: this.error,
      uiPort: this.uiPort,
      uiUrl: this.uiPort ? uiUrl(this.uiPort) : null,
      pid: this.child?.pid ?? null,
      storagePath: this.layout?.storagePath ?? null,
      logPath: this.layout?.logPath ?? null,
    }
  }

  getLogLines() {
    return this.logLines.slice()
  }

  setStatus(status, error = null) {
    this.status = status
    this.error = error
    this.emit('state', this.getState())
  }

  appendLog(line) {
    const text = line.replace(/\s+$/, '')
    if (!text) {
      return
    }

    this.logLines.push(text)
    if (this.logLines.length > MAX_LOG_LINES) {
      this.logLines.splice(0, this.logLines.length - MAX_LOG_LINES)
    }

    this.emit('log', text)
  }

  /**
   * Start the server. `settings` supplies the storage path, first-run UI port
   * and debug flag.
   */
  start(settings) {
    if (this.child) {
      return
    }

    this.clearRestartTimer()
    this.lastSettings = settings

    if (!isBundleStaged()) {
      this.setStatus('error', STAGING_HINT)
      this.appendLog(STAGING_HINT)
      return
    }

    const layout = storageLayout(settings.storagePath)
    this.layout = layout
    this.stopping = false
    this.uiPort = null
    this.setStatus('starting')

    try {
      // hb-service creates these too, but doing it first means the log tail and
      // the plugin directory exist before anything tries to use them.
      mkdirSync(layout.storagePath, { recursive: true })
      mkdirSync(layout.pluginPath, { recursive: true })
    } catch (error) {
      this.setStatus('error', `Cannot use storage directory ${layout.storagePath}: ${error.message}`)
      return
    }

    const nodeBinary = resolveNodeBinary()
    const args = [hbServiceScript, 'run', '-U', layout.storagePath, '-P', layout.pluginPath]

    this.appendLog(`Starting Homebridge: ${nodeBinary} ${args.join(' ')}`)

    let child
    try {
      child = spawn(nodeBinary, args, {
        cwd: layout.storagePath,
        env: buildEnvironment({
          storagePath: layout.storagePath,
          uiPort: settings.uiPort,
          debugLogging: settings.debugLogging,
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        // A process group gives POSIX development runs the same "stop the whole
        // tree" behaviour Windows gets from taskkill /T.
        detached: process.platform !== 'win32',
      })
    } catch (error) {
      this.setStatus('error', `Failed to launch the Homebridge runtime: ${error.message}`)
      return
    }

    this.child = child
    this.startedAt = Date.now()

    this.pipeToLog(child.stdout)
    this.pipeToLog(child.stderr)

    child.on('error', (error) => {
      this.appendLog(`Runtime error: ${error.message}`)
      this.setStatus('error', `Failed to launch the Homebridge runtime: ${error.message}`)
    })

    child.on('exit', (code, signal) => this.handleExit(code, signal))

    this.startTail(layout.logPath)
    void this.waitForReadiness(layout, settings)
  }

  pipeToLog(stream) {
    if (!stream) {
      return
    }

    const decoder = new StringDecoder('utf8')
    let partial = ''

    stream.on('data', (chunk) => {
      const lines = (partial + decoder.write(chunk)).split(/\r?\n/)
      partial = lines.pop() ?? ''
      for (const line of lines) {
        this.appendLog(line)
      }
    })
  }

  startTail(logPath) {
    this.stopTail()
    this.tail = new LogTail(logPath)
    this.tail.on('line', line => this.appendLog(line))
    this.tail.on('error', error => this.appendLog(`Cannot read log file: ${error.message}`))
    this.tail.start()
  }

  stopTail() {
    if (this.tail) {
      this.tail.stop()
      this.tail.removeAllListeners()
      this.tail = null
    }
  }

  /**
   * Poll until the web UI answers, then hand its URL to the window. The port
   * comes from config.json because hb-service may pick a different one than the
   * requested default on first run.
   */
  async waitForReadiness(layout, settings) {
    const token = ++this.readinessToken
    const deadline = Date.now() + READINESS_TIMEOUT

    while (this.readinessToken === token && this.child && Date.now() < deadline) {
      const port = (await readUiPort(layout.configPath)) ?? settings.uiPort

      if (port !== this.uiPort) {
        this.uiPort = port
        this.emit('state', this.getState())
      }

      if (await probe(port)) {
        if (this.readinessToken === token && this.child) {
          this.setStatus('running')
        }
        return
      }

      await new Promise(resolve => setTimeout(resolve, READINESS_INTERVAL))
    }

    if (this.readinessToken === token && this.child && this.status === 'starting') {
      this.setStatus('error', `The Homebridge UI did not start listening on port ${this.uiPort} in time. See the log below for details.`)
    }
  }

  handleExit(code, signal) {
    const wasStopping = this.stopping
    const ranFor = Date.now() - this.startedAt

    this.child = null
    this.readinessToken++
    this.stopTail()
    this.emit('exit', { code, signal })

    if (wasStopping || this.quitting) {
      this.stopping = false
      this.setStatus('stopped')
      return
    }

    this.appendLog(`Homebridge exited (${signal ? `signal ${signal}` : `code ${code}`}).`)

    this.rapidFailures = ranFor < RAPID_FAILURE_WINDOW ? this.rapidFailures + 1 : 0

    if (this.rapidFailures >= MAX_RAPID_FAILURES) {
      this.setStatus('error', 'Homebridge keeps stopping right after it starts. The log below should say why.')
      return
    }

    const delay = RESTART_BACKOFF[Math.min(this.rapidFailures, RESTART_BACKOFF.length - 1)]
    this.appendLog(`Restarting in ${Math.round(delay / 1000)}s...`)
    this.setStatus('starting')

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      this.start(this.lastSettings)
    }, delay)
  }

  clearRestartTimer() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
  }

  /**
   * Stop the server and everything it forked.
   *
   * Killing only `hb-service` would orphan the Homebridge process and any child
   * bridges, leaving their HAP ports bound, so on Windows the whole tree goes
   * at once — signals are not delivered to unrelated processes there, which
   * rules out a graceful SIGTERM.
   */
  stop() {
    this.clearRestartTimer()
    this.rapidFailures = 0
    this.readinessToken++

    const child = this.child
    if (!child) {
      this.setStatus('stopped')
      return Promise.resolve()
    }

    this.stopping = true
    this.setStatus('stopping')

    return new Promise((resolve) => {
      let settled = false
      let forceTimer = null

      const finish = () => {
        if (settled) {
          return
        }
        settled = true
        if (forceTimer) {
          clearTimeout(forceTimer)
        }
        resolve()
      }

      child.once('exit', finish)

      if (process.platform === 'win32') {
        // Windows has no way to ask a console process to shut down cleanly from
        // an unrelated parent — taskkill without /F only posts WM_CLOSE, which
        // hb-service never sees. Terminate the tree outright; Homebridge writes
        // its accessory and pairing state as it changes, so nothing is lost.
        this.killTree(child.pid, true)
        forceTimer = setTimeout(finish, STOP_GRACE_PERIOD)
      } else {
        this.killTree(child.pid, false)
        forceTimer = setTimeout(() => {
          this.killTree(child.pid, true)
          setTimeout(finish, 2000)
        }, STOP_GRACE_PERIOD)
      }
    })
  }

  killTree(pid, force) {
    if (!pid) {
      return
    }

    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      } else {
        // The child leads its own process group (see `detached` above), so a
        // negative pid reaches Homebridge and every child bridge it forked.
        process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM')
      }
    } catch {
      try {
        this.child?.kill(force ? 'SIGKILL' : 'SIGTERM')
      } catch {
        // The process is already gone.
      }
    }
  }

  async restart(settings) {
    await this.stop()
    this.start(settings)
  }

  /**
   * Final teardown before the app quits.
   */
  async shutdown() {
    this.quitting = true
    this.clearRestartTimer()
    await this.stop()
    this.stopTail()
  }
}

module.exports = { Supervisor }
