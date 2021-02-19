import crypto from "crypto";
import { generate, validMacAddress } from "./mac";

describe("mac", () => {
  describe("validMacAddress", () => {
    it("should verify a valid mac address", function() {
      expect(validMacAddress("61:67:0F:6E:B0:48")).toBeTruthy();
    });

    it("should reject a lower case valid mac address", function() {
      const macAddress = "0E:80:9C:B4:E4:C5";
      expect(validMacAddress(macAddress)).toBeTruthy();
      expect(validMacAddress(macAddress.toLowerCase())).toBeFalsy();
    });

    it("should reject too short mac address", function() {
      expect(validMacAddress("25:22:04:2B:3A")).toBeFalsy();
    });

    it("should reject too long mac address", function() {
      expect(validMacAddress("7F:9A:58:0E:87:23:AA")).toBeFalsy();
    });
  });

  describe("generate", () => {
    it("should generate a valid mac address", function() {
      const seed = crypto.randomBytes(4);
      const generated = generate(crypto.randomBytes(4));
      try {
        expect(validMacAddress(generated)).toBeTruthy();
      } catch (error) {
        console.log(`Invalid mac address generated '${generated}' for seed '${seed.toString("hex")}'`);
        throw error;
      }
    });
  });
});
