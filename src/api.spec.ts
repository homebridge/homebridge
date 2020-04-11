import { API, HomebridgeAPI } from "./api";

const api = new HomebridgeAPI();
const spy = jest.spyOn(api, "emit");

describe(HomebridgeAPI, () => {

  describe("...Name", () => {
    it("should extract accessory name correctly", function() {
      const accessoryId = "homebridge-example-accessory.example";
      expect(HomebridgeAPI.getAccessoryName(accessoryId)).toBe("example");
    });

    it("should extract platform name correctly", function() {
      const accessoryId = "homebridge-example-platform.example";
      expect(HomebridgeAPI.getPlatformName(accessoryId)).toBe("example");
    });

    it("should extract plugin name correctly", function() {
      const accessoryId = "homebridge-example-plugin.example";
      expect(HomebridgeAPI.getPluginName(accessoryId)).toBe("homebridge-example-plugin");
    });
  });

});
