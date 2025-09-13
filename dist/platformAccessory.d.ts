import type { Controller, ControllerConstructor, SerializedAccessory, Service, WithUUID } from 'hap-nodejs';
import type { ConstructorArgs } from 'hap-nodejs/dist/types.js';
import type { PlatformName, PluginIdentifier, PluginName } from './api.js';
import { EventEmitter } from 'node:events';
import { Accessory, Categories } from 'hap-nodejs';
export type UnknownContext = Record<string, any>;
export interface SerializedPlatformAccessory<T extends UnknownContext = UnknownContext> extends SerializedAccessory {
    plugin: PluginName;
    platform: PlatformName;
    context: T;
}
export declare const enum PlatformAccessoryEvent {
    IDENTIFY = "identify"
}
export declare interface PlatformAccessory {
    on: (event: 'identify', listener: () => void) => this;
    emit: (event: 'identify') => boolean;
}
export declare class PlatformAccessory<T extends UnknownContext = UnknownContext> extends EventEmitter {
    private static injectedAccessory?;
    _associatedPlugin?: PluginIdentifier;
    _associatedPlatform?: PlatformName;
    _associatedHAPAccessory: Accessory;
    displayName: string;
    UUID: string;
    category: Categories;
    services: Service[];
    /**
     * This is a way for Plugin developers to store custom data with their accessory
     */
    context: T;
    constructor(displayName: string, uuid: string, category?: Categories);
    updateDisplayName(name: string): void;
    addService(service: Service): Service;
    addService<S extends typeof Service>(serviceConstructor: S, ...constructorArgs: ConstructorArgs<S>): Service;
    removeService(service: Service): void;
    getService<T extends WithUUID<typeof Service>>(name: string | T): Service | undefined;
    getServiceById<T extends WithUUID<typeof Service>>(uuid: string | T, subType: string): Service | undefined;
    /**
     * Configures a new controller for the given accessory.
     * See {@link https://developers.homebridge.io/HAP-NodeJS/classes/accessory.html#configurecontroller | Accessory.configureController}.
     *
     * @param controller
     */
    configureController(controller: Controller | ControllerConstructor): void;
    /**
     * Removes a configured controller from the given accessory.
     * See {@link https://developers.homebridge.io/HAP-NodeJS/classes/accessory.html#removecontroller | Accessory.removeController}.
     *
     * @param controller
     */
    removeController(controller: Controller): void;
    static serialize(accessory: PlatformAccessory): SerializedPlatformAccessory;
    static deserialize(json: SerializedPlatformAccessory): PlatformAccessory;
}
//# sourceMappingURL=platformAccessory.d.ts.map