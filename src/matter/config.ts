/**
 * Lightweight Matter Configuration Utilities
 *
 * This module provides config collection and validation without importing
 * heavy Matter.js libraries. This ensures fast startup for users without
 * Matter configured.
 */

import type { AccessoryConfig, HomebridgeConfig, PlatformConfig } from '../bridgeService.js'

import { Logger } from '../logger.js'

const log = Logger.withPrefix('Matter/Config')

/**
 * Lightweight config collector that doesn't require Matter.js imports
 */
export class MatterConfigCollector {
  /**
   * Check if any Matter configuration exists in the config
   */
  static hasMatterConfig(config: HomebridgeConfig): boolean {
    return !!(
      config.bridge.matter
      || config.platforms.some((p: PlatformConfig) => p._bridge?.matter)
      || config.accessories.some((a: AccessoryConfig) => a._bridge?.matter)
    )
  }

  /**
   * Collect all configured Matter ports from config to avoid conflicts
   */
  static collectConfiguredMatterPorts(config: HomebridgeConfig): number[] {
    const configuredMatterPorts: number[] = []

    if (config.bridge.matter?.port) {
      configuredMatterPorts.push(config.bridge.matter.port)
    }

    for (const platform of config.platforms) {
      if (platform._bridge?.matter?.port) {
        configuredMatterPorts.push(platform._bridge.matter.port)
      }
    }

    for (const accessory of config.accessories) {
      if (accessory._bridge?.matter?.port) {
        configuredMatterPorts.push(accessory._bridge.matter.port)
      }
    }

    return configuredMatterPorts
  }

  /**
   * Validate the matterPorts pool configuration
   * Ensures start and end are defined and start <= end
   *
   * @param config - The Homebridge configuration
   */
  static validateMatterPortsPool(config: HomebridgeConfig): void {
    if (config.matterPorts !== undefined) {
      if (config.matterPorts.start && config.matterPorts.end) {
        if (config.matterPorts.start > config.matterPorts.end) {
          log.error('Invalid Matter port pool configuration. End should be greater than or equal to start.')
          config.matterPorts = undefined
        }
      } else {
        log.error('Invalid configuration for \'matterPorts\'. Missing \'start\' and \'end\' properties! Ignoring it!')
        config.matterPorts = undefined
      }
    }
  }

  /**
   * Validate Matter configuration (lazy-loads validator only when needed)
   * This function dynamically imports the full validator to avoid loading it
   * when Matter is not configured.
   */
  static async validateMatterConfig(config: HomebridgeConfig): Promise<void> {
    // Only validate if Matter config exists
    if (!this.hasMatterConfig(config)) {
      return
    }

    // Lazy-load the full validator (which has heavier dependencies)
    const { MatterConfigValidator } = await import('./configValidator.js')

    // Validate main bridge Matter config
    if (config.bridge.matter) {
      const validation = MatterConfigValidator.validate(config.bridge.matter)
      if (!validation.isValid) {
        log.error('Main bridge Matter configuration is invalid. Matter will not be enabled for the main bridge.')
        delete config.bridge.matter
      }
    }

    // Validate all child bridge Matter configs and check for port conflicts
    const childMatterValidation = MatterConfigValidator.validateAllChildMatterConfigs(
      config.platforms,
      config.accessories,
    )

    if (!childMatterValidation.isValid) {
      log.error('Some child bridge Matter configurations are invalid. Check the errors above.')
    }

    // Check for conflicts between main bridge Matter port and child bridge ports
    if (config.bridge.matter?.port) {
      this.checkPortConflicts(config)
    }
  }

  /**
   * Check for port conflicts between main bridge and child bridges
   *
   * @param config - The Homebridge configuration
   */
  private static checkPortConflicts(config: HomebridgeConfig): void {
    const mainMatterPort = config.bridge.matter?.port
    if (!mainMatterPort) {
      return
    }

    // Collect all child bridge Matter ports
    const childMatterPorts: number[] = []

    for (const platform of config.platforms) {
      if (platform._bridge?.matter?.port) {
        childMatterPorts.push(platform._bridge.matter.port)
      }
    }

    for (const accessory of config.accessories) {
      if (accessory._bridge?.matter?.port) {
        childMatterPorts.push(accessory._bridge.matter.port)
      }
    }

    // Check for conflicts with child bridge Matter ports
    if (childMatterPorts.includes(mainMatterPort)) {
      log.error(`Main bridge Matter port ${mainMatterPort} conflicts with a child bridge Matter port. Please use unique ports.`)
    }

    // Check for conflict with main bridge HAP port
    if (config.bridge.port && Math.abs(config.bridge.port - mainMatterPort) < 10) {
      log.warn(`Main bridge HAP port ${config.bridge.port} and Matter port ${mainMatterPort} are very close. Consider spacing them further apart.`)
    }
  }
}
