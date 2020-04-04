import { EventEmitter } from "events";
import {
  Accessory,
  AccessoryEventTypes,
  Categories,
  LegacyCameraSource,
  SerializedAccessory,
  Service,
  WithUUID,
} from "hap-nodejs";
import { PlatformName, PluginName } from "./api";

export interface SerializedPlatformAccessory extends SerializedAccessory {

    plugin: PluginName;
    platform: PlatformName;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: Record<string, any>;

}

export enum PlatformAccessoryEvent {
    IDENTIFY = "identify",
}

export declare interface PlatformAccessory {

    on(event: "identify", listener: () => void): this;

    emit(event: "identify"): boolean;

}

export class PlatformAccessory extends EventEmitter {

    // somewhat ugly way to inject custom Accessory object, while not changing the publicly exposed constructor signature
    private static injectedAccessory?: Accessory;

    _associatedPlugin?: PluginName;
    _associatedPlatform?: PlatformName; // not present for external accessories

    _associatedHAPAccessory: Accessory;

    // ---------------- HAP Accessory mirror ----------------
    displayName: string;
    UUID: string;
    category: Categories;
    services: Service[] = [];
    // ------------------------------------------------------

    /**
     * This is a way for Plugin developers to store custom data with their accessory
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public context: Record<string, any> = {}; // providing something to store

    constructor(displayName: string, uuid: string, category?: Categories) {
      super();
      this._associatedHAPAccessory = PlatformAccessory.injectedAccessory
        ? PlatformAccessory.injectedAccessory
        : new Accessory(displayName, uuid);

      this.displayName = this._associatedHAPAccessory.displayName;
      this.UUID = this._associatedHAPAccessory.UUID;
      this.category = category || Categories.OTHER;
      this.services = this._associatedHAPAccessory.services;

      // forward identify event
      this._associatedHAPAccessory.on(AccessoryEventTypes.IDENTIFY, (paired, callback) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        this.emit(PlatformAccessoryEvent.IDENTIFY, () => {}); // empty callback for backwards compatibility
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
     * @deprecated reachability isn't supported anymore
     */
    public updateReachability(reachable: boolean): void {
      this._associatedHAPAccessory.updateReachability(reachable);
    }

    /**
     *
     * @param cameraSource
     * @deprecated see {@link Accessory.configureCameraSource}
     */
    public configureCameraSource(cameraSource: LegacyCameraSource): void {
      this._associatedHAPAccessory.configureCameraSource(cameraSource);
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

      return platformAccessory;
    }

}
