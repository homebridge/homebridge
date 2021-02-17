import { Service } from "hap-nodejs";
import { AccessoryPlugin, HomebridgeAPI, InternalAPIEvent, DynamicPlatformPlugin } from "./api";
import { PlatformAccessory } from "./platformAccessory";

const api = new HomebridgeAPI();
const emitSpy = jest.spyOn(api, "emit");

const pluginName = "homebridge-example";
const accessoryName = "MyCoolAccessory";
const platformName = "MyCoolPlatform";

class ExampleAccessory implements AccessoryPlugin {

  name = accessoryName

  getServices(): Service[] {
    return [new Service.Switch("TestSwitch")];
  }

}

class ExamplePlatform implements DynamicPlatformPlugin {

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  configureAccessory(accessory: PlatformAccessory): void {
    // do nothing
  }

}

describe("HomebridgeAPI", () => {
  describe("HomebridgeAPI.prototype.registerAccessory", () => {

    it("should register accessory with legacy style signature", function() {
      api.registerAccessory(pluginName, accessoryName, ExampleAccessory);
      expect(emitSpy).toHaveBeenLastCalledWith(InternalAPIEvent.REGISTER_ACCESSORY, accessoryName, ExampleAccessory, pluginName);
    });

    it("should register accessory without passing plugin name", function() {
      api.registerAccessory(accessoryName, ExampleAccessory);
      expect(emitSpy).toHaveBeenLastCalledWith(InternalAPIEvent.REGISTER_ACCESSORY, accessoryName, ExampleAccessory);
    });

  });

  describe("HomebridgeAPI.prototype.registerPlatform", () => {

    it("should register platform with legacy style signature", function() {
      api.registerPlatform(pluginName, platformName, ExamplePlatform);
      expect(emitSpy).toHaveBeenLastCalledWith(InternalAPIEvent.REGISTER_PLATFORM, platformName, ExamplePlatform, pluginName);
    });

    it("should register platform without passing plugin name", function() {
      api.registerPlatform(platformName, ExamplePlatform);
      expect(emitSpy).toHaveBeenLastCalledWith(InternalAPIEvent.REGISTER_PLATFORM, platformName, ExamplePlatform);
    });

  });
});
