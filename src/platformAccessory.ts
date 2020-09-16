import { EventEmitter } from "events";
import {
  Accessory,
  AccessoryEventTypes,
  CameraController,
  Categories,
  Controller,
  ControllerConstructor,
  LegacyCameraSource,
  SerializedAccessory,
  Service,
  WithUUID,
} from "hap-nodejs";
import { PlatformName, PluginIdentifier, PluginName } from "./api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UnknownContext = Record<string, any>;

export interface SerializedPlatformAccessory<T extends UnknownContext = UnknownContext> extends SerializedAccessory {

  plugin: PluginName;
  platform: PlatformName;
  context: T;

}

export const enum PlatformAccessoryEvent {
  IDENTIFY = "identify",
}

export declare interface PlatformAccessory {

  on(event: "identify", listener: () => void): this;

  emit(event: "identify"): boolean;

}


export class PlatformAccessory<T extends UnknownContext = UnknownContext>  extends EventEmitter {

  // somewhat ugly way to inject custom Accessory object, while not changing the publicly exposed constructor signature
  private static injectedAccessory?: Accessory;

  _associatedPlugin?: PluginIdentifier; // present as soon as it is registered
  _associatedPlatform?: PlatformName; // not present for external accessories

  _associatedHAPAccessory: Accessory;

  // ---------------- HAP Accessory mirror ----------------
  displayName: string;
  UUID: string;
  category: Categories;
  services: Service[] = [];
  /**
   * @deprecated reachability has no effect and isn't supported anymore
   */
  reachable = false;
  // ------------------------------------------------------

  /**
   * This is a way for Plugin developers to store custom data with their accessory
   */
  public context: T = {} as T; // providing something to store

  constructor(displayName: string, uuid: string, category?: Categories) { // category is only useful for external accessories
    super();
    this._associatedHAPAccessory = PlatformAccessory.injectedAccessory
      ? PlatformAccessory.injectedAccessory
      : new Accessory(displayName, uuid);

    if (category) {
      this._associatedHAPAccessory.category = category;
    }

    this.displayName = this._associatedHAPAccessory.displayName;
    this.UUID = this._associatedHAPAccessory.UUID;
    this.category = category || Categories.OTHER;
    this.services = this._associatedHAPAccessory.services;

    // forward identify event
    this._associatedHAPAccessory.on(AccessoryEventTypes.IDENTIFY, (paired, callback) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      this.emit(PlatformAccessoryEvent.IDENTIFY, paired, () => {}); // empty callback for backwards compatibility
      callback();
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public addService(service: Service | typeof Service, ...constructorArgs: any[]): Service {
    return this._associatedHAPAccessory.addService(service, ...constructorArgs);
  }

  public removeService(service: Service): void {
    this._associatedHAPAccessory.removeService(service);
  }

  public getService<T extends WithUUID<typeof Service>>(name: string | T): Service | undefined {
    return this._associatedHAPAccessory.getService(name);
  }

  /**
   *
   * @param uuid
   * @param subType
   * @deprecated use {@link getServiceById} directly
   */
  public getServiceByUUIDAndSubType<T extends WithUUID<typeof Service>>(uuid: string | T, subType: string): Service | undefined {
    return this.getServiceById(uuid, subType);
  }

  public getServiceById<T extends WithUUID<typeof Service>>(uuid: string | T, subType: string): Service | undefined {
    return this._associatedHAPAccessory.getServiceById(uuid, subType);
  }

  /**
   *
   * @param reachable
   * @deprecated reachability has no effect and isn't supported anymore
   */
  public updateReachability(reachable: boolean): void {
    this.reachable = reachable;
  }

  /**
   *
   * @param cameraSource
   * @deprecated see {@link Accessory.configureCameraSource}
   */
  public configureCameraSource(cameraSource: LegacyCameraSource): CameraController {
    return this._associatedHAPAccessory.configureCameraSource(cameraSource);
  }

  public configureController(controller: Controller | ControllerConstructor): void {
    this._associatedHAPAccessory.configureController(controller);
  }

  // private
  static serialize(accessory: PlatformAccessory): SerializedPlatformAccessory {
    return {
      plugin: accessory._associatedPlugin!,
      platform: accessory._associatedPlatform!,
      context: accessory.context,
      ...Accessory.serialize(accessory._associatedHAPAccessory),
    };
  }

  static deserialize(json: SerializedPlatformAccessory): PlatformAccessory {
    const accessory = Accessory.deserialize(json);

    PlatformAccessory.injectedAccessory = accessory;
    const platformAccessory = new PlatformAccessory(accessory.displayName, accessory.UUID);
    PlatformAccessory.injectedAccessory = undefined;

    platformAccessory._associatedPlugin = json.plugin;
    platformAccessory._associatedPlatform = json.platform;
    platformAccessory.context = json.context;
    platformAccessory.category = json.category;

    return platformAccessory;
  }

}
