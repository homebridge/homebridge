import type {
  Controller,
  ControllerConstructor,
  SerializedAccessory,
  VoidCallback,
  WithUUID,
} from '@homebridge/hap-nodejs'
import type { ConstructorArgs } from '@homebridge/hap-nodejs/dist/types.js'

import type { PlatformName, PluginIdentifier, PluginName } from './api.js'

import { EventEmitter } from 'node:events'

import { Accessory, AccessoryEventTypes, Categories, Service } from '@homebridge/hap-nodejs'

import { Logger } from './logger.js'

export type UnknownContext = Record<string, any>

/**
 * The service methods a plugin calls on a service it is using. Calling any of
 * them on a service restored from the cache marks it as used this run.
 *
 * HAP calls some of these itself, but only on AccessoryInformation,
 * ProtocolInformation and controller services, which are never reported as
 * unused anyway. `getCharacteristicByIID` is left out on purpose: HAP uses it
 * to answer the Home app, so it says nothing about the plugin.
 */
const SERVICE_USE_METHODS = [
  'addCharacteristic',
  'addLinkedService',
  'addOptionalCharacteristic',
  'getCharacteristic',
  'removeCharacteristic',
  'removeLinkedService',
  'replaceCharacteristicsFromService',
  'setCharacteristic',
  'setHiddenService',
  'setPrimaryService',
  'testCharacteristic',
  'updateCharacteristic',
] as const

export interface SerializedPlatformAccessory<T extends UnknownContext = UnknownContext> extends SerializedAccessory {
  plugin: PluginName
  platform: PlatformName
  context: T
}

// eslint-disable-next-line no-restricted-syntax
export const enum PlatformAccessoryEvent {
  IDENTIFY = 'identify',
}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export declare interface PlatformAccessory {
  on: (event: 'identify', listener: () => void) => this
  emit: (event: 'identify') => boolean
}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export class PlatformAccessory<T extends UnknownContext = UnknownContext> extends EventEmitter {
  // somewhat ugly way to inject custom Accessory object, while not changing the publicly exposed constructor signature
  private static injectedAccessory?: Accessory

  _associatedPlugin?: PluginIdentifier // present as soon as it is registered
  _associatedPlatform?: PlatformName // not present for external accessories
  _associatedHAPAccessory: Accessory

  // ---------------- HAP Accessory mirror ----------------
  displayName: string
  UUID: string
  category: Categories
  services: Service[] = []
  // ------------------------------------------------------

  /**
   * This is a way for Plugin developers to store custom data with their accessory
   */
  public context: T = {} as T // providing something to store

  // The services the plugin has used since Homebridge started. Only consulted
  // for an accessory restored from the cache, see findUnusedServices
  private readonly _usedServices = new WeakSet<Service>()
  // Whether the plugin has reached this accessory at all this run, through its
  // own calls rather than HAP's. One it has not reached - a device not found
  // since the restart, say - says nothing about which services are stale
  private _touchedByPlugin = false
  // Set while HAP itself works on the accessory. Removing a service, for one,
  // makes HAP call removeLinkedService on every other service, which says
  // nothing about what the plugin uses
  private _hapAtWork = false

  constructor(displayName: string, uuid: string, category?: Categories) { // category is only useful for external accessories
    super()
    this._associatedHAPAccessory = PlatformAccessory.injectedAccessory
      ? PlatformAccessory.injectedAccessory
      : new Accessory(displayName, uuid)

    if (category) {
      this._associatedHAPAccessory.category = category
    }

    this.displayName = this._associatedHAPAccessory.displayName
    this.UUID = this._associatedHAPAccessory.UUID
    this.category = category || Categories.OTHER
    this.services = this._associatedHAPAccessory.services

    // forward identify event
    this._associatedHAPAccessory.on(AccessoryEventTypes.IDENTIFY, (paired: boolean, callback: VoidCallback) => {
      // @ts-expect-error: empty callback for backwards compatibility
      this.emit(PlatformAccessoryEvent.IDENTIFY, paired, () => {})
      callback()
    })
  }

  public updateDisplayName(name: string): void {
    if (name) {
      this.displayName = name
      this._associatedHAPAccessory.displayName = name
    }
  }

  public addService(service: Service): Service
  public addService<S extends typeof Service>(serviceConstructor: S, ...constructorArgs: ConstructorArgs<S>): Service
  public addService(service: Service | typeof Service, ...constructorArgs: any[]): Service {
    this._touchedByPlugin = true
    // @ts-expect-error: while the HAP-NodeJS interface was refined, the underlying implementation
    //  still only operates on an any[] array. Therefore, do not require any additional checks here
    //  we force the parameter unpack with expecting a ts-error.
    return this._markServiceUsed(this._associatedHAPAccessory.addService(service, ...constructorArgs))
  }

  public removeService(service: Service): void {
    this._touchedByPlugin = true
    this._warnOnRiskyRemoval(service)
    this._whileHapAtWork(() => this._associatedHAPAccessory.removeService(service))
  }

  public getService<T extends WithUUID<typeof Service>>(name: string | T): Service | undefined {
    this._touchedByPlugin = true
    return this._markServiceUsed(this._associatedHAPAccessory.getService(name))
  }

  public getServiceById<T extends WithUUID<typeof Service>>(uuid: string | T, subType: string): Service | undefined {
    this._touchedByPlugin = true
    return this._markServiceUsed(this._associatedHAPAccessory.getServiceById(uuid, subType))
  }

  /**
   * Configures a new controller for the given accessory.
   * See {@link https://developers.homebridge.io/HAP-NodeJS/classes/accessory.html#configurecontroller | Accessory.configureController}.
   *
   * @param controller
   */
  public configureController(controller: Controller | ControllerConstructor): void {
    this._whileHapAtWork(() => this._associatedHAPAccessory.configureController(controller))
  }

  /**
   * Removes a configured controller from the given accessory.
   * See {@link https://developers.homebridge.io/HAP-NodeJS/classes/accessory.html#removecontroller | Accessory.removeController}.
   *
   * @param controller
   */
  public removeController(controller: Controller): void {
    this._whileHapAtWork(() => this._associatedHAPAccessory.removeController(controller))
  }

  private _whileHapAtWork(work: () => void): void {
    const wasAtWork = this._hapAtWork
    this._hapAtWork = true
    try {
      work()
    } finally {
      this._hapAtWork = wasAtWork
    }
  }

  private _markServiceUsed<S extends Service | undefined>(service: S): S {
    if (service) {
      this._usedServices.add(service)
      PlatformAccessory.unwatchService(service)
    }
    return service
  }

  /**
   * Watch the services restored from the cache, so one the plugin only reaches
   * through `accessory.services` still counts as used once it calls into it.
   * Each watcher removes itself on first use, so a used service costs nothing.
   */
  private _watchRestoredServices(): void {
    for (const service of this.services) {
      for (const method of SERVICE_USE_METHODS) {
        const original = service[method] as (...args: unknown[]) => unknown
        Object.defineProperty(service, method, {
          configurable: true,
          writable: true,
          value: (...args: unknown[]) => {
            if (!this._hapAtWork) {
              // HAP reads the information services itself when it publishes,
              // so a call into one of those does not show the plugin was here
              if (!PlatformAccessory.isHapService(service)) {
                this._touchedByPlugin = true
              }
              this._markServiceUsed(service)
            }
            return original.apply(service, args)
          },
        })
      }
    }
  }

  private static unwatchService(service: Service): void {
    for (const method of SERVICE_USE_METHODS) {
      if (Object.hasOwn(service, method)) {
        delete (service as unknown as Record<string, unknown>)[method]
      }
    }
  }

  /**
   * The services on an accessory restored from the cache that its plugin has
   * not used since Homebridge started. Nothing is removed - this is a report.
   *
   * Never listed: AccessoryInformation and ProtocolInformation, which HAP
   * manages, and any service that belongs to a controller (a camera or a
   * doorbell, say), configured or still waiting in the cache to be. A service
   * linked from a used one counts as used, because the plugin reaches it
   * through that link.
   *
   * Only meaningful once the plugin has set the accessory up, so an accessory
   * the plugin has not reached at all this run is left out entirely.
   */
  static findUnusedServices(accessory: PlatformAccessory): Service[] {
    const used = new Set<Service>()
    const addUsed = (service: Service) => {
      if (used.has(service)) {
        return
      }
      used.add(service)
      service.linkedServices.forEach(addUsed)
    }
    accessory.services.filter(service => accessory._usedServices.has(service)).forEach(addUsed)

    // Not reached at all means the plugin has not set the accessory up yet,
    // rather than that every service is stale
    if (!accessory._touchedByPlugin) {
      return []
    }

    const candidates = accessory.services.filter(service => !PlatformAccessory.isHapService(service) && !used.has(service))
    if (candidates.length === 0) {
      return []
    }

    const controllerServiceIds = PlatformAccessory.controllerServiceIds(accessory)
    return candidates.filter(service => !controllerServiceIds.has(service.getServiceId()))
  }

  /**
   * Warn, without refusing, when a plugin removes a service that HAP or a
   * controller still relies on. Removing either is almost always a mistake,
   * and its effect only shows later: an accessory HomeKit will not pair, or a
   * controller that throws on the next start because the services it saved
   * have gone (#3980).
   */
  private _warnOnRiskyRemoval(service: Service): void {
    if (!this.services.includes(service)) {
      return
    }

    const plugin = this._associatedPlugin ?? 'unknown'
    if (PlatformAccessory.isHapService(service)) {
      Logger.internal.warn(
        'The plugin \'%s\' removed the %s service from the accessory \'%s\'. HAP manages this service, and the accessory may not work without it.',
        plugin,
        service.displayName,
        this.displayName,
      )
      return
    }

    if (PlatformAccessory.controllerServiceIds(this).has(service.getServiceId())) {
      Logger.internal.warn(
        'The plugin \'%s\' removed the %s service from the accessory \'%s\', but a controller on the accessory still uses it. '
        + 'The controller may fail when Homebridge next starts. To stop using the controller, remove it with accessory.removeController() instead.',
        plugin,
        service.displayName,
        this.displayName,
      )
    }
  }

  /**
   * The ids of every service that belongs to one of the accessory's
   * controllers (a camera, doorbell or remote, say), including controllers
   * restored from the cache that the plugin has not configured again yet.
   * Serialising is the one place HAP lists both.
   */
  static isHapService(service: Service): boolean {
    return service.UUID === Service.AccessoryInformation.UUID || service.UUID === Service.ProtocolInformation.UUID
  }

  static controllerServiceIds(accessory: PlatformAccessory): Set<string> {
    const controllers = Accessory.serialize(accessory._associatedHAPAccessory).controllers ?? []
    return new Set(controllers.flatMap(controller => Object.values(controller.services)))
  }

  // private
  static serialize(accessory: PlatformAccessory): SerializedPlatformAccessory {
    if (!accessory._associatedPlugin) {
      throw new Error(`Cannot serialize accessory '${accessory.displayName}' - missing associated plugin`)
    }
    if (!accessory._associatedPlatform) {
      throw new Error(`Cannot serialize accessory '${accessory.displayName}' - missing associated platform`)
    }

    accessory._associatedHAPAccessory.displayName = accessory.displayName
    return {
      plugin: accessory._associatedPlugin,
      platform: accessory._associatedPlatform,
      context: accessory.context,
      ...Accessory.serialize(accessory._associatedHAPAccessory),
    }
  }

  static deserialize(json: SerializedPlatformAccessory): PlatformAccessory {
    const accessory = Accessory.deserialize(json)

    PlatformAccessory.injectedAccessory = accessory
    const platformAccessory = new PlatformAccessory(accessory.displayName, accessory.UUID)
    PlatformAccessory.injectedAccessory = undefined

    platformAccessory._associatedPlugin = json.plugin
    platformAccessory._associatedPlatform = json.platform
    platformAccessory.context = json.context
    platformAccessory.category = json.category
    platformAccessory._watchRestoredServices()

    return platformAccessory
  }
}
