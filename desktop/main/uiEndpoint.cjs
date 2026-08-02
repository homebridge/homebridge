'use strict'

/**
 * Finding, and waiting for, the bundled web UI.
 *
 * The authoritative port is the one in the `config` platform block of the
 * user's `config.json` — `hb-service` writes it there on first run and the UI
 * reads it back, so the desktop shell reads the same file instead of guessing.
 */

const { readFile } = require('node:fs/promises')
const http = require('node:http')

const HEALTH_CHECK_TIMEOUT = 2000

/**
 * Read the UI port out of `config.json`, or null while the file does not exist
 * yet or has not been populated.
 */
async function readUiPort(configPath) {
  try {
    const config = JSON.parse(await readFile(configPath, 'utf8'))
    const uiBlock = Array.isArray(config.platforms)
      ? config.platforms.find(platform => platform && platform.platform === 'config')
      : null

    return Number.isInteger(uiBlock?.port) ? uiBlock.port : null
  } catch {
    return null
  }
}

function uiUrl(port) {
  return `http://127.0.0.1:${port}`
}

/**
 * True once something answers on the port. Any HTTP status counts — the UI
 * redirects to its login page and may answer 401, both of which mean "up".
 */
function probe(port) {
  return new Promise((resolve) => {
    const request = http.get({
      host: '127.0.0.1',
      port,
      path: '/',
      timeout: HEALTH_CHECK_TIMEOUT,
    }, (response) => {
      response.resume()
      resolve(true)
    })

    request.on('timeout', () => {
      request.destroy()
      resolve(false)
    })
    request.on('error', () => resolve(false))
  })
}

module.exports = { probe, readUiPort, uiUrl }
