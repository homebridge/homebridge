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
    this._associatedHAPAccessory.removeService(service)
  }

  /**
   * Removes services omitted from a platform's current discovery result.
   *
   * Call this after discovery and controller configuration, never during deserialization. Pass every
   * attached plugin, controller, linked, camera, and external-accessory service that should remain.
   * Any omitted non-HAP-managed service is removed. Desired services are compared by instance, so
   * services with the same UUID but different subtypes remain independent.
   *
   * HAP-managed {@link Service.AccessoryInformation | AccessoryInformation} and
   * {@link Service.ProtocolInformation | ProtocolInformation} services always remain. Passing an
   * empty array removes every other service. This method does not persist changes or prune
   * characteristics, context, or accessories.
   *
   * @example
   * ```ts
   * accessory.reconcileServices([switchService, contactSensorService])
   * api.updatePlatformAccessories([accessory])
   * ```
   *
   * @param desiredServices The services retained after the current discovery.
   * @returns The stale services removed from this accessory.
   * @throws {@link RangeError} When a desired service is not attached to this accessory.
   */
  public reconcileServices(desiredServices: readonly Service[]): Service[] {
    const desired = new Set(desiredServices)

    for (const service of desired) {
      if (!this.services.includes(service)) {
        throw new RangeError('Cannot reconcile service that is not attached to this accessory')
      }
    }

    const staleServices = this.services.filter(service =>
      service.UUID !== Service.AccessoryInformation.UUID
      && service.UUID !== Service.ProtocolInformation.UUID
      && !desired.has(service),
    )

    for (const service of staleServices) {
      this.removeService(service)
    }

    return staleServices
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
