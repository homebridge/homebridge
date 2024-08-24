/* global NodeJS */

import type { HomebridgeOptions } from './server.js'

import process from 'node:process'

import { Command } from 'commander'
import { HAPStorage } from 'hap-nodejs'
import { satisfies } from 'semver'
import 'source-map-support/register.js'

import { Logger } from './logger.js'
import { Server } from './server.js'
import { User } from './user.js'
import getVersion, { getRequiredNodeVersion } from './version.js'

import Signals = NodeJS.Signals

const log = Logger.internal

const requiredNodeVersion = getRequiredNodeVersion()
if (requiredNodeVersion && !satisfies(process.version, requiredNodeVersion)) {
  log.warn(`Homebridge requires a Node.js version of ${requiredNodeVersion} which does \
not satisfy the current Node.js version of ${process.version}. You may need to upgrade your installation of Node.js - see https://homebridge.io/w/JTKEF`)
}

export default function cli(): void {
  let insecureAccess = false
  let hideQRCode = false
  let keepOrphans = false
  let customPluginPath: string | undefined
  let strictPluginResolution = false
  let noLogTimestamps = false
  let debugModeEnabled = false
  let forceColourLogging = false
  let customStoragePath: string | undefined

  let shuttingDown = false

  const program = new Command()
  program
    .version(getVersion())
    .option('-C, --color', 'force color in logging', () => forceColourLogging = true)
    .option('-D, --debug', 'turn on debug level logging', () => debugModeEnabled = true)
    .option('-I, --insecure', 'allow unauthenticated requests (for easier hacking)', () => insecureAccess = true)
    .option('-P, --plugin-path [path]', 'look for plugins installed at [path] as well as the default locations ([path] can also point to a single plugin)', path => customPluginPath = path)
    .option('-Q, --no-qrcode', 'do not issue QRcode in logging', () => hideQRCode = true)
    .option('-K, --keep-orphans', 'keep cached accessories for which the associated plugin is not loaded', () => keepOrphans = true)
    .option('-T, --no-timestamp', 'do not issue timestamps in logging', () => noLogTimestamps = true)
    .option('-U, --user-storage-path [path]', 'look for homebridge user files at [path] instead of the default location (~/.homebridge)', path => customStoragePath = path)
    .option('--strict-plugin-resolution', 'only load plugins from the --plugin-path if set, otherwise from the primary global node_modules', () => strictPluginResolution = true)
    .parse(process.argv)

  if (noLogTimestamps) {
    Logger.setTimestampEnabled(false)
  }

  if (debugModeEnabled) {
    Logger.setDebugEnabled(true)
  }

  if (forceColourLogging) {
    Logger.forceColor()
  }

  if (customStoragePath) {
    User.setStoragePath(customStoragePath)
  }

  // Initialize HAP-NodeJS with a custom persist directory
  HAPStorage.setCustomStoragePath(User.persistPath())

  const options: HomebridgeOptions = {
    keepOrphanedCachedAccessories: keepOrphans,
    insecureAccess,
    hideQRCode,
    customPluginPath,
    noLogTimestamps,
    debugModeEnabled,
    forceColourLogging,
    customStoragePath,
    strictPluginResolution,
  }

  const server = new Server(options)

  const signalHandler = (signal: Signals, signalNum: number): void => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true

    log.info('Got %s, shutting down Homebridge...', signal)
    setTimeout(() => process.exit(128 + signalNum), 5000)

    server.teardown()
  }
  process.on('SIGINT', signalHandler.bind(undefined, 'SIGINT', 2))
  process.on('SIGTERM', signalHandler.bind(undefined, 'SIGTERM', 15))

  const errorHandler = (error: Error): void => {
    if (error.stack) {
      log.error(error.stack)
    }

    if (!shuttingDown) {
      process.kill(process.pid, 'SIGTERM')
    }
  }
  process.on('uncaughtException', errorHandler)
  server.start().catch(errorHandler)
}
