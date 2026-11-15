import type {
  CharacteristicWarning,
  InterfaceName,
  IPAddress,
  MacAddress,
  MDNSAdvertiser,
  PublishInfo,
  VoidCallback,
} from '@homebridge/hap-nodejs'

import type {
  AccessoryIdentifier,
  AccessoryName,
  AccessoryPlugin,
  HomebridgeAPI,
  PlatformIdentifier,
  PlatformName,
  PluginIdentifier,
  StaticPlatformPlugin,
} from './api.js'
import type { ExternalPortsConfiguration, ExternalPortService } from './externalPortService.js'
import type { Logging } from './logger.js'
import type { MatterConfig } from './matter/index.js'
import type { SerializedPlatformAccessory } from './platformAccessory.js'
import type { Plugin } from './plugin.js'
import type { HomebridgeOptions } from './server.js'

import {
  Accessory,
  AccessoryEventTypes,
  Bridge,
  Categories,
  Characteristic,
  CharacteristicEventTypes,
  CharacteristicWarningType,
  HAPLibraryVersion,
  once,
  Service,
  uuid,
} from '@homebridge/hap-nodejs'

import { InternalAPIEvent } from './api.js'
import { getLogPrefix, Logger } from './logger.js'
import { PlatformAccessory } from './platformAccessory.js'
import { PluginManager } from './pluginManager.js'
import { StorageService } from './storageService.js'
import { generate } from './util/mac.js'
import { isPortInUse } from './util/port.js'
import getVersion from './version.js'

export const DEFAULT_BRIDGE_DEFAULTS = {
  vendorName: 'Homebridge',
  manufacturer: 'homebridge.io',
  model: 'homebridge',
} as const

const log = Logger.internal

/** The most accessories HAP-NodeJS puts on one bridge (the HomeKit limit of 150, less the bridge itself). */
const MAX_BRIDGED_ACCESSORIES = 149

/** The longest a shutdown waits for the accessories to be taken off the network, in milliseconds. */
const UNPUBLISH_TIMEOUT = 2000

/**
 * HAP-specific configuration for a bridge. Mirrors the shape of `MatterConfig`
 * so the two protocol blocks are symmetric and can be reasoned about uniformly.
 */
export interface BridgeHapConfig {
  /**
   * Whether HAP is published for this bridge. Default `true` (so omitting the
   * block, or omitting `enabled`, means HAP is on). Set to `false` to suppress
   * the bridge's HAP advertisement while preserving any existing pairing.
   *
   * Both `hap` and `matter` may be disabled on the same bridge; the bridge
   * then advertises nothing (it still loads, it just exposes no accessories).
   */
  enabled?: boolean

  /**
   * When `true`, the bridge accessory itself is NOT published, but external
   * accessories registered by plugins against this bridge ARE still published
   * (each as its own standalone HAP accessory). Intended to be paired with
   * `enabled: false`; if `externalsOnly: true` is set on its own, validation
   * warns and normalises `enabled` to `false` rather than rejecting the config.
   */
  externalsOnly?: boolean

  /**
   * Whether to disable HAP-NodeJS's `addIdentifyingMaterial` publish option,
   * which appends identifying material derived from the username to the
   * bridge display name and mDNS service instance name. Defaults to `false`.
   */
  disableIdentifyingMaterial?: boolean
}

export interface BridgeConfiguration {
  name: string
  username: MacAddress
  pin: string // format like "000-00-000"
  advertiser?: MDNSAdvertiser
  port?: number
  bind?: (InterfaceName | IPAddress) | (InterfaceName | IPAddress)[]
  /** 4-character HomeKit setup ID (alphanumeric, e.g. "ABCD"). Validated at runtime. */
  setupID?: string
  manufacturer?: string
  model?: string
  disableIpc?: boolean
  firmwareRevision?: string
  serialNumber?: string
  debugModeEnabled?: boolean
  /**
   * HAP publishing config. Defaults to enabled when omitted.
   *
   * The object form (`BridgeHapConfig`) is preferred. The bare boolean form
   * (`hap: false` / `hap: true`) is the deprecated v2-beta shorthand, still
   * accepted for back-compat and normalized to `{ enabled: <boolean> }` by
   * `validateHapConfig`. The type allows it so existing configs keep compiling.
   *
   * @deprecated Pass `hap` as a boolean is deprecated; use `{ enabled }` instead.
   */
  hap?: BridgeHapConfig | boolean
  matter?: MatterConfig
  env?: {
    DEBUG?: string
    NODE_OPTIONS?: string
  }
}

/**
 * Whether HAP is enabled for the given bridge configuration. HAP is on by
 * default; users opt out via `hap: { enabled: false }`. Missing block or
 * missing `enabled` both mean enabled.
 *
 * The legacy boolean form (`hap: false`/`hap: true`) is handled here too.
 * `validateHapConfig` normalizes it to the object shape, but a raw `false`
 * must still read as disabled even if this is reached before normalization —
 * otherwise `!hap` (true for `false`) would wrongly report a disabled bridge
 * as enabled and publish it anyway.
 */
export function isHapConfigEnabled(hap: BridgeHapConfig | boolean | undefined): boolean {
  if (typeof hap === 'boolean') {
    return hap
  }
  return !hap || hap.enabled !== false
}

/**
 * Whether the bridge is in HAP externalsOnly mode (the bridge accessory itself
 * is suppressed but external accessories still publish). Only the object form
 * carries `externalsOnly`; the legacy boolean form never does, so it is always
 * false there. Accepts the boolean form so callers can pass `bridge.hap`
 * directly without narrowing.
 */
export function isHapExternalsOnly(hap: BridgeHapConfig | boolean | undefined): boolean {
  return typeof hap === 'object' && hap.externalsOnly === true
}

/**
 * Whether HAP is in use on the bridge at all: the bridge accessory is published,
 * or the bridge is in externalsOnly mode and only external accessories publish.
 * The HAP counterpart of `isMatterActive`, and what `api.isHapEnabled()` reports.
 */
export function isHapActive(hap: BridgeHapConfig | boolean | undefined): boolean {
  return isHapConfigEnabled(hap) || isHapExternalsOnly(hap)
}

/**
 * Whether HAP-NodeJS should enable its `addIdentifyingMaterial` publish option.
 * Missing config, an explicit `disableIdentifyingMaterial: false`, and the
 * deprecated boolean `hap` form preserve the historical behavior (`true`).
 */
export function shouldAddIdentifyingMaterial(hap: BridgeHapConfig | boolean | undefined): boolean {
  return typeof hap !== 'object' || !hap?.disableIdentifyingMaterial
}

/**
 * Validate a `hap` config block. Throws on hard errors (wrong type, conflict
 * between `externalsOnly` and `enabled`) and warns when identifying material is
 * disabled because advertised mDNS service names must remain unique. For
 * accessory child bridges, strips `externalsOnly` with a warn-level log because
 * externals are not supported via the accessory plugin API.
 *
 * Mutates the passed block in place when stripping fields.
 */
export function validateHapConfig(
  bridgeConfig: BridgeConfiguration,
  opts: { bridgeLabel: string, isAccessoryPlugin?: boolean },
): void {
  const hap = bridgeConfig.hap as unknown
  if (hap === undefined) {
    return
  }

  // Back-compat: the v2 beta used a boolean `hap` (`hap: false` to disable HAP,
  // `hap: true` to force it on). Normalize it to the object shape rather than
  // rejecting it — this is not a major-version change, so existing configs that
  // still use the boolean form must keep working without a manual edit.
  if (typeof hap === 'boolean') {
    bridgeConfig.hap = { enabled: hap }
    log.warn(`${opts.bridgeLabel}: 'hap: ${hap}' is deprecated; treating it as 'hap: { enabled: ${hap} }'. Please update your config to the object form.`)
    return
  }

  if (typeof hap !== 'object' || hap === null || Array.isArray(hap)) {
    throw new Error(
      `${opts.bridgeLabel}: 'hap' must be a boolean or an object with optional 'enabled', 'externalsOnly', and 'disableIdentifyingMaterial' fields, not a ${Array.isArray(hap)
        ? 'array'
        : typeof hap}.`,
    )
  }

  const hapBlock = hap as BridgeHapConfig

  if (hapBlock.disableIdentifyingMaterial !== undefined && typeof hapBlock.disableIdentifyingMaterial !== 'boolean') {
    throw new Error(`${opts.bridgeLabel}: 'hap.disableIdentifyingMaterial' must be a boolean.`)
  }

  if (hapBlock.disableIdentifyingMaterial === true) {
    log.warn(`${opts.bridgeLabel}: HAP identifying material is disabled. Ensure bridge names are unique on your network to avoid mDNS name collisions and pairing instability.`)
  }

  if (hapBlock.externalsOnly === true) {
    if (opts.isAccessoryPlugin) {
      log.warn(`${opts.bridgeLabel}: 'hap.externalsOnly' is not supported on accessory child bridges. Ignoring.`)
      delete hapBlock.externalsOnly
      return
    }

    if (hapBlock.enabled !== false) {
      // Honour the unambiguous intent rather than failing the whole process:
      // warn and normalise `enabled` to false so the block matches the canonical
      // externalsOnly form every downstream check expects. Mirrors
      // validateMatterExternalsOnly — the two protocol blocks stay symmetric.
      log.warn(
        `${opts.bridgeLabel}: 'hap.externalsOnly: true' was set without 'hap.enabled: false'. Proceeding in externalsOnly mode (the bridge accessory will not publish). Set 'hap.enabled: false' to confirm intent and silence this warning.`,
      )
      hapBlock.enabled = false
    }
  }
}

export interface AccessoryConfig extends Record<string, any> {
  accessory: AccessoryName | AccessoryIdentifier
  name: string
  uuid_base?: string
  _bridge?: BridgeConfiguration
}

export interface PlatformConfig extends Record<string, any> {
  platform: PlatformName | PlatformIdentifier
  name?: string
  _bridge?: BridgeConfiguration
}

export interface HomebridgeConfig {
  bridge: BridgeConfiguration

  /**
   * @deprecated
   */
  mdns?: any // this is deprecated and not used anymore

  accessories: AccessoryConfig[]
  platforms: PlatformConfig[]

  plugins?: PluginIdentifier[] // array to define set of active plugins

  /**
   * Array of disabled plugins.
   * Unlike the plugins[] config which prevents plugins from being initialized at all, disabled plugins still have their alias loaded, so
   * we can match config blocks of disabled plugins and show an appropriate message in the logs.
   */
  disabledPlugins?: PluginIdentifier[]

  // This section is used to control the range of ports (inclusive) that separate accessory (like camera or television) should be bind to
  ports?: ExternalPortsConfiguration

  // This section is used to control the range of ports (inclusive) that Matter accessories should bind to
  // If not specified, falls back to range 5530-5541
  matterPorts?: ExternalPortsConfiguration
}

export interface BridgeOptions extends HomebridgeOptions {
  cachedAccessoriesDir: string
  cachedAccessoriesItemName: string
  externalAccessoriesItemName: string
}

export interface ExternalAccessoryMetadata {
  username: MacAddress
  plugin: PluginIdentifier
  displayName: string
  category: number
  port?: number
}

export interface CharacteristicWarningOpts {
  ignoreSlow?: boolean
}

export class BridgeService {
  public bridge: Bridge
  private storageService: StorageService
  private readonly allowInsecureAccess: boolean
  private cachedPlatformAccessories: PlatformAccessory[] = []
  private cachedAccessoriesFileLoaded = false
  private readonly publishedExternalAccessories: Map<MacAddress, PlatformAccessory> = new Map()
  private readonly publishedExternalAccessoriesMetadata: Map<MacAddress, ExternalAccessoryMetadata> = new Map()
  private readonly characteristicWarningListeners = new WeakMap<Accessory, (warning: CharacteristicWarning) => void>()

  constructor(
    private api: HomebridgeAPI,
    private pluginManager: PluginManager,
    private externalPortService: ExternalPortService,
    private bridgeOptions: BridgeOptions,
    private bridgeConfig: BridgeConfiguration,
  ) {
    this.storageService = new StorageService(this.bridgeOptions.cachedAccessoriesDir)
    this.storageService.initSync()

    // Externals are republished from scratch on every startup, so any persisted metadata
    // from a previous run is stale until the owning plugin re-registers its accessories.
    try {
      this.storageService.removeItemSync(this.bridgeOptions.externalAccessoriesItemName)
    } catch (error: any) {
      log.warn('Failed to clear stale external accessories metadata file:', error.message)
    }

    // Server is "secure by default", meaning it creates a top-level Bridge accessory that
    // will not allow unauthenticated requests. This matches the behavior of actual HomeKit
    // accessories. However, you can set this to true to allow all requests without authentication,
    // which can be useful for easy hacking. Note that this will expose all functions of your
    // bridged accessories, like changing characteristics (i.e. flipping your lights on and off).
    this.allowInsecureAccess = this.bridgeOptions.insecureAccess || false

    this.api.on(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, this.handleRegisterPlatformAccessories.bind(this))
    this.api.on(InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, this.handleUpdatePlatformAccessories.bind(this))
    this.api.on(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, this.handleUnregisterPlatformAccessories.bind(this))
    this.api.on(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, this.handlePublishExternalAccessories.bind(this))

    this.bridge = new Bridge(bridgeConfig.name, uuid.generate('HomeBridge'))
    this.bridge.on(AccessoryEventTypes.CHARACTERISTIC_WARNING, () => {
      // We register characteristic warning handlers on every bridged accessory (to have a reference to the plugin).
      // For Bridges the warnings will propagate to the main Bridge accessory, thus we need to silence them here.
      // Otherwise, those would be printed twice (by us and HAP-NodeJS as it detects no handlers on the bridge).
    })
  }

  /**
   * Print the characteristic warnings of a platform accessory under its
   * plugin's name, with one listener per accessory however often the
   * accessory is registered.
   *
   * A plugin may unregister an accessory and register the same object again.
   * HAP-NodeJS up to v2.3.0 removed every listener from an accessory taken off
   * the bridge, which hid that a new listener was added on each registration;
   * from v2.3.1 it leaves the listeners alone, and each warning would be
   * printed once per registration.
   */
  private watchCharacteristicWarnings(plugin: Plugin, hapAccessory: Accessory): void {
    const previous = this.characteristicWarningListeners.get(hapAccessory)
    if (previous) {
      hapAccessory.removeListener(AccessoryEventTypes.CHARACTERISTIC_WARNING, previous)
    }
    const listener = BridgeService.printCharacteristicWriteWarning.bind(this, plugin, hapAccessory, {})
    this.characteristicWarningListeners.set(hapAccessory, listener)
    hapAccessory.on(AccessoryEventTypes.CHARACTERISTIC_WARNING, listener)
  }

  // characteristic warning event has additional parameter originatorChain: string[] which is currently unused
  public static printCharacteristicWriteWarning(plugin: Plugin, accessory: Accessory, opts: CharacteristicWarningOpts, warning: CharacteristicWarning): void {
    const wikiInfo = 'See https://homebridge.io/w/JtMGR for more info.'
    switch (warning.type) {
      case CharacteristicWarningType.SLOW_READ:
      case CharacteristicWarningType.SLOW_WRITE:
        if (!opts.ignoreSlow) {
          log.info(getLogPrefix(plugin.getPluginIdentifier()), 'This plugin slows down Homebridge.', warning.message, wikiInfo)
        }
        break
      case CharacteristicWarningType.TIMEOUT_READ:
      case CharacteristicWarningType.TIMEOUT_WRITE:
        log.error(getLogPrefix(plugin.getPluginIdentifier()), 'This plugin slows down Homebridge.', warning.message, wikiInfo)
        break
      case CharacteristicWarningType.WARN_MESSAGE:
        log.info(getLogPrefix(plugin.getPluginIdentifier()), `This plugin generated a warning from the characteristic '${warning.characteristic.displayName}':`, `${warning.message}.`, wikiInfo)
        break
      case CharacteristicWarningType.ERROR_MESSAGE:
        log.error(getLogPrefix(plugin.getPluginIdentifier()), `This plugin threw an error from the characteristic '${warning.characteristic.displayName}':`, `${warning.message}.`, wikiInfo)
        break
      case CharacteristicWarningType.DEBUG_MESSAGE:
        log.debug(getLogPrefix(plugin.getPluginIdentifier()), `Characteristic '${warning.characteristic.displayName}':`, `${warning.message}.`, wikiInfo)
        break
      default: // generic message for yet unknown types
        log.info(getLogPrefix(plugin.getPluginIdentifier()), `This plugin generated a warning from the characteristic '${warning.characteristic.displayName}':`, `${warning.message}.`, wikiInfo)
        break
    }
    if (warning.stack) {
      log.debug(getLogPrefix(plugin.getPluginIdentifier()), warning.stack)
    }
  }

  /**
   * Say so in plain words when the port set for the bridge is in use by
   * another program. HAP-NodeJS can not listen on it then, and Homebridge
   * stops with an EADDRINUSE error that does not name the setting.
   */
  public async checkBridgePort(): Promise<void> {
    const port = this.bridgeConfig.port
    if (typeof port === 'number' && port > 0 && await isPortInUse(port)) {
      log.error(
        'The port %d set for the bridge \'%s\' is in use by another program, so the bridge can not start on it. '
        + 'Stop the other program, or set a different port for this bridge in the config.',
        port,
        this.bridgeConfig.name,
      )
    }
  }

  public publishBridge(): void {
    const bridgeConfig = this.bridgeConfig

    const info = this.bridge.getService(Service.AccessoryInformation)!
    info.setCharacteristic(Characteristic.Manufacturer, bridgeConfig.manufacturer || DEFAULT_BRIDGE_DEFAULTS.manufacturer)
    info.setCharacteristic(Characteristic.Model, bridgeConfig.model || DEFAULT_BRIDGE_DEFAULTS.model)
    info.setCharacteristic(Characteristic.SerialNumber, bridgeConfig.serialNumber || bridgeConfig.username)
    info.setCharacteristic(Characteristic.FirmwareRevision, bridgeConfig.firmwareRevision || getVersion())

    this.bridge.on(AccessoryEventTypes.LISTENING, (port: number) => {
      log.success('Homebridge v%s (HAP v%s) (%s) is running on port %s.', getVersion(), HAPLibraryVersion(), bridgeConfig.name, port)
    })

    const publishInfo: PublishInfo = {
      username: bridgeConfig.username,
      port: bridgeConfig.port,
      pincode: bridgeConfig.pin,
      category: Categories.BRIDGE,
      bind: bridgeConfig.bind,
      addIdentifyingMaterial: shouldAddIdentifyingMaterial(bridgeConfig.hap),
      advertiser: bridgeConfig.advertiser,
    }

    if (bridgeConfig.setupID && bridgeConfig.setupID.length === 4) {
      publishInfo.setupID = bridgeConfig.setupID
    }

    log.debug('Publishing bridge accessory (name: %s, publishInfo: %o).', this.bridge.displayName, BridgeService.strippingPinCode(publishInfo))
    // bridge.publish() returns a promise that can reject (e.g. mDNS
    // bring-up failure). Surface those rejections — fire-and-forget swallowed
    // them silently, so a failed publish only manifested as the bridge never
    // appearing in HomeKit with no log explanation.
    this.bridge.publish(publishInfo, this.allowInsecureAccess).catch((error: unknown) => {
      const message = error instanceof Error
        ? error.message
        : String(error)
      log.error('Failed to publish bridge accessory \'%s\': %s', this.bridge.displayName, message)
    })
  }

  /**
   * Attempt to load the cached accessories from disk.
   */
  public async loadCachedPlatformAccessoriesFromDisk(): Promise<void> {
    let cachedAccessories: unknown = null
    let fromBackup = false

    try {
      cachedAccessories = await this.storageService.getItem<unknown>(this.bridgeOptions.cachedAccessoriesItemName)
    } catch (error: any) {
      log.error('Failed to load cached accessories from disk:', error.message)
      if (error instanceof SyntaxError) {
        // syntax error probably means invalid JSON / corrupted file; try and restore from backup
        cachedAccessories = await this.restoreCachedAccessoriesBackup()
        fromBackup = true
      } else {
        log.error('Not restoring cached accessories - some accessories may be reset.')
      }
    }

    // Valid JSON that is not a list of accessories is as unusable as a file that does not parse
    if (cachedAccessories !== null && !Array.isArray(cachedAccessories)) {
      log.error(`The ${this.bridgeOptions.cachedAccessoriesItemName} file does not hold a list of accessories.`)
      cachedAccessories = fromBackup
        ? null
        : await this.restoreCachedAccessoriesBackup()
      fromBackup = true
    }

    if (Array.isArray(cachedAccessories)) {
      log.info(`Loaded ${cachedAccessories.length} cached accessories from ${this.bridgeOptions.cachedAccessoriesItemName}.`)

      // One entry that can not be turned back into an accessory must not stop
      // the others loading, or stop Homebridge starting: skip it and say so.
      const accessories: PlatformAccessory[] = []
      for (const serialized of cachedAccessories as SerializedPlatformAccessory[]) {
        try {
          accessories.push(PlatformAccessory.deserialize(serialized))
        } catch (error: unknown) {
          log.error(
            `Skipping the cached accessory '${serialized?.displayName ?? 'unknown'}' as it could not be read:`,
            error instanceof Error
              ? error.message
              : error,
          )
        }
      }
      this.cachedPlatformAccessories = accessories

      // Back the file up only when it was read in full. A file that came from
      // the backup, or that holds a bad entry, must not replace a good backup.
      if (!fromBackup && accessories.length > 0 && accessories.length === cachedAccessories.length) {
        await this.createCachedAccessoriesBackup()
      }
    }

    this.cachedAccessoriesFileLoaded = true
  }

  /**
   * Return the name of the backup cache file
   */
  private get backupCacheFileName() {
    return `.${this.bridgeOptions.cachedAccessoriesItemName}.bak`
  }

  /**
   * Create a backup of the cached file
   * This is used if we ever have trouble reading the main cache file
   */
  private async createCachedAccessoriesBackup(): Promise<void> {
    try {
      await this.storageService.copyItem(this.bridgeOptions.cachedAccessoriesItemName, this.backupCacheFileName)
    } catch (error: any) {
      log.warn(`Failed to create a backup of the ${this.bridgeOptions.cachedAccessoriesItemName} cached accessories file:`, error.message)
    }
  }

  /**
   * Restore a cached accessories backup
   * This is used if the main cache file has a JSON syntax error / is corrupted
   */
  private async restoreCachedAccessoriesBackup(): Promise<SerializedPlatformAccessory[] | null> {
    try {
      const cachedAccessories = await this.storageService.getItem<SerializedPlatformAccessory[]>(this.backupCacheFileName)
      if (!Array.isArray(cachedAccessories)) {
        return null
      }
      if (cachedAccessories.length) {
        log.warn(`Recovered ${cachedAccessories.length} accessories from ${this.bridgeOptions.cachedAccessoriesItemName} cache backup.`)
      }
      return cachedAccessories
    } catch (error: any) {
      return null
    }
  }

  public restoreCachedPlatformAccessories(): void {
    // NOTE: `platformPlugins.configureAccessory(accessory)` below runs plugin code
    // synchronously, and plugins commonly call `api.registerPlatformAccessories()`,
    // `api.updatePlatformAccessories()` or `api.unregisterPlatformAccessories()` from
    // within that very callback (e.g. to add/remove a companion accessory, or to swap
    // in an updated accessory instance). Those calls mutate `this.cachedPlatformAccessories`
    // while this method is still iterating over it. Previously this method finished by
    // reassigning `this.cachedPlatformAccessories` to the filtered result of the *original*
    // pre-iteration array, which silently discarded any such concurrent mutation. Instead,
    // we iterate a snapshot of the original list and only remove orphaned accessories from
    // whatever `this.cachedPlatformAccessories` holds once iteration has finished. The
    // snapshot must be a copy — `handleRegisterPlatformAccessories()` pushes into the live
    // array, and a `for...of` over the live array would visit those new accessories and
    // configure/bridge them a second time.
    const accessoriesToRestore = [...this.cachedPlatformAccessories]
    const orphanedAccessories = new Set<PlatformAccessory>()

    for (const accessory of accessoriesToRestore) {
      // Skip accessories the plugin unregistered from an earlier configureAccessory()
      // call in this same loop — they are already off the bridge and out of the cache.
      if (!this.cachedPlatformAccessories.includes(accessory)) {
        continue
      }

      let plugin = this.pluginManager.getPlugin(accessory._associatedPlugin!)
      if (!plugin) { // a little explainer here. This section is basically here to resolve plugin name changes of dynamic platform plugins
        try {
          // resolve platform accessories by searching for plugins which registered a dynamic platform for the given name
          plugin = this.pluginManager.getPluginByActiveDynamicPlatform(accessory._associatedPlatform!)

          if (plugin) { // if it's undefined the no plugin was found
            // could improve on this by calculating the Levenshtein distance to only allow platform ownership changes
            // when something like a typo happened. Are there other reasons the name could change?
            // And how would we define the threshold?

            log.info(`When searching for the associated plugin of the accessory '${accessory.displayName}' `
              + `it seems like the plugin name changed from '${accessory._associatedPlugin}' to '${
                plugin.getPluginIdentifier()}'. Plugin association is now being transformed!`)

            accessory._associatedPlugin = plugin.getPluginIdentifier() // update the associated plugin to the new one
          }
        } catch (error: any) { // error is thrown if multiple plugins where found for the given platform name
          log.info(`Could not find the associated plugin for the accessory '${accessory.displayName}'. `
            + `Tried to find the plugin by the platform name but ${error.message}`)
        }
      }

      const platformPlugins = plugin && plugin.getActiveDynamicPlatform(accessory._associatedPlatform!)
      if (plugin) {
        this.watchCharacteristicWarnings(plugin, accessory._associatedHAPAccessory)
      }

      if (!platformPlugins) {
        log.info(`Failed to find plugin to handle accessory ${accessory._associatedHAPAccessory.displayName}`)
        if (!this.bridgeOptions.keepOrphanedCachedAccessories) {
          log.info(`Removing orphaned accessory ${accessory._associatedHAPAccessory.displayName}`)
          orphanedAccessories.add(accessory) // remove it from the list
          continue
        }
      } else {
        // We set a placeholder for FirmwareRevision before configureAccessory is called so the plugin has the opportunity to override it.
        accessory.getService(Service.AccessoryInformation)?.setCharacteristic(Characteristic.FirmwareRevision, '0')
        // A platform that only does Matter may have no configureAccessory
        if (typeof platformPlugins.configureAccessory === 'function') {
          platformPlugins.configureAccessory(accessory)
        }

        // The plugin may have unregistered this very accessory while it was
        // being configured: it is out of the cache then, and must stay off the bridge.
        if (!this.cachedPlatformAccessories.includes(accessory)) {
          continue
        }
      }

      try {
        this.bridge.addBridgedAccessory(accessory._associatedHAPAccessory)
      } catch (error: any) {
        log.warn(`${accessory._associatedPlugin
          ? getLogPrefix(accessory._associatedPlugin)
          : ''} Could not restore cached accessory '${accessory._associatedHAPAccessory.displayName}':`, error.message)
        orphanedAccessories.add(accessory) // remove it from the list
      }
    }

    if (orphanedAccessories.size > 0) {
      this.cachedPlatformAccessories = this.cachedPlatformAccessories.filter(
        accessory => !orphanedAccessories.has(accessory),
      )
    }
  }

  /**
   * Save the cached accessories back to disk.
   */
  public saveCachedPlatformAccessoriesOnDisk(): void {
    try {
      // only save the cache file back to disk if we have already attempted to load it
      // this should prevent the cache being deleted should homebridge be shutdown before it has finished launching
      if (this.cachedAccessoriesFileLoaded) {
        const serializedAccessories = this.cachedPlatformAccessories.map(accessory => PlatformAccessory.serialize(accessory))
        this.storageService.setItemSync(this.bridgeOptions.cachedAccessoriesItemName, serializedAccessories)
      }
    } catch (error: any) {
      log.error('Failed to save cached accessories to disk:', error.message)
      log.error('Your accessories will not persist between restarts until this issue is resolved.')
    }
  }

  /**
   * Save metadata for currently published external accessories so external tools (e.g. the
   * Homebridge UI) can attribute each accessory to the plugin that published it. The
   * underlying HAP `AccessoryInfo` files do not store plugin attribution.
   */
  public saveExternalAccessoriesMetadataOnDisk(): void {
    try {
      const entries = Array.from(this.publishedExternalAccessoriesMetadata.values())
      if (entries.length === 0) {
        this.storageService.removeItemSync(this.bridgeOptions.externalAccessoriesItemName)
        return
      }
      this.storageService.setItemSync(this.bridgeOptions.externalAccessoriesItemName, entries)
    } catch (error: any) {
      log.error('Failed to save external accessories metadata to disk:', error.message)
    }
  }

  handleRegisterPlatformAccessories(accessories: PlatformAccessory[]): void {
    // In HAP externalsOnly mode the bridge accessory itself is never published,
    // so bridged accessories registered here are added to the (unpublished)
    // bridge and will not advertise. Log a debug breadcrumb for parity with the
    // Matter manager's externalsOnly drop-stubs — external accessories still
    // publish via handlePublishExternalAccessories.
    if (isHapExternalsOnly(this.bridgeConfig.hap)) {
      log.debug(`HAP externalsOnly mode: ${accessories.length} bridged accessor${accessories.length === 1
        ? 'y'
        : 'ies'} registered to this bridge will not be advertised (only external accessories publish).`)
    }

    const cachedAccessories = new Map(
      this.cachedPlatformAccessories.map(accessory => [accessory._associatedHAPAccessory.UUID, accessory]),
    )
    const bridgedAccessories = new Map(
      this.bridge.bridgedAccessories.map(accessory => [accessory.UUID, accessory]),
    )
    let added = false

    for (const accessory of accessories) {
      const newUUID = accessory._associatedHAPAccessory.UUID

      // Check for UUID collision against already-cached platform accessories.
      const cachedCollision = cachedAccessories.get(newUUID)
      if (cachedCollision) {
        log.warn(
          'Accessory \'%s\' has the same UUID as existing accessory \'%s\' (UUID: %s). Skipping duplicate.',
          accessory.displayName,
          cachedCollision.displayName,
          newUUID,
        )
        continue
      }

      // Also check against accessories that came in via the legacy
      // (static / accessories[]) load path — they live directly on the
      // bridge, not in cachedPlatformAccessories. Without this check the
      // collision would only surface as a hard throw deep inside HAP-NodeJS
      // at addBridgedAccessories time.
      const bridgedCollision = bridgedAccessories.get(newUUID)
      if (bridgedCollision) {
        log.warn(
          'Accessory \'%s\' has the same UUID as existing bridged accessory \'%s\' (UUID: %s). Skipping duplicate.',
          accessory.displayName,
          bridgedCollision.displayName,
          newUUID,
        )
        continue
      }

      // Into the cache only once HAP-NodeJS has taken the accessory. It refuses
      // more than its limit of accessories on one bridge, and one that was
      // published on its own before. That throw went back into the plugin
      // (from didFinishLaunching it stopped Homebridge starting), with the
      // refused accessory and the rest of the batch in the cache but not on
      // the bridge.
      try {
        this.bridge.addBridgedAccessory(accessory._associatedHAPAccessory, true)
      } catch (error: unknown) {
        log.error(
          '%s The accessory \'%s\' could not be added to the bridge \'%s\' and is not registered: %s%s',
          accessory._associatedPlugin
            ? getLogPrefix(accessory._associatedPlugin)
            : '',
          accessory.displayName,
          this.bridge.displayName,
          error instanceof Error
            ? error.message
            : error,
          this.bridge.bridgedAccessories.length >= MAX_BRIDGED_ACCESSORIES
            ? `. A bridge can hold ${MAX_BRIDGED_ACCESSORIES} accessories at most: run the plugin as a child bridge, or remove accessories.`
            : '',
        )
        continue
      }
      added = true

      this.cachedPlatformAccessories.push(accessory)
      cachedAccessories.set(newUUID, accessory)

      const plugin = this.pluginManager.getPlugin(accessory._associatedPlugin!)
      if (plugin) {
        const platforms = plugin.getActiveDynamicPlatform(accessory._associatedPlatform!)

        if (!platforms) {
          log.warn('The plugin \'%s\' registered a new accessory for the platform \'%s\'. The platform couldn\'t be found though!', accessory._associatedPlugin!, accessory._associatedPlatform!)
        }

        this.watchCharacteristicWarnings(plugin, accessory._associatedHAPAccessory)
      } else {
        log.warn('A platform configured a new accessory under the plugin name \'%s\'. However no loaded plugin could be found for the name!', accessory._associatedPlugin)
      }
    }

    if (added) {
      // The accessories were added one by one with the update of the
      // configuration put off; adding an empty list sends that one update.
      this.bridge.addBridgedAccessories([])
    }
    this.saveCachedPlatformAccessoriesOnDisk()
  }

  handleUpdatePlatformAccessories(accessories: PlatformAccessory[]): void {
    if (!Array.isArray(accessories)) {
      // This could be quite destructive if a non-array is passed in, so we'll just ignore it.
      return
    }

    // Swap in the object the plugin passed for each accessory that is in the
    // cache, in place. One that is not in the cache is left out: it was never
    // registered, was unregistered since, or is an external accessory (which
    // can not be saved, and would make every later save of the cache fail).
    const updated = new Map<string, PlatformAccessory>()
    for (const accessory of accessories) {
      updated.set(accessory.UUID, accessory)
    }
    this.cachedPlatformAccessories = this.cachedPlatformAccessories.map((cached) => {
      const replacement = updated.get(cached.UUID)
      updated.delete(cached.UUID)
      return replacement ?? cached
    })
    for (const accessory of updated.values()) {
      log.warn(
        'Ignoring an update for the accessory \'%s\' (UUID: %s), which is not registered as a platform accessory on this bridge.',
        accessory.displayName,
        accessory.UUID,
      )
    }

    // Update persisted accessories
    this.saveCachedPlatformAccessoriesOnDisk()
  }

  handleUnregisterPlatformAccessories(accessories: PlatformAccessory[]): void {
    const removedAccessories = new Set(accessories)
    this.cachedPlatformAccessories = this.cachedPlatformAccessories.filter(
      accessory => !removedAccessories.has(accessory),
    )
    // Only what is really on the bridge. HAP-NodeJS throws for anything else,
    // and a plugin may well unregister an accessory that is not there (yet):
    // a cached one from inside configureAccessory(), before the restore has
    // reached it, or the same accessory twice. That throw went back into the
    // plugin, and from configureAccessory() it stopped Homebridge starting.
    const bridgedAccessories = new Set(this.bridge.bridgedAccessories)
    const hapAccessories = accessories
      .map(accessory => accessory._associatedHAPAccessory)
      .filter(hapAccessory => bridgedAccessories.has(hapAccessory))

    if (hapAccessories.length > 0) {
      this.bridge.removeBridgedAccessories(hapAccessories)
    }
    this.saveCachedPlatformAccessoriesOnDisk()
  }

  async handlePublishExternalAccessories(accessories: PlatformAccessory[]): Promise<void> {
    // HAP must be enabled to publish externals, unless the bridge is in
    // externalsOnly mode (where the bridge itself is suppressed but its
    // externals continue to advertise as standalone HAP accessories).
    const hap = this.bridgeConfig.hap
    if (!isHapConfigEnabled(hap) && !isHapExternalsOnly(hap)) {
      log.debug('Skipping external accessory HAP publish: HAP is disabled for this bridge (hap.enabled=false).')
      return
    }

    const accessoryPin = this.bridgeConfig.pin

    for (const accessory of accessories) {
      const hapAccessory = accessory._associatedHAPAccessory
      const advertiseAddress = generate(hapAccessory.UUID)

      // This handler runs from an event, so the plugin can not catch what it
      // throws: an error here became an unhandled rejection, which shuts
      // Homebridge down. A problem with one accessory is logged, and the
      // others in the batch are still published.
      let accessoryPort: number | undefined
      try {
        // get external port allocation
        accessoryPort = await this.externalPortService.requestPort(advertiseAddress)
      } catch (error: unknown) {
        log.error(
          'Could not get a port for the external accessory \'%s\', so it is not published: %s',
          hapAccessory.displayName,
          error instanceof Error
            ? error.message
            : error,
        )
        continue
      }

      if (this.publishedExternalAccessories.has(advertiseAddress)) {
        log.error(
          'The external accessory \'%s\' is not published: an external accessory with the same UUID (%s) is published already.',
          hapAccessory.displayName,
          hapAccessory.UUID,
        )
        continue
      }

      // A port from the pool that another program holds would end Homebridge
      // with an uncaught EADDRINUSE. Use a random free port for this accessory
      // instead, as is done when the pool has run out.
      if (accessoryPort !== undefined && await isPortInUse(accessoryPort)) {
        log.warn(
          'The port %d from the \'ports\' range in the config is in use by another program. The external accessory \'%s\' is given a random port instead.',
          accessoryPort,
          hapAccessory.displayName,
        )
        accessoryPort = undefined
      }

      this.publishedExternalAccessories.set(advertiseAddress, accessory)
      this.publishedExternalAccessoriesMetadata.set(advertiseAddress, {
        username: advertiseAddress,
        plugin: accessory._associatedPlugin!,
        displayName: hapAccessory.displayName,
        category: accessory.category,
        port: accessoryPort,
      })

      const plugin = this.pluginManager.getPlugin(accessory._associatedPlugin!)
      if (plugin) {
        hapAccessory.on(AccessoryEventTypes.CHARACTERISTIC_WARNING, BridgeService.printCharacteristicWriteWarning.bind(this, plugin, hapAccessory, { ignoreSlow: true }))
      } else if (PluginManager.isQualifiedPluginIdentifier(accessory._associatedPlugin!)) {
        // we did already complain in api.ts if it wasn't a qualified name
        log.warn('A platform configured a external accessory under the plugin name \'%s\'. However no loaded plugin could be found for the name!', accessory._associatedPlugin)
      }

      hapAccessory.on(AccessoryEventTypes.LISTENING, (port: number) => {
        log.success('%s is running on port %s.', hapAccessory.displayName, port)
        log.info('Please add [%s] manually in Home app. Setup Code: %s', hapAccessory.displayName, accessoryPin)
      })

      const publishInfo: PublishInfo = {
        username: advertiseAddress,
        pincode: accessoryPin,
        category: accessory.category,
        port: accessoryPort,
        bind: this.bridgeConfig.bind,
        addIdentifyingMaterial: shouldAddIdentifyingMaterial(this.bridgeConfig.hap),
        advertiser: this.bridgeConfig.advertiser,
      }

      log.debug('Publishing external accessory (name: %s, publishInfo: %o).', hapAccessory.displayName, BridgeService.strippingPinCode(publishInfo))
      hapAccessory.publish(publishInfo, this.allowInsecureAccess).catch((error: unknown) => {
        const message = error instanceof Error
          ? error.message
          : String(error)
        log.error('Failed to publish external accessory \'%s\': %s', hapAccessory.displayName, message)
      })
    }

    this.saveExternalAccessoriesMetadataOnDisk()
  }

  public createHAPAccessory(plugin: Plugin, accessoryInstance: AccessoryPlugin, displayName: string, accessoryType: AccessoryName | AccessoryIdentifier, uuidBase?: string): Accessory | undefined {
    const services = (accessoryInstance.getServices() || [])
      .filter(service => !!service) // filter out undefined values; a common mistake
    const controllers = ((accessoryInstance.getControllers && accessoryInstance.getControllers()) || [])
      .filter(controller => !!controller)

    if (services.length === 0 && controllers.length === 0) { // check that we only add valid accessory with at least one service
      return undefined
    }

    // The returned "services" for this accessory are simply an array of new-API-style
    // Service instances which we can add to a created HAP-NodeJS Accessory directly.
    const accessoryUUID = uuid.generate(`${accessoryType}:${uuidBase || displayName}`)
    const accessory = new Accessory(displayName, accessoryUUID)

    // listen for the identify event if the accessory instance has defined an identify() method
    if (accessoryInstance.identify) {
      accessory.on(AccessoryEventTypes.IDENTIFY, (paired: boolean, callback: VoidCallback) => {
        // @ts-expect-error: empty callback for backwards compatibility
        accessoryInstance.identify!(() => {})
        callback()
      })
    }

    const informationService = accessory.getService(Service.AccessoryInformation)!
    services.forEach((service) => {
      // if you returned an AccessoryInformation service, merge its values with ours
      if (service instanceof Service.AccessoryInformation) {
        service.setCharacteristic(Characteristic.Name, displayName) // ensure display name is set
        // ensure the plugin has not hooked already some listeners (some weird ones do).
        // Otherwise, they would override our identify listener registered by the HAP-NodeJS accessory
        service.getCharacteristic(Characteristic.Identify).removeAllListeners(CharacteristicEventTypes.SET)

        // pull out any values and listeners (get and set) you may have defined
        informationService.replaceCharacteristicsFromService(service)
      } else {
        accessory.addService(service)
      }
    })

    accessory.on(AccessoryEventTypes.CHARACTERISTIC_WARNING, BridgeService.printCharacteristicWriteWarning.bind(this, plugin, accessory, {}))

    controllers.forEach((controller) => {
      accessory.configureController(controller)
    })

    return accessory
  }

  public async loadPlatformAccessories(plugin: Plugin, platformInstance: StaticPlatformPlugin, platformType: PlatformName | PlatformIdentifier, logger: Logging): Promise<void> {
    // Plugin 1.0, load accessories
    return new Promise((resolve) => {
      // warn the user if the static platform is blocking the startup of Homebridge for to long
      const loadDelayWarningInterval = setInterval(() => {
        log.warn(getLogPrefix(plugin.getPluginIdentifier()), 'This plugin is taking long time to load and preventing Homebridge from starting. See https://homebridge.io/w/JtMGR for more info.')
      }, 20000)

      platformInstance.accessories(once((accessories: AccessoryPlugin[]) => {
        // clear the load delay warning interval
        clearInterval(loadDelayWarningInterval)

        // loop through accessories adding them to the list and registering them
        accessories.forEach((accessoryInstance, index) => {
          // @ts-expect-error: assume this property was set
          const accessoryName = accessoryInstance.name

          // @ts-expect-error: optional base uuid
          const uuidBase: string | undefined = accessoryInstance.uuid_base

          log.info('Initializing platform accessory \'%s\'...', accessoryName)

          // One accessory the bridge refuses (HAP-NodeJS throws for a second
          // accessory with the same UUID, which here means the same name) must
          // not stop the others, or stop Homebridge starting.
          try {
            const accessory = this.createHAPAccessory(plugin, accessoryInstance, accessoryName, platformType, uuidBase)

            if (accessory) {
              this.bridge.addBridgedAccessory(accessory)
            } else {
              logger.info('Platform %s returned an accessory at index %d with an empty set of services; not adding it to the bridge.', platformType, index)
            }
          } catch (error: unknown) {
            logger.error(
              `Error loading the accessory "${accessoryName}" (index ${index}) of the platform "${platformType}" from "${plugin.getPluginIdentifier()}":`,
              error instanceof Error
                ? error.message
                : error,
            )
          }
        })

        resolve()
      }))
    })
  }

  /**
   * Take the bridge and its external accessories off the network, save the
   * cache and tell the plugins that Homebridge is shutting down.
   *
   * Everything but the wait happens before this returns. The promise is for
   * the goodbye that HAP-NodeJS sends for each accessory: it resolves when
   * they are all sent, or after {@link UNPUBLISH_TIMEOUT} at the latest, and
   * never rejects (a failed unpublish is logged).
   */
  teardown(): Promise<void> {
    const accessories = [
      this.bridge,
      ...Array.from(this.publishedExternalAccessories.values(), accessory => accessory._associatedHAPAccessory),
    ]
    const unpublished = Promise.allSettled(accessories.map(async accessory => accessory.unpublish()))
      .then((results) => {
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            log.warn(
              'Could not take \'%s\' off the network cleanly: %s',
              accessories[index].displayName,
              result.reason instanceof Error
                ? result.reason.message
                : result.reason,
            )
          }
        })
      })

    this.saveCachedPlatformAccessoriesOnDisk()

    // signalShutdown fires last so plugin shutdown listeners run with the
    // UPDATE_PLATFORM_ACCESSORIES handler still attached. Plugins may do
    // async cleanup (e.g. cancelling subscriptions on exposed devices) and
    // call api.updatePlatformAccessories() afterwards; that call needs the
    // handler in place to persist any context updates to disk.
    this.api.signalShutdown()

    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, UNPUBLISH_TIMEOUT)
      timer.unref()
    })
    return Promise.race([unpublished, timeout]).finally(() => clearTimeout(timer))
  }

  private static strippingPinCode(publishInfo: PublishInfo): PublishInfo {
    const info = {
      ...publishInfo,
    }
    info.pincode = '***-**-***'
    return info
  }
}
