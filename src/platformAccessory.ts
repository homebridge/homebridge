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
    // @ts-expect-error: while the HAP-NodeJS interface was refined, the underlying implementation
    //  still only operates on an any[] array. Therefore, do not require any additional checks here
    //  we force the parameter unpack with expecting a ts-error.
    return this._associatedHAPAccessory.addService(service, ...constructorArgs)
  }

  public removeService(service: Service): void {
    this._warnOnRiskyRemoval(service)
    this._associatedHAPAccessory.removeService(service)
  }

  public getService<T extends WithUUID<typeof Service>>(name: string | T): Service | undefined {
    return this._associatedHAPAccessory.getService(name)
  }

  public getServiceById<T extends WithUUID<typeof Service>>(uuid: string | T, subType: string): Service | undefined {
    return this._associatedHAPAccessory.getServiceById(uuid, subType)
  }

  /**
   * Configures a new controller for the given accessory.
   * See {@link https://developers.homebridge.io/HAP-NodeJS/classes/accessory.html#configurecontroller | Accessory.configureController}.
   *
   * @param controller
   */
  public configureController(controller: Controller | ControllerConstructor): void {
    this._associatedHAPAccessory.configureController(controller)
  }

  /**
   * Removes a configured controller from the given accessory.
   * See {@link https://developers.homebridge.io/HAP-NodeJS/classes/accessory.html#removecontroller | Accessory.removeController}.
   *
   * @param controller
   */
  public removeController(controller: Controller): void {
    this._associatedHAPAccessory.removeController(controller)
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
    if (service.UUID === Service.AccessoryInformation.UUID || service.UUID === Service.ProtocolInformation.UUID) {
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

    return platformAccessory
  }
}
