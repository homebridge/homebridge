import path from "path";
import { User } from "./user";

describe("User", () => { // these tests are mainly here to ensure default locations won't get bricked in the future

  describe("User.storagePath", () => {
    it("should have valid default path", function() {
      expect(path.basename(User.storagePath())).toEqual(".homebridge");
    });
  });

  describe("User.cachedAccessoryPath", () => {
    it("should have valid default path", function() {
      expect(path.basename(User.cachedAccessoryPath())).toEqual("accessories");
    });
  });

  describe("User.persistPath", () => {
    it("should have valid default path", function() {
      expect(path.basename(User.persistPath())).toEqual("persist");
    });
  });

  describe("User.configPath", () => {
    it("should have valid default path", function() {
      expect(path.basename(User.configPath())).toEqual("config.json");
    });
  });

  describe("User.setStoragePath", () => {
    it("should fail to be overwritten after paths were already accessed", function() {
      expect(() => User.setStoragePath("otherDir")).toThrow(Error);
    });
  });

});
