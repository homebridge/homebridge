import { Plugin } from "./plugin";

describe("Plugin", () => {
  describe("Plugin reload functionality", () => {
    it("should have reload method", function() {
      const mockPackageJSON = {
        name: "homebridge-test-plugin",
        version: "1.0.0",
        main: "./index.js",
        engines: {
          homebridge: "^1.0.0",
        },
      };
      
      const plugin = new Plugin("homebridge-test-plugin", "/mock/path", mockPackageJSON);
      expect(typeof plugin.reload).toBe("function");
    });

    it("should reject reloading plugin that hasn't been loaded", async function() {
      const mockPackageJSON = {
        name: "homebridge-test-plugin",
        version: "1.0.0",
        main: "./index.js",
        engines: {
          homebridge: "^1.0.0",
        },
      };
      
      const plugin = new Plugin("homebridge-test-plugin", "/mock/path", mockPackageJSON);
      
      await expect(plugin.reload())
        .rejects.toThrow("Cannot reload plugin that has not been loaded yet!");
    });
  });
});