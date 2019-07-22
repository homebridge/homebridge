import { EventEmitter } from 'events';

import { Accessory, Characteristic, Service, uuid } from 'hap-nodejs';
import { Config } from './types';

export class PlatformAccessory extends EventEmitter {
    displayName: any;
    UUID: any;
    category: any;
    services: HAPNodeJS.Service[];
    reachable: boolean;
    context: {};
    _associatedPlugin: any;
    _associatedPlatform: any;
    _associatedHAPAccessory: any;
    cameraSource: any;

    constructor(displayName: string, UUID: string, category: string) {
        super();
        if (!displayName) {
            throw new Error("Accessories must be created with a non-empty displayName.");
        }
        if (!UUID) {
            throw new Error("Accessories must be created with a valid UUID.");
        }
        if (!uuid.isValid(UUID)) {
            throw new Error("UUID '" + UUID + "' is not a valid UUID. Try using the provided 'generateUUID' function to create a valid UUID from any arbitrary string, like a serial number.");
        }

        this.displayName = displayName;
        this.UUID = UUID;
        this.category = category || Accessory.Categories.OTHER;
        this.services = [];
        this.reachable = false;
        this.context = {};

        this._associatedPlugin;
        this._associatedPlatform;
        this._associatedHAPAccessory;

        this
            .addService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Name, displayName)
            .setCharacteristic(Characteristic.Manufacturer, "Default-Manufacturer")
            .setCharacteristic(Characteristic.Model, "Default-Model")
            .setCharacteristic(Characteristic.SerialNumber, "Default-SerialNumber");
    }

    addService = (service: any) => {
        // service might be a constructor like `Service.AccessoryInformation` instead of an instance
        // of Service. Coerce if necessary.
        if (typeof service === 'function') {
            //@ts-ignore
            service = new (Function.prototype.bind.apply(service, arguments));
        }

        // check for UUID+subtype conflict
        for (var index in this.services) {
            var existing = this.services[index];
            if (existing.UUID === service.UUID) {
                // OK we have two Services with the same UUID. Check that each defines a `subtype` property and that each is unique.
                if (!service.subtype)
                    throw new Error("Cannot add a Service with the same UUID '" + existing.UUID + "' as another Service in this Accessory without also defining a unique 'subtype' property.");

                if (service.subtype.toString() === existing.subtype.toString())
                    throw new Error("Cannot add a Service with the same UUID '" + existing.UUID + "' and subtype '" + existing.subtype + "' as another Service in this Accessory.");
            }
        }

        this.services.push(service);

        if (this._associatedHAPAccessory) {
            this._associatedHAPAccessory.addService(service);
        }
        return service;
    }

    removeService = (service: HAPNodeJS.Service) => {
        var targetServiceIndex;

        for (var index in this.services) {
            var existingService = this.services[index];

            if (existingService === service) {
                targetServiceIndex = Number.parseInt(index, 10);
                break;
            }
        }

        if (targetServiceIndex) {
            this.services.splice(targetServiceIndex, 1);
            service.removeAllListeners();

            if (this._associatedHAPAccessory) {
                this._associatedHAPAccessory.removeService(service);
            }
        }
    }

    /**
     * searchs for a Service in the services collection and returns the first Service object that matches.
     * If multiple services of the same type are present in one accessory, use getServiceByUUIDAndSubType instead.
     * @param {ServiceConstructor|string} name
     * @returns Service
     */
    getService = (name: string | typeof Service) => {
        for (let index in this.services) {
          const service: HAPNodeJS.Service = this.services[index];

          if (typeof name === 'string' && (service.displayName === name || service.name === name)) {
            return service;
          }
          // @ts-ignore
            else if (typeof name === 'function' && ((service instanceof name) || (name.UUID === service.UUID))) {
              return service;
          }
        }
    }

    /**
     * searchs for a Service in the services collection and returns the first Service object that matches.
     * If multiple services of the same type are present in one accessory, use getServiceByUUIDAndSubType instead.
     * @param {string} UUID Can be an UUID, a service.displayName, or a constructor of a Service
     * @param {string} subtype A subtype string to match
     * @returns Service
     */
    getServiceByUUIDAndSubType = (UUID: string | typeof Service, subtype: string) => {
        for (var index in this.services) {
            var service = this.services[index];

            if (typeof UUID === 'string' && (service.displayName === UUID || service.name === UUID) && service.subtype === subtype)
                return service;
            else {
              // @ts-ignore
              if (typeof UUID === 'function' && ((service instanceof UUID) || (UUID.UUID === service.UUID)) && service.subtype === subtype)
                              return service;
            }
        }
    }


    updateReachability = (reachable: boolean) => {
        this.reachable = reachable;

        if (this._associatedHAPAccessory) {
            this._associatedHAPAccessory.updateReachability(reachable);
        }
    }

    configureCameraSource = (cameraSource: any) => {
        this.cameraSource = cameraSource;
        for (var index in cameraSource.services) {
            var service = cameraSource.services[index];
            this.addService(service);
        }
    }

    _prepareAssociatedHAPAccessory = () => {
        this._associatedHAPAccessory = new Accessory(this.displayName, this.UUID);

        if (this.cameraSource) {
            this._associatedHAPAccessory.configureCameraSource(this.cameraSource);
        }

        this._associatedHAPAccessory._sideloadServices(this.services);
        this._associatedHAPAccessory.category = this.category;
        this._associatedHAPAccessory.reachable = this.reachable;
        this._associatedHAPAccessory.on('identify', (paired: boolean, callback: () => void) => {
            if (this.listeners('identify').length > 0) {
                // allow implementors to identify this Accessory in whatever way is appropriate, and pass along
                // the standard callback for completion.
                this.emit('identify', paired, callback);
            } else {
                callback();
            }
        });
    }

    _dictionaryPresentation = () => {
        var accessory = {
            plugin: this._associatedPlugin,
            platform: this._associatedPlatform,
            displayName: this.displayName,
            UUID: this.UUID,
            category: this.category,
            context: this.context,
            services: [],
            linkedServices: {},
        };

        var services = [];
        var linkedServices: Record<string, any> = {};
        var servicePresentation;
        for (var index in this.services) {
            var service = this.services[index];
            servicePresentation = {
                displayName: service.displayName,
                UUID: service.UUID,
                subtype: service.subtype,
                characteristics: [],
            };

            var linkedServicesPresentation = [];
            //@ts-ignore
            for (var linkedServiceIdx in service.linkedServices) {
                //@ts-ignore
                var linkedService = service.linkedServices[linkedServiceIdx];
                linkedServicesPresentation.push(linkedService.UUID + (linkedServices.subtype || ""));
            }
            linkedServices[service.UUID + (service.subtype || "")] = linkedServicesPresentation;

            var characteristics = [];
            for (var cIndex in service.characteristics) {
                var characteristic = service.characteristics[cIndex] as any;
                var characteristicPresentation = {
                    displayName: characteristic.displayName,
                    UUID: characteristic.UUID,
                    props: characteristic.props,
                    value: characteristic.value,
                    eventOnlyCharacteristic: characteristic.eventOnlyCharacteristic,
                };
                characteristics.push(characteristicPresentation);
            }

            //@ts-ignore
            servicePresentation.characteristics = characteristics;
            services.push(servicePresentation);
        }

        accessory.linkedServices = linkedServices;
        //@ts-ignore
        accessory.services = services;
        return accessory;
    }

    _configFromData = (data: any) => {
        this._associatedPlugin = data.plugin;
        this._associatedPlatform = data.platform;
        this.displayName = data.displayName;
        this.UUID = data.UUID;
        this.category = data.category;
        this.context = data.context;
        this.reachable = false;

        var services = [];
        var servicesMap: Record<string, HAPNodeJS.Service> = {};

        for (var index in data.services) {
            var service = data.services[index];
            var hapService = new Service(service.displayName, service.UUID, service.subtype);

            var characteristics = [];
            for (var cIndex in service.characteristics) {
                var characteristic = service.characteristics[cIndex];
                var hapCharacteristic = new Characteristic(characteristic.displayName, characteristic.UUID, characteristic.props);
                //@ts-ignore
                hapCharacteristic.eventOnlyCharacteristic = characteristic.eventOnlyCharacteristic;
                //@ts-ignore
                hapCharacteristic.value = characteristic.value;
                characteristics.push(hapCharacteristic);
            }

            //@ts-ignore
            hapService._sideloadCharacteristics(characteristics);

            servicesMap[service.UUID + (service.subtype || "")] = hapService;
            services.push(hapService);
        }

        if (data.linkedServices) {
            var linkedServices = data.linkedServices;
            for (var key in linkedServices) {
                var primaryService = servicesMap[key];
                if (primaryService) {
                    var linkedServiceKeys = linkedServices[key];
                    for (var linkedServiceKey in linkedServiceKeys) {
                        var linkedService = servicesMap[linkedServiceKeys[linkedServiceKey]];
                        if (linkedService) {
                            primaryService.addLinkedService(linkedService);
                        }
                    }
                }
            }
        }

        this.services = services;
    }

}
