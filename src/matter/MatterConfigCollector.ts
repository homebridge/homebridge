/**
 * Matter Config Collector
 *
 * Collects and validates Matter configuration from Homebridge config.
 * This class extracts Matter config validation logic from server.ts to minimize changes to core files.
 */

import type { HomebridgeConfig } from '../bridgeService.js'

import { Logger } from '../logger.js'
import { MatterConfigValidator } from './configValidator.js'

const log = Logger.internal

/**
 * Validates and processes Matter configuration from Homebridge config
 */
export class MatterConfigCollector {
  /**
   * Validate all Matter configuration in the config
   * Validates main bridge and child bridge Matter configs, checks for port conflicts
   *
   * @param config - The Homebridge configuration
   */
  static validateMatterConfig(config: HomebridgeConfig): void {
    // Check if any Matter config exists
    const hasMatterConfig = config.bridge.matter
      || config.platforms.some((p: any) => p._bridge?.matter)
      || config.accessories.some((a: any) => a._bridge?.matter)

    if (!hasMatterConfig) {
      return
    }

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
      config.platforms as any[],
      config.accessories as any[],
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

    for (const platform of config.platforms as any[]) {
      if (platform._bridge?.matter?.port) {
        childMatterPorts.push(platform._bridge.matter.port)
      }
    }

    for (const accessory of config.accessories as any[]) {
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
