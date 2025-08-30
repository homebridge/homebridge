import { MatterConfigValidator } from "./matterConfigValidator";
import { MatterConfiguration } from "./matterService";

describe("MatterConfigValidator", () => {
  
  describe("validate", () => {
    it("should pass validation for disabled Matter", () => {
      const config: MatterConfiguration = { enabled: false };
      const result = MatterConfigValidator.validate(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("should pass validation for valid configuration", () => {
      const config: MatterConfiguration = {
        enabled: true,
        port: 5540,
        discriminator: 1234,
        passcode: 12345679,
        vendorId: 0x1234,
        productId: 0x5678,
        deviceName: "Test Device",
        announceInterval: 60,
        commissioningTimeout: 900,
      };
      
      const result = MatterConfigValidator.validate(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail validation for missing required fields", () => {
      const config: MatterConfiguration = { enabled: true };
      const result = MatterConfigValidator.validate(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes("port"))).toBe(true);
      expect(result.errors.some(e => e.includes("discriminator"))).toBe(true);
      expect(result.errors.some(e => e.includes("passcode"))).toBe(true);
    });

    it("should fail validation for invalid port", () => {
      const config: MatterConfiguration = {
        enabled: true,
        port: 100, // Too low
        discriminator: 1234,
        passcode: 12345679,
        vendorId: 0x1234,
        productId: 0x5678,
        deviceName: "Test",
      };
      
      const result = MatterConfigValidator.validate(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes("Port 100 is invalid"))).toBe(true);
    });

    it("should fail validation for invalid discriminator", () => {
      const config: MatterConfiguration = {
        enabled: true,
        port: 5540,
        discriminator: 5000, // Too high
        passcode: 12345679,
        vendorId: 0x1234,
        productId: 0x5678,
        deviceName: "Test",
      };
      
      const result = MatterConfigValidator.validate(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes("Discriminator 5000 is invalid"))).toBe(true);
    });

    it("should fail validation for invalid passcode length", () => {
      const config: MatterConfiguration = {
        enabled: true,
        port: 5540,
        discriminator: 1234,
        passcode: 123456, // Too short
        vendorId: 0x1234,
        productId: 0x5678,
        deviceName: "Test",
      };
      
      const result = MatterConfigValidator.validate(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes("Must be exactly 8 digits"))).toBe(true);
    });

    it("should fail validation for weak passcodes", () => {
      const weakPasscodes = [
        11111111, // All same
        12345678, // Sequential
        87654321, // Reverse sequential
        "00000000", // All zeros as string
      ];

      for (const passcode of weakPasscodes) {
        const config: MatterConfiguration = {
          enabled: true,
          port: 5540,
          discriminator: 1234,
          passcode: typeof passcode === "string" ? parseInt(passcode) : passcode,
          vendorId: 0x1234,
          productId: 0x5678,
          deviceName: "Test",
        };
        
        const result = MatterConfigValidator.validate(config);
        
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes("not allowed") || e.includes("weak"))).toBe(true);
      }
    });

    it("should fail validation for invalid vendor/product IDs", () => {
      const config: MatterConfiguration = {
        enabled: true,
        port: 5540,
        discriminator: 1234,
        passcode: 12345679,
        vendorId: 100000, // Too high
        productId: -1, // Negative
        deviceName: "Test",
      };
      
      const result = MatterConfigValidator.validate(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes("Vendor ID 100000 is invalid"))).toBe(true);
      expect(result.errors.some(e => e.includes("Product ID -1 is invalid"))).toBe(true);
    });

    it("should fail validation for invalid device name", () => {
      const config: MatterConfiguration = {
        enabled: true,
        port: 5540,
        discriminator: 1234,
        passcode: 12345679,
        vendorId: 0x1234,
        productId: 0x5678,
        deviceName: "", // Empty
      };
      
      const result = MatterConfigValidator.validate(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes("cannot be empty"))).toBe(true);
    });

    it("should fail validation for device name too long", () => {
      const config: MatterConfiguration = {
        enabled: true,
        port: 5540,
        discriminator: 1234,
        passcode: 12345679,
        vendorId: 0x1234,
        productId: 0x5678,
        deviceName: "a".repeat(50), // Too long
      };
      
      const result = MatterConfigValidator.validate(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes("too long"))).toBe(true);
    });

    it("should warn about default values", () => {
      const config: MatterConfiguration = {
        enabled: true,
        port: 5540,
        discriminator: 3840, // Default
        passcode: 20202021, // Default
        vendorId: 0xFFF1, // Test vendor
        productId: 0x8001,
        deviceName: "Homebridge Matter Bridge", // Default
      };
      
      const result = MatterConfigValidator.validate(config);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes("default passcode"))).toBe(true);
      expect(result.warnings.some(w => w.includes("default discriminator"))).toBe(true);
      expect(result.warnings.some(w => w.includes("test vendor ID"))).toBe(true);
    });
  });

  describe("generateSecurePasscode", () => {
    it("should generate an 8-digit passcode", () => {
      const passcode = MatterConfigValidator.generateSecurePasscode();
      
      expect(passcode.toString()).toHaveLength(8);
      expect(Number.isInteger(passcode)).toBe(true);
      expect(passcode).toBeGreaterThanOrEqual(10000000);
      expect(passcode).toBeLessThanOrEqual(99999999);
    });

    it("should generate different passcodes on multiple calls", () => {
      const passcodes = new Set();
      
      for (let i = 0; i < 10; i++) {
        const passcode = MatterConfigValidator.generateSecurePasscode();
        passcodes.add(passcode);
      }
      
      // Should have generated multiple unique passcodes
      expect(passcodes.size).toBeGreaterThan(5);
    });

    it("should generate secure passcodes that pass validation", () => {
      for (let i = 0; i < 5; i++) {
        const passcode = MatterConfigValidator.generateSecurePasscode();
        
        const config: MatterConfiguration = {
          enabled: true,
          port: 5540,
          discriminator: 1234,
          passcode,
          vendorId: 0x1234,
          productId: 0x5678,
          deviceName: "Test",
        };
        
        const result = MatterConfigValidator.validate(config);
        
        // Should not have passcode-related errors
        expect(result.errors.some(e => e.toLowerCase().includes("passcode"))).toBe(false);
      }
    });
  });

  describe("generateRandomDiscriminator", () => {
    it("should generate a valid discriminator", () => {
      const discriminator = MatterConfigValidator.generateRandomDiscriminator();
      
      expect(Number.isInteger(discriminator)).toBe(true);
      expect(discriminator).toBeGreaterThanOrEqual(0);
      expect(discriminator).toBeLessThanOrEqual(4095);
    });

    it("should generate different discriminators on multiple calls", () => {
      const discriminators = new Set();
      
      for (let i = 0; i < 20; i++) {
        const discriminator = MatterConfigValidator.generateRandomDiscriminator();
        discriminators.add(discriminator);
      }
      
      // Should have generated multiple unique discriminators
      expect(discriminators.size).toBeGreaterThan(10);
    });
  });
});