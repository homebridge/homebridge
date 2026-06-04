/**
 * Matter Configuration Validation
 *
 * Provides validation utilities and orchestration for Matter configuration objects.
 * Includes both low-level validation primitives and high-level validation methods.
 */

import type { AccessoryConfig, PlatformConfig } from '../bridgeService.js'

import { Logger } from '../logger.js'
import { shouldStartMatterServer } from './config.js'

const log = Logger.withPrefix('Matter/Config')
const COLON_RE = /:/g

/**
 * Port validation result
 */
export interface PortValidationResult {
  valid: boolean
  error?: string
  warning?: string
}

/**
 * Sanitization result
 */
export interface SanitizationResult<T> {
  value: T
  warnings: string[]
}

export interface MatterConfigValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

// ============================================================================
// Low-level validation utilities
// ============================================================================

/**
 * Validate a Matter port number
 *
 * @param port - Port number to validate
 * @param checkConflicts - Whether to check for known conflicting ports
 * @returns Validation result with error/warning messages
 */
export function validatePort(port: number, checkConflicts = false): PortValidationResult {
  if (!Number.isInteger(port)) {
    return { valid: false, error: `Port must be an integer (got: ${port})` }
  }

  if (port < 1025 || port > 65534) {
    return { valid: false, error: `Port must be between 1025 and 65534 (got: ${port})` }
  }

  // Check for common conflicts
  if (checkConflicts) {
    const conflictPorts = [5353, 8080, 8443] // mDNS, common HTTP ports
    if (conflictPorts.includes(port)) {
      return {
        valid: true,
        warning: `Port ${port} may conflict with other services. Consider using a different port.`,
      }
    }
  }

  return { valid: true }
}

/**
 * Sanitize a unique ID for Matter filesystem storage
 *
 * Removes colons from MAC addresses and converts to uppercase for consistency.
 * Example: "AB:CD:EF:12:34:56" -> "ABCDEF123456"
 *
 * @param uniqueId - Unique identifier to sanitize (typically a MAC address)
 * @returns Sanitized unique ID and any warnings
 */
export function sanitizeUniqueId(uniqueId: string): SanitizationResult<string> {
  const warnings: string[] = []
  const original = uniqueId

  if (uniqueId.trim().length === 0) {
    return {
      value: '',
      warnings: ['uniqueId is empty after trimming'],
    }
  }

  // Remove colons and convert to uppercase for Matter storage paths
  const sanitized = uniqueId.replace(COLON_RE, '').toUpperCase()

  if (sanitized !== original) {
    warnings.push(`uniqueId was sanitized from "${original}" to "${sanitized}"`)
  }

  if (sanitized.length === 0) {
    warnings.push('uniqueId resulted in empty string after sanitization')
  }

  return { value: sanitized, warnings }
}

/**
 * Truncate a string to a maximum length with warning
 *
 * @param value - String to truncate
 * @param maxLength - Maximum allowed length
 * @param fieldName - Name of the field (for warnings)
 * @returns Truncated value and any warnings
 */
export function truncateString(
  value: string,
  maxLength: number,
  fieldName: string,
): SanitizationResult<string> {
  const warnings: string[] = []

  if (value.length > maxLength) {
    warnings.push(`${fieldName} exceeds ${maxLength} characters, truncating: ${value}`)
    log.warn(`${fieldName} exceeds ${maxLength} characters, truncating: ${value}`)
    return {
      value: value.slice(0, maxLength),
      warnings,
    }
  }

  return { value, warnings }
}

/**
 * Check for port conflicts between HAP and Matter ports
 *
 * @param hapPort - HAP bridge port
 * @param matterPort - Matter bridge port
 * @returns Warning message if ports are too close, undefined otherwise
 */
export function checkPortProximity(hapPort: number, matterPort: number): string | undefined {
  const MIN_PORT_SEPARATION = 10

  if (Math.abs(hapPort - matterPort) < MIN_PORT_SEPARATION) {
    return `HAP port ${hapPort} and Matter port ${matterPort} are very close. Consider spacing them further apart.`
  }

  return undefined
}

// ============================================================================
// High-level validation orchestration
// ============================================================================

/**
 * Validate Matter configuration for production readiness
 */
export class MatterConfigValidator {
  /**
   * Validate a Matter configuration object
   */
  static validate(config: Record<string, unknown>): MatterConfigValidationResult {
    const result: MatterConfigValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    }

    // Validate port configuration
    this.validatePort(config, result)

    result.isValid = result.errors.length === 0

    if (result.warnings.length > 0) {
      log.warn('Matter configuration warnings:')
      result.warnings.forEach(warning => log.warn(`  - ${warning}`))
    }

    if (result.errors.length > 0) {
      log.error('Matter configuration errors:')
      result.errors.forEach(error => log.error(`  - ${error}`))
    }

    return result
  }

  private static validatePort(config: Record<string, unknown>, result: MatterConfigValidationResult): void {
    const port = config.port

    if (port !== undefined && port !== null) {
      if (typeof port === 'number') {
        const validation = validatePort(port, true)
        if (!validation.valid) {
          result.errors.push(validation.error!)
        } else if (validation.warning) {
          result.warnings.push(validation.warning)
        }
      } else {
        result.errors.push(`Port must be a number, got ${typeof port}.`)
      }
    }
  }

  /**
   * Validate child Matter configuration (_bridge.matter property)
   */
  static validateChildMatterConfig(
    config: PlatformConfig | AccessoryConfig,
    configType: 'platform' | 'accessory',
    identifier: string,
  ): MatterConfigValidationResult {
    const result: MatterConfigValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    }

    // If no _bridge.matter property, no validation needed
    if (!config._bridge?.matter) {
      return result
    }

    const matterConfig = config._bridge.matter
    const prefix = `Child Matter bridge for ${configType} "${identifier}"`

    // Validate port if specified
    if (matterConfig.port !== undefined) {
      const validation = validatePort(matterConfig.port, false)
      if (!validation.valid) {
        result.errors.push(`${prefix}: ${validation.error}`)
        result.isValid = false
      }
    } else {
      result.warnings.push(`${prefix}: No port specified. Port will be auto-allocated.`)
    }

    // Check for port conflicts with HAP bridge
    if (config._bridge && config._bridge.matter) {
      // Ensure ports don't conflict if both HAP and Matter are configured
      if (config._bridge.port && matterConfig.port) {
        const proximityWarning = checkPortProximity(config._bridge.port, matterConfig.port)
        if (proximityWarning) {
          result.warnings.push(`${prefix}: ${proximityWarning}`)
        }
      }
    }

    // Log validation results
    if (result.errors.length > 0) {
      log.error(`${prefix} validation errors:`)
      result.errors.forEach(error => log.error(`  - ${error}`))
    }

    if (result.warnings.length > 0) {
      log.warn(`${prefix} validation warnings:`)
      result.warnings.forEach(warning => log.warn(`  - ${warning}`))
    }

    return result
  }

  /**
   * Validate all child Matter configurations in a config.
   *
   * Strips Matter config from any child whose port duplicates one already
   * seen — previously the validator only logged the error and let the
   * duplicate-port config through, which then deterministically failed at
   * runtime with EADDRINUSE on the second bridge to claim the port.
   */
  static validateAllChildMatterConfigs(
    platforms: PlatformConfig[],
    accessories: AccessoryConfig[],
    reservedPorts: Set<number> = new Set(),
  ): MatterConfigValidationResult {
    const result: MatterConfigValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    }

    const usedPorts = new Set<number>(reservedPorts)

    // Validate platform _bridge.matter configs
    for (const platform of platforms) {
      if (platform._bridge?.matter) {
        // Disabled-in-place (`enabled: false`) and externalsOnly child configs
        // never start a bridge server or bind their configured port, so preserve
        // them as-is: don't validate, strip, or reserve a port for them.
        // Otherwise an unrelated active Matter config triggering validation could
        // delete a user's intentionally-disabled config (it's meant to survive so
        // it can be re-enabled without re-commissioning).
        if (!shouldStartMatterServer(platform._bridge.matter)) {
          continue
        }

        const validation = this.validateChildMatterConfig(
          platform,
          'platform',
          platform.platform || 'unknown',
        )

        if (!validation.isValid) {
          // Strip the invalid Matter config so the bridge doesn't try to
          // start a Matter server with bad settings later.
          result.errors.push(...validation.errors)
          result.warnings.push(...validation.warnings)
          result.isValid = false
          delete platform._bridge.matter
          continue
        }
        result.warnings.push(...validation.warnings)

        // Check for port conflicts
        if (platform._bridge.matter.port) {
          if (usedPorts.has(platform._bridge.matter.port)) {
            result.errors.push(`Duplicate Matter port ${platform._bridge.matter.port} detected on platform "${platform.platform}". Removing this Matter configuration so the rest of the bridge can start.`)
            result.isValid = false
            delete platform._bridge.matter
            continue
          }
          usedPorts.add(platform._bridge.matter.port)
        }
      }
    }

    // Validate accessory _bridge.matter configs
    for (const accessory of accessories) {
      if (accessory._bridge?.matter) {
        // See the platform loop above: disabled-in-place / externalsOnly configs
        // are preserved untouched — they neither start a server nor bind a port.
        if (!shouldStartMatterServer(accessory._bridge.matter)) {
          continue
        }

        const validation = this.validateChildMatterConfig(
          accessory,
          'accessory',
          accessory.accessory || 'unknown',
        )

        if (!validation.isValid) {
          result.errors.push(...validation.errors)
          result.warnings.push(...validation.warnings)
          result.isValid = false
          delete accessory._bridge.matter
          continue
        }
        result.warnings.push(...validation.warnings)

        // Check for port conflicts
        if (accessory._bridge.matter.port) {
          if (usedPorts.has(accessory._bridge.matter.port)) {
            result.errors.push(`Duplicate Matter port ${accessory._bridge.matter.port} detected on accessory "${accessory.accessory}". Removing this Matter configuration so the rest of the bridge can start.`)
            result.isValid = false
            delete accessory._bridge.matter
            continue
          }
          usedPorts.add(accessory._bridge.matter.port)
        }
      }
    }

    return result
  }
}
