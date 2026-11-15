/**
 * Matter.js Log Formatter
 *
 * Formats Matter.js library logs to match the homebridge log format and color scheme.
 * This ensures consistent logging output across Homebridge and Matter.js.
 */

import type { Diagnostic } from '@matter/main'

import { LogFormat, LogLevel } from '@matter/main'
import chalk from 'chalk'

import { Logger } from '../logger.js'

/**
 * How much of a `MessageChannel` message to keep before trimming it.
 *
 * That facility logs every frame on the wire, so it needs a bound or a debug
 * session fills the log. It was 200, which is shorter than one `ReportData`:
 * the line kept the attribute path and cut the value byte off the end, so the
 * one question these logs get read for - what did the controller actually
 * receive - was the one thing they could not answer (#3958).
 *
 * 1024 keeps a whole report while still bounding the pathological case.
 */
const MESSAGE_CHANNEL_MAX_LENGTH = 1024

/**
 * Whether a message is matter.js failing to decrypt a message it received.
 *
 * A controller that is still using an old session, for example after a restart
 * or re-pairing, gets every message dropped this way until it sets up a new
 * one, which it does by itself. matter.js logs each drop as an error, so a busy
 * hub could fill the log with stack traces while everything worked (#4026).
 */
function isSessionDecryptFailure(facility: string, messageText: string): boolean {
  return facility === 'Multiplex' && messageText.includes('[crypto-decrypt]')
}

/**
 * Create a custom log formatter that matches the homebridge format.
 * Format: [timestamp] [Matter:Facility] message
 * Timestamp format matches system locale (via toLocaleString()).
 *
 * Log level color mapping:
 * - Matter DEBUG/INFO → gray (Homebridge debug)
 * - Matter NOTICE → no color (Homebridge info)
 * - Matter WARN → yellow (Homebridge warn)
 * - Matter ERROR/FATAL → red (Homebridge error)
 */
export function createHomebridgeLogFormatter(options: { debug?: boolean } = {}): (diagnostic: unknown) => string {
  // Capture timestamp setting once when formatter is created
  const timestampEnabled = Logger.isTimestampEnabled()

  return (diagnostic: unknown): string => {
    // Check if this is a Matter.js log message
    if (typeof diagnostic === 'object' && diagnostic !== null) {
      const msg = diagnostic as Partial<Diagnostic.Message>

      // If it's a log message with the expected structure
      if (msg.now && msg.facility && msg.values) {
        // Suppress ValidatedElements logs - these are just validation warnings about
        // optional Matter.js features that aren't implemented (and don't need to be)
        if (msg.facility === 'ValidatedElements') {
          return ''
        }
        // The Commissioning facility prints the pairing codes and the pairing
        // state, which Homebridge prints itself. Its warnings and errors are
        // kept: they are not about the codes, and were hidden with the rest.
        if (msg.facility === 'Commissioning' && (msg.level === undefined || msg.level < LogLevel.WARN)) {
          return ''
        }

        // Format facility as [Matter:FacilityName] in cyan color
        const facility = formatCyan(`[Matter/${msg.facility}]`)

        // Extract the message text from values.
        // Delegate value rendering to Matter.js's own formatter so that Diagnostic
        // presentations (dictionaries, lists, byte arrays, error stacks, lifecycle
        // icons) render correctly. We use the `plain` format (no ANSI) because we
        // apply a single Homebridge level colour to the whole line below.
        let messageText = LogFormat.formats.plain(msg.values)

        // Keep the matter.js decrypt failures out of the normal log, and show
        // them as debug lines when Matter debug mode is on
        let level = msg.level
        if (isSessionDecryptFailure(msg.facility, messageText)) {
          if (!options.debug) {
            return ''
          }
          level = LogLevel.DEBUG
        }

        // Trim excessively long messages from verbose facilities like MessageChannel
        if (msg.facility === 'MessageChannel' && messageText.length > MESSAGE_CHANNEL_MAX_LENGTH) {
          messageText = `${messageText.substring(0, MESSAGE_CHANNEL_MAX_LENGTH)} [trimmed...]`
        }

        // Apply color based on Matter log level (see the table above).
        // NOTICE, and anything unknown, is left uncolored (Homebridge info style).
        let coloredMessage = messageText
        switch (level) {
          case LogLevel.FATAL:
          case LogLevel.ERROR:
            coloredMessage = chalk.red(messageText)
            break
          case LogLevel.WARN:
            coloredMessage = chalk.yellow(messageText)
            break
          case LogLevel.INFO:
          case LogLevel.DEBUG:
            coloredMessage = chalk.gray(messageText)
            break
        }

        // Check if timestamps are enabled (respects --no-timestamp flag)
        if (timestampEnabled) {
          // Format timestamp to match Homebridge format using toLocaleString() in white
          const timestamp = formatHomebridgeTimestamp(msg.now)
          return `${timestamp} ${facility} ${coloredMessage}`
        } else {
          // No timestamp
          return `${facility} ${coloredMessage}`
        }
      }
    }

    // Fallback for non-message diagnostics
    return String(diagnostic)
  }
}

/**
 * Format a date object to Homebridge timestamp format.
 * Uses toLocaleString() to match the main logger's format and respect system locale/timezone.
 * Returns the timestamp in white color to match main logger.
 */
function formatHomebridgeTimestamp(date: Date): string {
  const timestamp = `[${date.toLocaleString()}]`
  return chalk.white(timestamp)
}

/**
 * Format text in cyan color using chalk
 */
function formatCyan(text: string): string {
  return chalk.cyan(text)
}
