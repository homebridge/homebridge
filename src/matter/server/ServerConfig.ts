/**
 * Matter Server Configuration
 *
 * Constants and configuration validation for the Matter server.
 */

import type { MatterServerConfig } from '../sharedTypes.js'

import { resolve } from 'node:path'

import { sanitizeUniqueId, truncateString, validatePort } from '../configValidator.js'
import { MatterDeviceError } from '../types.js'

export const DEFAULT_MATTER_PORT = 5540
export const DEFAULT_VENDOR_ID = 0xFFF1 // test vendor ID from Matter spec
export const DEFAULT_PRODUCT_ID = 0x8001 // test product ID
export const MAX_DEVICES_PER_BRIDGE = 1000 // matter spec maximum devices per aggregator
export const SERVER_READY_TIMEOUT_MS = 5000
export const SERVER_READY_POLL_INTERVAL_MS = 100
export const SERVER_INIT_DELAY_MS = 200
export const MAX_PASSCODE_ATTEMPTS = 100

/**
 * Validate and sanitize Matter server configuration
 * Throws descriptive errors if configuration is invalid
 */
export function validateAndSanitizeConfig(config: MatterServerConfig): MatterServerConfig {
  const errors: string[] = []

  // Validate port
  const port = config.port || DEFAULT_MATTER_PORT
  const portValidation = validatePort(port, false)
  if (!portValidation.valid) {
    errors.push(`Invalid port: ${portValidation.error}`)
  }

  // Validate and sanitize uniqueId (REQUIRED)
  if (!config.uniqueId) {
    errors.push('uniqueId is required for Matter server configuration')
  }

  const rawUniqueId = config.uniqueId || ''
  const uniqueIdResult = sanitizeUniqueId(rawUniqueId)
  const uniqueId = uniqueIdResult.value

  if (uniqueId.length === 0) {
    errors.push('Invalid uniqueId: must be a non-empty string')
  }

  // Validate storagePath (if provided)
  let storagePath = config.storagePath
  if (storagePath !== undefined) {
    storagePath = resolve(storagePath) // resolve to absolute path
  }

  // Validate and sanitize manufacturer
  let manufacturer = config.manufacturer
  if (manufacturer !== undefined) {
    manufacturer = truncateString(manufacturer, 32, 'Manufacturer name').value
  }

  // Validate and sanitize model
  let model = config.model
  if (model !== undefined) {
    model = truncateString(model, 32, 'Model name').value
  }

  // Validate firmwareRevision
  let firmwareRevision = config.firmwareRevision
  if (firmwareRevision !== undefined) {
    firmwareRevision = truncateString(firmwareRevision, 64, 'Firmware revision').value
  }

  // Validate serialNumber
  let serialNumber = config.serialNumber
  if (serialNumber !== undefined) {
    serialNumber = truncateString(serialNumber, 32, 'Serial number').value
  }

  // Validate debugModeEnabled
  const debugModeEnabled = config.debugModeEnabled || false

  // Validate externalAccessory
  const externalAccessory = config.externalAccessory || false

  // Throw if there are validation errors
  if (errors.length > 0) {
    throw new MatterDeviceError(
      `Matter configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`,
    )
  }

  return {
    port,
    uniqueId,
    storagePath,
    displayName: config.displayName,
    manufacturer,
    model,
    firmwareRevision,
    serialNumber,
    debugModeEnabled,
    externalAccessory,
    networkInterfaces: config.networkInterfaces,
  }
}
