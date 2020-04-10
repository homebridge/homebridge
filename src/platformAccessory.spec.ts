import { PlatformAccessory, SerializedPlatformAccessory } from "./platformAccessory";
import { Accessory, Categories, RemoteController, Service, uuid } from "hap-nodejs";

function createAccessory(name = "TestAccessory", category?: Categories): PlatformAccessory {
  const accessoryUUID = uuid.generate("test.uuid." + name);
  const accessory = new PlatformAccessory(name, accessoryUUID, category);
  accessory._associatedPlatform = "TestPlatform";
  accessory._associatedPlugin = "TestPlugin";
  accessory.context = {
    "test": "context",
    "doing": 234,
  };
  return accessory;
}

describe(PlatformAccessory, () => {

  describe("properties", () => {

    it("should mirror displayName correctly", function() {
      const accessory = createAccessory("TestName");
      expect(accessory._associatedHAPAccessory.displayName).toBe(accessory.displayName);
      expect(accessory.displayName).toBe("TestName");
    });

    it("should mirror UUID correctly", function() {
      const accessory = createAccessory("TestName");
      expect(accessory._associatedHAPAccessory.UUID).toBe(accessory.UUID);
      expect(accessory.UUID).toBe(uuid.generate("test.uuid.TestName"));
    });

    it("should mirror category correctly", function() {
      const accessory = createAccessory("TestName", Categories.APPLE_TV);
      expect(accessory._associatedHAPAccessory.category).toBe(accessory.category);
      expect(accessory.category).toBe(Categories.APPLE_TV);
    });

    it("should mirror services correctly", function() {
      const accessory = createAccessory("TestName");
      expect(accessory._associatedHAPAccessory.services).toStrictEqual(accessory.services);
      expect(accessory.services.length).toBe(1);
    });

  });

  describe(PlatformAccessory.prototype.addService, () => {
    it("should forward add service", function() {
      const accessory = createAccessory();
      const service = new Service.Switch();
      const spy = jest.spyOn(accessory._associatedHAPAccessory, "addService");

      expect(accessory.services.length).toBe(1); // AccessoryInformation service
      expect(accessory.services.includes(service)).toBeFalsy();

      accessory.addService(service);

      expect(accessory.services.length).toBe(2); // ensure our reference is valid
      expect(accessory.services.includes(service)).toBeTruthy();

      expect(spy).toHaveBeenCalledWith(service); // ensure HAP got called
    });
  });

  describe(PlatformAccessory.prototype.removeService, () => {
    it("should forward remove service", function() {
      const accessory = createAccessory();
      const service = new Service.Switch();
      const spy = jest.spyOn(accessory._associatedHAPAccessory, "removeService");

      accessory.removeService(service);
      expect(spy).toHaveBeenCalledWith(service);
    });
  });

  describe(PlatformAccessory.prototype.getService, () => {
    it("should retrieve AccessoryInformation service", function() {
      const accessory = createAccessory();
      const requested = Service.AccessoryInformation;
      const spy = jest.spyOn(accessory._associatedHAPAccessory, "getService");

      const service = accessory.getService(requested);
      expect(spy).toHaveBeenCalledWith(requested);
      expect(service).toBeDefined();
      expect(service!.UUID).toBe(requested.UUID);
    });
  });

  describe(PlatformAccessory.prototype.getServiceById, () => {
    it("should forward service retrieval by id", function() {
      const accessory = createAccessory();
      const spy = jest.spyOn(accessory._associatedHAPAccessory, "getServiceById");

      const result = accessory.getServiceById(Service.Switch, "customSubType");
      expect(result).toBeUndefined();
      expect(spy).toHaveBeenCalledWith(Service.Switch, "customSubType");
    });
  });

  describe(PlatformAccessory.prototype.configureController, () => {
    it("should forward configureController correctly", function() {
      const accessory = createAccessory();
      const spy = jest.spyOn(accessory._associatedHAPAccessory, "configureController").mockImplementationOnce(() => {
        // do nothing
      });

      const controller = new RemoteController();
      accessory.configureController(controller);
      expect(spy).toHaveBeenCalledWith(controller);
    });
  });

  describe(PlatformAccessory.serialize, () => {
    it("should serialize accessory correctly", function() {
      const accessory = createAccessory();
      accessory.addService(Service.Lightbulb);
      const spy = jest.spyOn(Accessory, "serialize");

      const json: SerializedPlatformAccessory = PlatformAccessory.serialize(accessory);

      expect(json.platform).toBe(accessory._associatedPlatform);
      expect(json.plugin).toBe(accessory._associatedPlugin);
      expect(json.context).toStrictEqual(accessory.context);
      expect(spy).toHaveBeenCalledWith(accessory._associatedHAPAccessory);
    });
  });

  describe(PlatformAccessory.deserialize, () => {
    it("should deserialize serialized accessory correctly", function() {
      const accessory = createAccessory();
      accessory.addService(Service.Lightbulb);

      const json = PlatformAccessory.serialize(accessory);
      const reconstructed = PlatformAccessory.deserialize(json);

      expect(reconstructed._associatedPlugin).toBe(accessory._associatedPlugin);
      expect(reconstructed._associatedPlatform).toBe(accessory._associatedPlatform);
      expect(reconstructed.displayName).toBe(accessory.displayName);
      expect(reconstructed.UUID).toBe(accessory.UUID);
      expect(reconstructed.category).toBe(accessory.category);
      expect(reconstructed.context).toBe(accessory.context);
    });
  });

});
