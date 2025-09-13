import { EventEmitter } from 'node:events';
import { Accessory } from 'hap-nodejs';
// eslint-disable-next-line no-restricted-syntax
export var PlatformAccessoryEvent;
(function (PlatformAccessoryEvent) {
    PlatformAccessoryEvent["IDENTIFY"] = "identify";
})(PlatformAccessoryEvent || (PlatformAccessoryEvent = {}));
// eslint-disable-next-line ts/no-unsafe-declaration-merging
export class PlatformAccessory extends EventEmitter {
    // somewhat ugly way to inject custom Accessory object, while not changing the publicly exposed constructor signature
    static injectedAccessory;
    _associatedPlugin; // present as soon as it is registered
    _associatedPlatform; // not present for external accessories
    _associatedHAPAccessory;
    // ---------------- HAP Accessory mirror ----------------
    displayName;
    UUID;
    category;
    services = [];
    // ------------------------------------------------------
    /**
     * This is a way for Plugin developers to store custom data with their accessory
     */
    context = {}; // providing something to store
    constructor(displayName, uuid, category) {
        super();
        this._associatedHAPAccessory = PlatformAccessory.injectedAccessory
            ? PlatformAccessory.injectedAccessory
            : new Accessory(displayName, uuid);
        if (category) {
            this._associatedHAPAccessory.category = category;
        }
        this.displayName = this._associatedHAPAccessory.displayName;
        this.UUID = this._associatedHAPAccessory.UUID;
        this.category = category || 1 /* Categories.OTHER */;
        this.services = this._associatedHAPAccessory.services;
        // forward identify event
        this._associatedHAPAccessory.on("identify" /* AccessoryEventTypes.IDENTIFY */, (paired, callback) => {
            // @ts-expect-error: empty callback for backwards compatibility
            this.emit("identify" /* PlatformAccessoryEvent.IDENTIFY */, paired, () => { });
            callback();
        });
    }
    updateDisplayName(name) {
        if (name) {
            this.displayName = name;
            this._associatedHAPAccessory.displayName = name;
        }
    }
    addService(service, ...constructorArgs) {
        // @ts-expect-error: while the HAP-NodeJS interface was refined, the underlying implementation
        //  still only operates on an any[] array. Therefore, do not require any additional checks here
        //  we force the parameter unpack with expecting a ts-error.
        return this._associatedHAPAccessory.addService(service, ...constructorArgs);
    }
    removeService(service) {
        this._associatedHAPAccessory.removeService(service);
    }
    getService(name) {
        return this._associatedHAPAccessory.getService(name);
    }
    getServiceById(uuid, subType) {
        return this._associatedHAPAccessory.getServiceById(uuid, subType);
    }
    /**
     * Configures a new controller for the given accessory.
     * See {@link https://developers.homebridge.io/HAP-NodeJS/classes/accessory.html#configurecontroller | Accessory.configureController}.
     *
     * @param controller
     */
    configureController(controller) {
        this._associatedHAPAccessory.configureController(controller);
    }
    /**
     * Removes a configured controller from the given accessory.
     * See {@link https://developers.homebridge.io/HAP-NodeJS/classes/accessory.html#removecontroller | Accessory.removeController}.
     *
     * @param controller
     */
    removeController(controller) {
        this._associatedHAPAccessory.removeController(controller);
    }
    // private
    static serialize(accessory) {
        accessory._associatedHAPAccessory.displayName = accessory.displayName;
        return {
            plugin: accessory._associatedPlugin,
            platform: accessory._associatedPlatform,
            context: accessory.context,
            ...Accessory.serialize(accessory._associatedHAPAccessory),
        };
    }
    static deserialize(json) {
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
//# sourceMappingURL=platformAccessory.js.map