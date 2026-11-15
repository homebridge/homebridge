import type {
  Controller,
  ControllerConstructor,
  SerializedAccessory,
  Service,
  VoidCallback,
  WithUUID,
} from '@homebridge/hap-nodejs'
import type { ConstructorArgs } from '@homebridge/hap-nodejs/dist/types.js'

import type { PlatformName, PluginIdentifier, PluginName } from './api.js'

import { EventEmitter } from 'node:events'

import { Accessory, AccessoryEventTypes, Categories } from '@homebridge/hap-nodejs'

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
  /**
   * `identify` is sent when a HomeKit controller asks the accessory to
   * identify itself. The listener is called with `paired` (whether the
   * accessory is paired) and a `callback`. The callback is there for old
   * plugins and does nothing: Homebridge answers the controller itself.
   */
  on: (event: 'identify', listener: (paired: boolean, callback: VoidCallback) => void) => this
  emit: (event: 'identify', paired?: boolean, callback?: VoidCallback) => boolean
}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export class PlatformAccessory<T extends UnknownContext = UnknownContext> extends EventEmitter {
  // somewhat ugly way to inject custom Accessory object, while not changing the publicly exposed constructor signature
  private static injectedAccessory?: Accessory

  _associatedPlugin?: PluginIdentifier // present as soon as it is registered
  _associatedPlatform?: PlatformName // not present for external accessories
  _associatedHAPAccessory: Accessory

  // ---------------- HAP Accessory mirror ----------------
  /**
   * The name of the accessory. Change it with {@link updateDisplayName}.
   *
   * For an external accessory HAP-NodeJS may add a few characters to its own
   * copy of the name when the accessory is published (to keep names on the
   * network unique). This property keeps the text the plugin gave.
   */
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
      // empty callback for backwards compatibility
      this.emit(PlatformAccessoryEvent.IDENTIFY, paired, () => {})
      callback()
    })
  }

  /**
   * Change the display name of the accessory, here and on the HAP accessory.
   * An empty name is ignored.
   *
   * This does NOT change the `Name` characteristic of the
   * `AccessoryInformation` service; set that yourself when it should follow.
   * The Home app keeps the name it showed when the accessory was added.
   */
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
   * For Homebridge itself, not for plugins.
   *
   * Note the side effect: the `displayName` of the platform accessory is
   * copied onto the HAP accessory first, so a name a plugin assigned straight
   * to `displayName` is what gets saved.
   *
   * @private
   */
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
