/**
 * Lightweight Matter Configuration Utilities
 *
 * This module provides config collection and validation without importing
 * heavy Matter.js libraries. This ensures fast startup for users without
 * Matter configured.
 */

import type { AccessoryConfig, HomebridgeConfig, PlatformConfig } from '../bridgeService.js'
import type { MatterConfig } from './types.js'

import { Logger } from '../logger.js'

const log = Logger.withPrefix('Matter/Config')

/**
 * Whether a Matter config block represents an *enabled* Matter setup.
 * The block being present means Matter is configured; `enabled: false` means
 * it is configured but intentionally turned off (storage + port preserved so
 * it can be re-enabled without re-commissioning). Missing `enabled` = enabled,
 * which keeps every pre-existing config working unchanged.
 *
 * Note: this does NOT distinguish "the main matter server should start" from
 * "the matter API surface should be exposed to plugins". Use
 * `shouldStartMatterServer` for the former — it additionally accounts for
 * externalsOnly mode, where the API is exposed but the bridge server is not
 * started.
 */
export function isMatterConfigEnabled(matter: MatterConfig | undefined): boolean {
  return !!matter && matter.enabled !== false
}

/**
 * Whether the main Matter server should start for this bridge — i.e. Matter
 * is configured, enabled, and NOT in externalsOnly mode. In externalsOnly
 * mode the API is still loaded (so plugins can publish externals via their
 * own per-accessory MatterServer instances) but the bridge aggregator does
 * not come up.
 */
export function shouldStartMatterServer(matter: MatterConfig | undefined): boolean {
  return isMatterConfigEnabled(matter) && !matter?.externalsOnly
}

/**
 * Whether Matter is "active" for this bridge in any form — either fully on,
 * or in externalsOnly mode (api.matter loaded, manager listening for external
 * publish events, main bridge server NOT started). Returns false only when
 * matter is missing or fully disabled (`enabled: false` without `externalsOnly`).
 *
 * Use this for gates like "should api.matter be loaded?" and "should the
 * matter manager be constructed?". Use `shouldStartMatterServer` for the
 * tighter gate of "should the bridge aggregator come up?".
 */
export function isMatterActive(matter: MatterConfig | undefined): boolean {
  return !!matter && (matter.enabled !== false || matter.externalsOnly === true)
}

/**
 * Normalise the coherence of `matter.externalsOnly` for a single bridge block.
 *
 * `externalsOnly: true` is meant to be paired with `enabled: false` (the two
 * flags together confirm "bridge node off, externals still publish"). If a
 * config sets `externalsOnly: true` on its own we honour the unambiguous
 * intent rather than failing the whole process — we warn and set
 * `enabled: false` in place so the block matches the canonical externalsOnly
 * form every downstream check expects. This mirrors the log-and-continue
 * behaviour of the port validators rather than taking the whole instance down
 * over one stray flag.
 *
 * For accessory child bridges, callers should use
 * `stripMatterExternalsOnlyForAccessory` instead — externals are not
 * supported on accessory plugins, so the field is dropped with a warning
 * before this check runs.
 *
 * Mutates the passed matter block in place.
 */
export function validateMatterExternalsOnly(
  matter: MatterConfig,
  bridgeLabel: string,
): void {
  if (matter.externalsOnly === true && matter.enabled !== false) {
    log.warn(
      `${bridgeLabel}: 'matter.externalsOnly: true' was set without 'matter.enabled: false'. Proceeding in externalsOnly mode (the bridge node will not start). Set 'matter.enabled: false' to confirm intent and silence this warning.`,
    )
    matter.enabled = false
  }
}

/**
 * Strip `matter.externalsOnly` (if set) from an accessory child bridge's
 * matter block, logging a warning. Externals are not supported via the
 * accessory plugin API, so the flag is meaningless there — mirrors the
 * accessory-side behaviour of `hap.externalsOnly`.
 *
 * Mutates the passed matter block in place.
 */
export function stripMatterExternalsOnlyForAccessory(
  matter: MatterConfig,
  bridgeLabel: string,
): void {
  if (matter.externalsOnly === true) {
    log.warn(`${bridgeLabel}: 'matter.externalsOnly' is not supported on accessory child bridges. Ignoring.`)
    delete matter.externalsOnly
  }
}

/**
 * Lightweight config collector that doesn't require Matter.js imports
 */
export class MatterConfigCollector {
  /**
   * Check if any Matter configuration exists in the config
   */
  static hasMatterConfig(config: HomebridgeConfig): boolean {
    // Use isMatterActive so externalsOnly bridges are considered configured —
    // they still need api.matter loaded and the manager set up to attach
    // their external-publish listeners.
    return (
      isMatterActive(config.bridge.matter)
      || config.platforms.some((p: PlatformConfig) => isMatterActive(p._bridge?.matter))
      || config.accessories.some((a: AccessoryConfig) => isMatterActive(a._bridge?.matter))
    )
  }

  /**
   * Collect all configured Matter ports from config to avoid conflicts.
   *
   * Ports are collected from every bridge block that declares one, regardless
   * of `enabled`/`externalsOnly` state. This is deliberate: a disabled-in-place
   * bridge (`enabled: false`) keeps its configured port reserved so that
   * re-enabling it later reuses the same port (no re-commissioning) and the
   * allocator never hands that port to an automatic Matter/external allocation
   * in the meantime. The trade-off is that a disabled bridge's port stays
   * unavailable for auto-allocation even though no server currently binds it —
   * that is the cost of the "port preserved" contract on `enabled`.
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

    // externalsOnly coherence checks run first so misconfigurations throw with
    // a clear message before downstream validators get the chance to silently
    // strip the matter block on unrelated errors. Accessory child bridges have
    // externalsOnly stripped with a warning here too (mirrors hap.externalsOnly).
    if (config.bridge.matter) {
      validateMatterExternalsOnly(config.bridge.matter, 'main bridge')
    }
    for (const platform of config.platforms) {
      if (platform._bridge?.matter) {
        validateMatterExternalsOnly(
          platform._bridge.matter,
          `platform "${platform.platform}" child bridge`,
        )
      }
    }
    for (const accessory of config.accessories) {
      if (accessory._bridge?.matter) {
        stripMatterExternalsOnlyForAccessory(
          accessory._bridge.matter,
          `accessory "${accessory.accessory}" child bridge`,
        )
      }
    }

    // Lazy-load the full validator (which has heavier dependencies)
    const { MatterConfigValidator } = await import('./configValidator.js')

    // Validate the main bridge Matter config only when it will actually start a
    // server. A disabled (`enabled: false`) or externalsOnly main bridge is
    // preserved as-is (disabled-in-place) — mirroring the child validator —
    // since stripping it would lose config/storage the user expects to survive
    // so it can be re-enabled without re-commissioning.
    if (config.bridge.matter && shouldStartMatterServer(config.bridge.matter)) {
      const validation = MatterConfigValidator.validate(config.bridge.matter)
      if (!validation.isValid) {
        log.error('Main bridge Matter configuration is invalid. Matter will not be enabled for the main bridge.')
        delete config.bridge.matter
      }
    }

    // Reserve the main bridge's Matter port so the child validator catches
    // child↔main port collisions in the same pass — but only when the main
    // Matter server will actually bind it. A disabled or externalsOnly main
    // bridge never starts its bridge server, so its configured port must not
    // block a child bridge from legitimately using the same number.
    const reserved = new Set<number>()
    if (shouldStartMatterServer(config.bridge.matter) && config.bridge.matter?.port) {
      reserved.add(config.bridge.matter.port)
    }

    // Validate all child bridge Matter configs and check for port conflicts
    const childMatterValidation = MatterConfigValidator.validateAllChildMatterConfigs(
      config.platforms,
      config.accessories,
      reserved,
    )

    if (!childMatterValidation.isValid) {
      log.error('Some child bridge Matter configurations were invalid and have been disabled. The remaining configuration will start as normal.')
      // Surface the specific per-child errors (which platform/accessory and
      // which port) so the user knows what to fix. Previously these details
      // were collected into the result but never logged, leaving only the
      // generic line above — the user couldn't tell what had been disabled.
      for (const error of childMatterValidation.errors) {
        log.error(error)
      }
    }

    // Surface any non-fatal child Matter warnings too — also collected by the
    // validator but not previously logged by this caller.
    for (const warning of childMatterValidation.warnings) {
      log.warn(warning)
    }

    // Check for conflicts between main bridge Matter port and child bridge
    // ports — again only when the main server will actually bind its port,
    // so a disabled/externalsOnly main doesn't raise a spurious conflict.
    if (shouldStartMatterServer(config.bridge.matter) && config.bridge.matter?.port) {
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
