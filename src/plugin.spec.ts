import { PluginManager } from "./plugin";

describe(PluginManager, () => {
  describe(PluginManager.isQualifiedPluginName, () => {
    it("should match normal plugin names", () => {
      expect(PluginManager.isQualifiedPluginName("homebridge-dummy-plugin")).toBeTruthy();
    });

    it("should match scoped plugin names", () => {
      expect(PluginManager.isQualifiedPluginName("@organisation/homebridge-dummy-plugin")).toBeTruthy();
    });
  });

  describe(PluginManager.extractPluginName, () => {
    it("should extract normal plugin names", function() {
      expect(PluginManager.extractPluginName("homebridge-dummy-plugin")).toBe("homebridge-dummy-plugin");
    });

    it("should extract scoped plugin names", function() {
      expect(PluginManager.extractPluginName("@organisation/homebridge-dummy-plugin")).toBe("homebridge-dummy-plugin");
    });
  });

  describe(PluginManager.extractPluginScope, () => {
    it("should extract undefined for normal plugin names", function() {
      expect(PluginManager.extractPluginScope("homebridge-dummy-plugin")).toBeUndefined();
    });

    it("should extract scope for scoped plugin names", function() {
      expect(PluginManager.extractPluginScope("@organisation/homebridge-dummy-plugin")).toBe("@organisation");
    });
  });
});
