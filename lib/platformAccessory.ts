import {uuid, Accessory, Service, Characteristic} from "hap-nodejs";
import {EventEmitter} from 'events';

export class PlatformAccessory extends EventEmitter {

  public displayName: string;
  private UUID: string;
  private category: string;
  private services = [];
  private reachable = false;
  private context = {};
  private cameraSource: any;

  public _associatedPlugin: any;
  public _associatedPlatform: any;
  public _associatedHAPAccessory: any;

  constructor(displayName: string, UUID: string, category: string = 'none') {
    super();
    if (!displayName) throw new Error("Accessories must be created with a non-empty displayName.");
    if (!UUID) throw new Error("Accessories must be created with a valid UUID.");
    if (!uuid.isValid(UUID)) throw new Error("UUID '" + UUID + "' is not a valid UUID. Try using the provided 'generateUUID' function to create a valid UUID from any arbitrary string, like a serial number.");

    this
    .addService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Name, displayName)
    .setCharacteristic(Characteristic.Manufacturer, "Default-Manufacturer")
    .setCharacteristic(Characteristic.Model, "Default-Model")
    .setCharacteristic(Characteristic.SerialNumber, "Default-SerialNumber");    
  }

  addService(service) {
    // service might be a constructor like `Service.AccessoryInformation` instead of an instance
    // of Service. Coerce if necessary.
    if (typeof service === 'function')
      service = new (Function.prototype.bind.apply(service, arguments));
    
    // check for UUID+subtype conflict
    for (const index in this.services) {
      const existing = this.services[index];
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
  
  removeService(service) {
    let targetServiceIndex;
  
    for (const index in this.services) {
      const existingService = this.services[index];
      
      if (existingService === service) {
        targetServiceIndex = index;
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
  getService(name) {
    for (const index in this.services) {
      const service = this.services[index];
      
      if (typeof name === 'string' && (service.displayName === name || service.name === name))
        return service;
      else if (typeof name === 'function' && ((service instanceof name) || (name.UUID === service.UUID)))
        return service;
    }
  }
  
  /**
   * searchs for a Service in the services collection and returns the first Service object that matches.
   * If multiple services of the same type are present in one accessory, use getServiceByUUIDAndSubType instead.
   * @param {string} UUID Can be an UUID, a service.displayName, or a constructor of a Service
   * @param {string} subtype A subtype string to match
   * @returns Service
   */
  getServiceByUUIDAndSubType(UUID: any, subtype: string): any {
    for (const index in this.services) {
      const service = this.services[index];
      
      if (typeof UUID === 'string' && (service.displayName === UUID || service.name === UUID) && service.subtype === subtype )
        return service;
      else if (typeof UUID === 'function' && ((service instanceof UUID) || (UUID.UUID === service.UUID)) && service.subtype === subtype)
        return service;
    }
  }
  
  
  updateReachability(reachable) {
    this.reachable = reachable;
  
    if (this._associatedHAPAccessory) {
      this._associatedHAPAccessory.updateReachability(reachable);
    }
  }
  
  configureCameraSource(cameraSource) {
    this.cameraSource = cameraSource;
    for (const index in cameraSource.services) {
      const service = cameraSource.services[index];
      this.addService(service);
    }
  }
  
  public _prepareAssociatedHAPAccessory() {
    this._associatedHAPAccessory = new Accessory(this.displayName, this.UUID);
  
    if (this.cameraSource) {
      this._associatedHAPAccessory.configureCameraSource(this.cameraSource);
    }
  
    this._associatedHAPAccessory._sideloadServices(this.services);
    this._associatedHAPAccessory.category = this.category;
    this._associatedHAPAccessory.reachable = this.reachable;
    this._associatedHAPAccessory.on('identify', function(paired, callback) {
      if (this.listeners('identify').length > 0) {
      // allow implementors to identify this Accessory in whatever way is appropriate, and pass along
      // the standard callback for completion.
        this.emit('identify', paired, callback);
      } else {
        callback();
      }
    }.bind(this));
  }
  
  private _dictionaryPresentation() {
    const accessory: any = {};
  
    accessory.plugin = this._associatedPlugin;
    accessory.platform = this._associatedPlatform;
    accessory.displayName = this.displayName;
    accessory.UUID = this.UUID;
    accessory.category = this.category;
    accessory.context = this.context;
  
    const services: any = [];
    const linkedServices: any = {};
    for (const index in this.services) {
      const service = this.services[index];
      const servicePresentation: any = {};
      servicePresentation.displayName = service.displayName;
      servicePresentation.UUID = service.UUID;
      servicePresentation.subtype = service.subtype;
  
      const linkedServicesPresentation = [];
      for (const linkedServiceIdx in service.linkedServices) {
        const linkedService = service.linkedServices[linkedServiceIdx];
        linkedServicesPresentation.push(linkedService.UUID + (linkedServices.subtype || ""));
      }
      linkedServices[service.UUID + (service.subtype || "")] = linkedServicesPresentation;
  
      const characteristics = [];
      for (const cIndex in service.characteristics) {
        const characteristic = service.characteristics[cIndex];
        const characteristicPresentation: any = {};
        characteristicPresentation.displayName = characteristic.displayName;
        characteristicPresentation.UUID = characteristic.UUID;
        characteristicPresentation.props = characteristic.props;
        characteristicPresentation.value = characteristic.value;
        characteristicPresentation.eventOnlyCharacteristic = characteristic.eventOnlyCharacteristic;
        characteristics.push(characteristicPresentation);
      }
      
      servicePresentation.characteristics = characteristics;
      services.push(servicePresentation);
    }
  
    accessory.linkedServices = linkedServices;
    accessory.services = services;
    return accessory;
  }
  
  _configFromData(data) {
    this._associatedPlugin = data.plugin;
    this._associatedPlatform = data.platform;
    this.displayName = data.displayName;
    this.UUID = data.UUID;
    this.category = data.category;
    this.context = data.context;
    this.reachable = false;
  
    const services = [];
    const servicesMap = {};
  
    for (const index in data.services) {
      const service = data.services[index];
      const hapService = new Service(service.displayName, service.UUID, service.subtype);
  
      const characteristics = [];
      for (const cIndex in service.characteristics) {
        const characteristic = service.characteristics[cIndex];
        const hapCharacteristic = new Characteristic(characteristic.displayName, characteristic.UUID, characteristic.props);
        hapCharacteristic.eventOnlyCharacteristic = characteristic.eventOnlyCharacteristic;
        hapCharacteristic.value = characteristic.value;
        characteristics.push(hapCharacteristic);
      }
  
      hapService._sideloadCharacteristics(characteristics);
  
      servicesMap[service.UUID + (service.subtype || "")] = hapService;
      services.push(hapService);
    }
  
    if (data.linkedServices) {
      const linkedServices = data.linkedServices;
      for (const key in linkedServices) {
        const primaryService = servicesMap[key];
        if (primaryService) {
          const linkedServiceKeys = linkedServices[key];
          for (const linkedServiceKey in linkedServiceKeys) {
            const linkedService = servicesMap[linkedServiceKeys[linkedServiceKey]];
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
