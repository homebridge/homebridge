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
 * The matter.js facilities that Homebridge shows less of than the rest, as
 * levels for `Logger.facilityLevels`. matter.js then drops their other lines
 * itself, before they are formatted.
 *
 * - `ValidatedElements` only logs warnings about optional Matter features an
 *   endpoint does not implement (and does not need to), so nothing below
 *   fatal is shown.
 * - `Commissioning` prints the pairing codes and the pairing state, which
 *   Homebridge prints itself. Its warnings and errors are kept: they are not
 *   about the codes.
 */
export const QUIET_FACILITY_LEVELS = {
  ValidatedElements: LogLevel.FATAL,
  Commissioning: LogLevel.WARN,
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
export function createHomebridgeLogFormatter(): (diagnostic: unknown) => string {
  // Capture timestamp setting once when formatter is created
  const timestampEnabled = Logger.isTimestampEnabled()

  return (diagnostic: unknown): string => {
    // Check if this is a Matter.js log message
    if (typeof diagnostic === 'object' && diagnostic !== null) {
      const msg = diagnostic as Partial<Diagnostic.Message>

      // If it's a log message with the expected structure
      if (msg.now && msg.facility && msg.values) {
        // Format facility as [Matter:FacilityName] in cyan color
        const facility = formatCyan(`[Matter/${msg.facility}]`)

        // Extract the message text from values.
        // Delegate value rendering to Matter.js's own formatter so that Diagnostic
        // presentations (dictionaries, lists, byte arrays, error stacks, lifecycle
        // icons) render correctly. We use the `plain` format (no ANSI) because we
        // apply a single Homebridge level colour to the whole line below.
        let messageText = LogFormat.formats.plain(msg.values)

        // Trim excessively long messages from verbose facilities like MessageChannel
        if (msg.facility === 'MessageChannel' && messageText.length > MESSAGE_CHANNEL_MAX_LENGTH) {
          messageText = `${messageText.substring(0, MESSAGE_CHANNEL_MAX_LENGTH)} [trimmed...]`
        }

        // Apply color based on Matter log level (see the table above).
        // NOTICE, and anything unknown, is left uncolored (Homebridge info style).
        let coloredMessage = messageText
        switch (msg.level) {
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
