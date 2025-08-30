import { Logger } from "./logger";
import { MatterConfiguration } from "./matterService";

const log = Logger.internal;

export interface MatterConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate Matter configuration for production readiness
 */
export class MatterConfigValidator {
  
  /**
   * Validate a Matter configuration object
   */
  static validate(config: MatterConfiguration): MatterConfigValidationResult {
    const result: MatterConfigValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (!config.enabled) {
      // No validation needed if Matter is disabled
      return result;
    }

    // Validate required fields
    this.validateRequired(config, result);
    
    // Validate port configuration
    this.validatePort(config, result);
    
    // Validate discriminator
    this.validateDiscriminator(config, result);
    
    // Validate passcode
    this.validatePasscode(config, result);
    
    // Validate vendor and product IDs
    this.validateVendorProductIds(config, result);
    
    // Validate device name
    this.validateDeviceName(config, result);
    
    // Validate timeout values
    this.validateTimeouts(config, result);
    
    // Check for production readiness
    this.checkProductionReadiness(config, result);

    result.isValid = result.errors.length === 0;
    
    if (result.warnings.length > 0) {
      log.warn("Matter configuration warnings:");
      result.warnings.forEach(warning => log.warn(`  - ${warning}`));
    }
    
    if (result.errors.length > 0) {
      log.error("Matter configuration errors:");
      result.errors.forEach(error => log.error(`  - ${error}`));
    }

    return result;
  }

  private static validateRequired(config: MatterConfiguration, result: MatterConfigValidationResult): void {
    const requiredFields = ["port", "discriminator", "passcode", "vendorId", "productId", "deviceName"];
    
    for (const field of requiredFields) {
      if (config[field as keyof MatterConfiguration] === undefined || config[field as keyof MatterConfiguration] === null) {
        result.errors.push(`Missing required field: ${field}`);
      }
    }
  }

  private static validatePort(config: MatterConfiguration, result: MatterConfigValidationResult): void {
    const port = config.port;
    
    if (port !== undefined) {
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        result.errors.push(`Port ${port} is invalid. Must be an integer between 1024-65535.`);
      }
      
      // Check for common conflicts
      const conflictPorts = [5353, 8080, 8443]; // mDNS, common HTTP ports
      if (conflictPorts.includes(port)) {
        result.warnings.push(`Port ${port} may conflict with other services. Consider using a different port.`);
      }
    }
  }

  private static validateDiscriminator(config: MatterConfiguration, result: MatterConfigValidationResult): void {
    const discriminator = config.discriminator;
    
    if (discriminator !== undefined) {
      if (!Number.isInteger(discriminator) || discriminator < 0 || discriminator > 4095) {
        result.errors.push(`Discriminator ${discriminator} is invalid. Must be an integer between 0-4095.`);
      }
    }
  }

  private static validatePasscode(config: MatterConfiguration, result: MatterConfigValidationResult): void {
    const passcode = config.passcode;
    
    if (passcode !== undefined) {
      const passcodeStr = passcode.toString();
      
      // Check length
      if (passcodeStr.length !== 8) {
        result.errors.push(`Passcode ${passcode} is invalid. Must be exactly 8 digits.`);
        return;
      }
      
      // Check if all digits
      if (!/^\d{8}$/.test(passcodeStr)) {
        result.errors.push(`Passcode ${passcode} is invalid. Must contain only digits.`);
        return;
      }
      
      // Check for invalid patterns
      const invalidPasscodes = [
        "00000000", "11111111", "22222222", "33333333", "44444444",
        "55555555", "66666666", "77777777", "88888888", "99999999",
        "12345678", "87654321", "01234567", "76543210"
      ];
      
      if (invalidPasscodes.includes(passcodeStr)) {
        result.errors.push(`Passcode ${passcode} is not allowed. Use a more secure, non-sequential passcode.`);
        return;
      }
      
      // Check for repeating patterns
      if (this.hasRepeatingPattern(passcodeStr)) {
        result.warnings.push(`Passcode ${passcode} has repeating patterns. Consider using a more random passcode.`);
      }
      
      // Check for common weak patterns
      if (this.isWeakPasscode(passcodeStr)) {
        result.warnings.push(`Passcode ${passcode} may be weak. Consider using a more secure passcode.`);
      }
    }
  }

  private static validateVendorProductIds(config: MatterConfiguration, result: MatterConfigValidationResult): void {
    const vendorId = config.vendorId;
    const productId = config.productId;
    
    if (vendorId !== undefined) {
      if (!Number.isInteger(vendorId) || vendorId < 0 || vendorId > 0xFFFF) {
        result.errors.push(`Vendor ID ${vendorId} is invalid. Must be an integer between 0-65535.`);
      }
      
      // Check for test vendor IDs in production
      const testVendorIds = [0xFFF1, 0xFFF2, 0xFFF3, 0xFFF4];
      if (testVendorIds.includes(vendorId)) {
        result.warnings.push(`Using test vendor ID ${vendorId}. This should not be used in production.`);
      }
    }
    
    if (productId !== undefined) {
      if (!Number.isInteger(productId) || productId < 0 || productId > 0xFFFF) {
        result.errors.push(`Product ID ${productId} is invalid. Must be an integer between 0-65535.`);
      }
    }
  }

  private static validateDeviceName(config: MatterConfiguration, result: MatterConfigValidationResult): void {
    const deviceName = config.deviceName;
    
    if (deviceName !== undefined) {
      if (typeof deviceName !== "string") {
        result.errors.push("Device name must be a string.");
        return;
      }
      
      if (deviceName.length === 0) {
        result.errors.push("Device name cannot be empty.");
        return;
      }
      
      if (deviceName.length > 32) {
        result.errors.push(`Device name "${deviceName}" is too long. Must be 32 characters or less.`);
      }
      
      // Check for invalid characters
      if (!/^[\x20-\x7E]*$/.test(deviceName)) {
        result.errors.push(`Device name "${deviceName}" contains invalid characters. Use only printable ASCII characters.`);
      }
    }
  }

  private static validateTimeouts(config: MatterConfiguration, result: MatterConfigValidationResult): void {
    const announceInterval = config.announceInterval;
    const commissioningTimeout = config.commissioningTimeout;
    
    if (announceInterval !== undefined) {
      if (!Number.isInteger(announceInterval) || announceInterval < 1 || announceInterval > 3600) {
        result.errors.push(`Announce interval ${announceInterval} is invalid. Must be between 1-3600 seconds.`);
      }
    }
    
    if (commissioningTimeout !== undefined) {
      if (!Number.isInteger(commissioningTimeout) || commissioningTimeout < 60 || commissioningTimeout > 7200) {
        result.errors.push(`Commissioning timeout ${commissioningTimeout} is invalid. Must be between 60-7200 seconds.`);
      }
    }
  }

  private static checkProductionReadiness(config: MatterConfiguration, result: MatterConfigValidationResult): void {
    // Check for default/example values that shouldn't be used in production
    if (config.passcode === 20202021) {
      result.warnings.push("Using default passcode. Change this for production deployment.");
    }
    
    if (config.discriminator === 3840) {
      result.warnings.push("Using default discriminator. Consider changing this for production deployment.");
    }
    
    if (config.deviceName === "Homebridge Matter Bridge") {
      result.warnings.push("Using default device name. Consider customizing for your deployment.");
    }
    
    // Check storage configuration
    if (!config.storageDir || config.storageDir === "./persist") {
      result.warnings.push("Using default storage directory. Ensure this directory is persistent and backed up.");
    }
    
    // Check debug settings
    if (config.debugEnabled) {
      result.warnings.push("Debug mode is enabled. Disable this in production for better performance.");
    }
  }

  private static hasRepeatingPattern(passcode: string): boolean {
    // Check for simple repeating patterns like "1212" or "123123"
    for (let len = 2; len <= 4; len++) {
      const pattern = passcode.substring(0, len);
      const repeated = pattern.repeat(Math.ceil(8 / len)).substring(0, 8);
      if (passcode === repeated) {
        return true;
      }
    }
    return false;
  }

  private static isWeakPasscode(passcode: string): boolean {
    // Check for ascending/descending sequences
    let ascending = 0;
    let descending = 0;
    
    for (let i = 1; i < passcode.length; i++) {
      const current = parseInt(passcode[i]);
      const previous = parseInt(passcode[i - 1]);
      
      if (current === previous + 1) {
        ascending++;
      } else if (current === previous - 1) {
        descending++;
      }
    }
    
    // If more than half the digits follow a pattern, consider it weak
    return ascending >= 4 || descending >= 4;
  }

  /**
   * Generate a secure random passcode
   */
  static generateSecurePasscode(): number {
    let passcode: string;
    let attempts = 0;
    const maxAttempts = 100;
    
    do {
      // Generate 8 random digits, ensuring first digit is not 0
      passcode = (Math.floor(Math.random() * 9) + 1).toString(); // First digit 1-9
      for (let i = 1; i < 8; i++) {
        passcode += Math.floor(Math.random() * 10).toString(); // Remaining digits 0-9
      }
      
      attempts++;
      if (attempts > maxAttempts) {
        throw new Error("Failed to generate secure passcode after maximum attempts");
      }
      
    } while (this.isWeakPasscode(passcode) || this.hasRepeatingPattern(passcode));
    
    return parseInt(passcode);
  }

  /**
   * Generate a random discriminator
   */
  static generateRandomDiscriminator(): number {
    return Math.floor(Math.random() * 4096);
  }
}