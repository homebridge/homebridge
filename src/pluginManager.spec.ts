import { PluginManager } from "./pluginManager";
import { HomebridgeAPI } from "./api";

describe("PluginManager", () => {
  describe("PluginManager.isQualifiedPluginIdentifier", () => {
    it("should match normal plugin names", () => {
      expect(PluginManager.isQualifiedPluginIdentifier("homebridge-dummy-plugin")).toBeTruthy();
    });

    it("should match scoped plugin names", () => {
      expect(PluginManager.isQualifiedPluginIdentifier("@organisation/homebridge-dummy-plugin")).toBeTruthy();
    });

    it("should match scoped plugin names with dots", () => {
      expect(PluginManager.isQualifiedPluginIdentifier("@organisation.com/homebridge-dummy-plugin")).toBeTruthy();
    });
  });

  describe("PluginManager.extractPluginName", () => {
    it("should extract normal plugin names", function() {
      expect(PluginManager.extractPluginName("homebridge-dummy-plugin")).toBe("homebridge-dummy-plugin");
    });

    it("should extract scoped plugin names", function() {
      expect(PluginManager.extractPluginName("@organisation/homebridge-dummy-plugin")).toBe("homebridge-dummy-plugin");
    });

    it("should extract scoped plugin names with scopes with dots in their name", function() {
      expect(PluginManager.extractPluginName("@organisation.com/homebridge-dummy-plugin")).toBe("homebridge-dummy-plugin");
    });
  });

  describe("PluginManager.extractPluginScope", () => {
    it("should extract undefined for normal plugin names", function() {
      expect(PluginManager.extractPluginScope("homebridge-dummy-plugin")).toBeUndefined();
    });

    it("should extract scope for scoped plugin names", function() {
      expect(PluginManager.extractPluginScope("@organisation/homebridge-dummy-plugin")).toBe("@organisation");
    });

    it("should extract scope for scoped plugin names with dots in their name", function() {
      expect(PluginManager.extractPluginScope("@organisation.com/homebridge-dummy-plugin")).toBe("@organisation.com");
    });
  });

  describe("...Name", () => {
    it("should extract accessory name correctly", function() {
      const accessoryId = "homebridge-example-accessory.example";
      expect(PluginManager.getAccessoryName(accessoryId)).toBe("example");
    });

    it("should extract platform name correctly", function() {
      const accessoryId = "homebridge-example-platform.example";
      expect(PluginManager.getPlatformName(accessoryId)).toBe("example");
    });

    it("should extract plugin name correctly", function() {
      const accessoryId = "homebridge-example-plugin.example";
      expect(PluginManager.getPluginIdentifier(accessoryId)).toBe("homebridge-example-plugin");
    });
  });

  describe("Plugin reload functionality", () => {
    it("should have reloadPlugin method", function() {
      const api = new HomebridgeAPI();
      const pluginManager = new PluginManager(api);
      expect(typeof pluginManager.reloadPlugin).toBe("function");
    });

    it("should reject reloading non-existent plugin", async function() {
      const api = new HomebridgeAPI();
      const pluginManager = new PluginManager(api);
      
      await expect(pluginManager.reloadPlugin("non-existent-plugin"))
        .rejects.toThrow("Plugin 'non-existent-plugin' not found or not registered.");
    });
  });

});
