import { HomebridgeAPI } from "./api";
import { ExternalPortService } from "./externalPortService";
import { Logger } from "./logger";
import { MatterConfigValidator } from "./matterConfigValidator";
import { PlatformAccessory } from "./platformAccessory";
import { PluginManager } from "./pluginManager";
import { HomebridgeOptions } from "./server";
import { Service } from "hap-nodejs";
import * as crypto from "crypto";
import * as fs from "fs-extra";

// Import from @matter/main using the main module exports
const Matter = require("@matter/main");

const log = Logger.internal;

export interface MatterConfiguration {
  enabled?: boolean;
  port?: number;
  discriminator?: number;
  passcode?: number;
  vendorId?: number;
  productId?: number;
  deviceName?: string;
  deviceType?: number;
  storageDir?: string;
  debugEnabled?: boolean;
  interfaceName?: string;
  announceInterval?: number;
  commissioningTimeout?: number;
}

export interface MatterBridgeOptions extends HomebridgeOptions {
  matterConfig?: MatterConfiguration;
}

/**
 * Matter service for publishing accessories via Matter protocol
 * This runs alongside the existing HAP bridge service
 */
export class MatterService {
  private matterServer: any | null = null;
  private commissioningServer: any | null = null;
  private storageManager: any | null = null;
  private readonly isEnabled: boolean;
  private readonly matterConfig: MatterConfiguration;
  private publishedAccessories: Map<string, { accessory: PlatformAccessory; endpoint: any }> = new Map();
  private isInitialized = false;
  private isStarted = false;

  constructor(
    private matterConfiguration: MatterConfiguration,
    private pluginManager: PluginManager,
    private externalPortService: ExternalPortService,
    private api: HomebridgeAPI,
    private options: HomebridgeOptions,
  ) {
    this.matterConfig = {
      enabled: false,
      port: 5540,
      discriminator: 3840,
      passcode: 20202021,
      vendorId: 0xFFF1, // Test Vendor ID
      productId: 0x8001, // Test Product ID
      deviceName: "Homebridge Matter Bridge",
      deviceType: 0x0016, // Matter Bridge device type
      storageDir: options.customStoragePath || "./persist",
      debugEnabled: false,
      interfaceName: undefined,
      announceInterval: 60,
      commissioningTimeout: 900, // 15 minutes
      ...matterConfiguration,
    };
    
    this.isEnabled = this.matterConfig.enabled || false;
    this.validateConfiguration();
    
    if (this.isEnabled) {
      log.info("Matter service enabled");
    } else {
      log.debug("Matter service disabled");
    }
  }

  /**
   * Validate Matter configuration parameters
   */
  private validateConfiguration(): void {
    if (!this.isEnabled) {
      return;
    }

    const validationResult = MatterConfigValidator.validate(this.matterConfig);
    
    if (!validationResult.isValid) {
      const errorMessage = `Matter configuration validation failed:\n${validationResult.errors.join('\n')}`;
      throw new Error(errorMessage);
    }

    if (validationResult.warnings.length > 0) {
      log.warn("Matter configuration has warnings - see above for details");
    }

    log.info(`Matter configuration validated successfully: port=${this.matterConfig.port}, discriminator=${this.matterConfig.discriminator}`);
  }

  /**
   * Initialize the Matter server if enabled
   */
  async initialize(): Promise<void> {
    if (!this.isEnabled || this.isInitialized) {
      return;
    }

    try {
      log.info("Initializing Matter server...");
      
      // Initialize storage
      await this.initializeStorage();
      
      // Create and configure Matter server node
      await this.createMatterServer();
      
      // Setup commissioning server
      await this.setupCommissioningServer();
      
      this.isInitialized = true;
      
      log.info("Matter server initialized successfully");
      this.logCommissioningInfo();
      
    } catch (error) {
      log.error("Failed to initialize Matter server:", error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Initialize storage for Matter server
   */
  private async initializeStorage(): Promise<void> {
    try {
      // Create storage directory if it doesn't exist
      const storageDir = `${this.matterConfig.storageDir}/matter`;
      await fs.ensureDir(storageDir);
      
      // Use placeholder storage manager for now
      // In production, this would use proper Matter.js storage
      this.storageManager = {
        initialized: true,
        async initialize() { return Promise.resolve(); },
        async close() { return Promise.resolve(); },
      };
      
      await this.storageManager.initialize();
      log.debug("Matter storage initialized");
      
    } catch (error) {
      log.error("Failed to initialize Matter storage:", error);
      throw error;
    }
  }

  /**
   * Create the Matter server node
   */
  private async createMatterServer(): Promise<void> {
    if (!this.storageManager) {
      throw new Error("Storage manager not initialized");
    }

    try {
      // Create placeholder Matter server
      // In production, this would be a real Matter.js ServerNode
      this.matterServer = {
        started: false,
        devices: new Map(),
        async start() { 
          this.started = true;
          return Promise.resolve(); 
        },
        async stop() { 
          this.started = false;
          return Promise.resolve(); 
        },
        async addDevice(device: any) {
          const id = crypto.randomUUID();
          this.devices.set(id, device);
          return { id, device };
        },
        async removeDevice(endpoint: any) {
          this.devices.delete(endpoint.id);
          return Promise.resolve();
        },
      };

      log.debug("Matter server node created (placeholder implementation)");
      
    } catch (error) {
      log.error("Failed to create Matter server node:", error);
      throw error;
    }
  }

  /**
   * Setup commissioning server for device pairing
   */
  private async setupCommissioningServer(): Promise<void> {
    if (!this.matterServer) {
      throw new Error("Matter server not created");
    }

    try {
      // Create placeholder commissioning server
      // In production, this would be a real Matter.js CommissioningServer
      this.commissioningServer = {
        started: false,
        async start() { 
          this.started = true;
          return Promise.resolve(); 
        },
        async stop() { 
          this.started = false;
          return Promise.resolve(); 
        },
      };

      log.debug("Matter commissioning server configured (placeholder implementation)");
      
    } catch (error) {
      log.error("Failed to setup commissioning server:", error);
      throw error;
    }
  }

  /**
   * Generate a unique serial number for the Matter bridge
   */
  private generateSerialNumber(): string {
    // Use the HAP bridge username as base for consistency
    const hapBridge = this.api.hap?.HAPStorage.storage()?.getItem("AccessoryInfo.CC:22:3D:E3:CE:30");
    if (hapBridge && hapBridge.serialNumber) {
      return `HB-${hapBridge.serialNumber}`;
    }
    
    // Fallback to generated serial
    return `HB-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
  }

  /**
   * Generate a unique identifier for the Matter bridge
   */
  private generateUniqueId(): string {
    // Use the HAP bridge ID as base for consistency
    const hapBridge = this.api.hap?.HAPStorage.storage()?.getItem("AccessoryInfo.CC:22:3D:E3:CE:30");
    if (hapBridge && hapBridge.id) {
      return `homebridge-matter-${hapBridge.id}`;
    }
    
    // Fallback to generated ID
    return `homebridge-matter-${crypto.randomUUID()}`;
  }

  /**
   * Log commissioning information for users
   */
  private logCommissioningInfo(): void {
    try {
      // Generate placeholder QR code info
      // In production, this would use real Matter.js QrCode.encode()
      const setupCode = `MT:${this.matterConfig.discriminator!.toString().padStart(4, "0")}${this.matterConfig.passcode!}`;
      const qrCode = `https://dhrishi.github.io/connectedhomeip/qrcode.html?data=${setupCode}`;

      log.info("Matter bridge is ready for commissioning:");
      log.info(`  Setup Code: ${setupCode}`);
      log.info(`  QR Code URL: ${qrCode}`);
      log.info(`  Manual Pairing Code: ${this.formatPairingCode(this.matterConfig.passcode!)}`);
      log.info(`  Discriminator: ${this.matterConfig.discriminator}`);
      log.info(`  Port: ${this.matterConfig.port}`);
      log.info("  Note: This is a development implementation - QR codes may not work with all controllers");
      
    } catch (error) {
      log.warn("Could not generate commissioning QR code:", error);
      log.info(`Matter bridge ready - Manual setup: Passcode ${this.matterConfig.passcode}, Discriminator ${this.matterConfig.discriminator}`);
    }
  }

  /**
   * Format passcode for manual pairing
   */
  private formatPairingCode(passcode: number): string {
    const code = passcode.toString().padStart(8, "0");
    return `${code.slice(0, 3)}-${code.slice(3, 5)}-${code.slice(5)}`;
  }

  /**
   * Start the Matter server
   */
  async start(): Promise<void> {
    if (!this.isEnabled || !this.matterServer || this.isStarted) {
      return;
    }

    try {
      log.info("Starting Matter server...");
      
      // Start the Matter server node
      await this.matterServer.start();
      
      // Start commissioning
      if (this.commissioningServer) {
        await this.commissioningServer.start();
      }
      
      this.isStarted = true;
      log.info(`Matter server started successfully on port ${this.matterConfig.port}`);
      
    } catch (error) {
      log.error("Failed to start Matter server:", error);
      this.isStarted = false;
      throw error;
    }
  }

  /**
   * Stop the Matter server
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      log.info("Stopping Matter server...");
      
      // Stop commissioning server
      if (this.commissioningServer) {
        await this.commissioningServer.stop();
      }
      
      // Stop Matter server
      if (this.matterServer) {
        await this.matterServer.stop();
      }
      
      await this.cleanup();
      
      this.isStarted = false;
      log.info("Matter server stopped successfully");
      
    } catch (error) {
      log.error("Failed to stop Matter server:", error);
      this.isStarted = false;
    }
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    try {
      // Close storage
      if (this.storageManager) {
        await this.storageManager.close();
        this.storageManager = null;
      }
      
      this.matterServer = null;
      this.commissioningServer = null;
      this.publishedAccessories.clear();
      this.isInitialized = false;
      
    } catch (error) {
      log.error("Error during Matter service cleanup:", error);
    }
  }

  /**
   * Publish a platform accessory via Matter protocol
   */
  async publishAccessory(accessory: PlatformAccessory): Promise<void> {
    if (!this.isEnabled || !this.matterServer || !this.isStarted) {
      log.debug(`Cannot publish accessory "${accessory.displayName}" - Matter server not ready`);
      return;
    }

    try {
      log.debug(`Publishing accessory "${accessory.displayName}" via Matter...`);
      
      // Convert HAP accessory to Matter device
      const matterDevice = await this.convertToMatterDevice(accessory);
      
      if (matterDevice) {
        // Add the device to the Matter server as a bridged device
        const endpoint = await this.matterServer.addDevice(matterDevice);
        
        // Track the published accessory
        this.publishedAccessories.set(accessory.UUID, {
          accessory,
          endpoint,
        });
        
        log.info(`Published accessory "${accessory.displayName}" via Matter successfully`);
      } else {
        log.warn(`Could not convert accessory "${accessory.displayName}" to Matter device - unsupported services`);
      }
    } catch (error) {
      log.error(`Failed to publish accessory "${accessory.displayName}" via Matter:`, error);
    }
  }

  /**
   * Unpublish a platform accessory from Matter protocol
   */
  async unpublishAccessory(accessory: PlatformAccessory): Promise<void> {
    if (!this.isEnabled || !this.matterServer) {
      return;
    }

    try {
      const publishedDevice = this.publishedAccessories.get(accessory.UUID);
      if (publishedDevice) {
        // Remove the device from the Matter server
        await this.matterServer.removeDevice(publishedDevice.endpoint);
        
        // Remove from tracking
        this.publishedAccessories.delete(accessory.UUID);
        
        log.info(`Unpublished accessory "${accessory.displayName}" from Matter successfully`);
      } else {
        log.debug(`Accessory "${accessory.displayName}" was not published via Matter`);
      }
    } catch (error) {
      log.error(`Failed to unpublish accessory "${accessory.displayName}" from Matter:`, error);
    }
  }

  /**
   * Convert HAP accessory to Matter device
   * This maps HAP services and characteristics to appropriate Matter clusters and attributes
   */
  private async convertToMatterDevice(accessory: PlatformAccessory): Promise<unknown | null> {
    try {
      log.debug(`Converting accessory "${accessory.displayName}" to Matter device...`);
      
      // Get the primary service (excluding AccessoryInformation and other utility services)
      const primaryService = this.getPrimaryService(accessory);
      if (!primaryService) {
        log.warn(`No primary service found for accessory "${accessory.displayName}"`);
        return null;
      }
      
      const serviceType = primaryService.constructor.name;
      const characteristics = primaryService.characteristics.map(char => char.constructor.name);
      
      log.debug(`Primary service: ${serviceType}, characteristics: ${characteristics.join(", ")}`);
      
      // Determine the appropriate Matter device type and clusters
      const deviceType = this.getMatterDeviceType(serviceType, characteristics);
      if (!deviceType) {
        log.warn(`Unsupported service type for Matter conversion: ${serviceType}`);
        return null;
      }
      
      // Create the Matter device with appropriate clusters
      const matterDevice = await this.createMatterDevice(deviceType, accessory, primaryService);
      
      log.debug(`Successfully converted "${accessory.displayName}" to Matter ${deviceType} device`);
      return matterDevice;
      
    } catch (error) {
      log.error(`Error converting accessory "${accessory.displayName}" to Matter device:`, error);
      return null;
    }
  }

  /**
   * Get the primary service from an accessory (excluding utility services)
   */
  private getPrimaryService(accessory: PlatformAccessory): Service | null {
    const utilityServices = [
      "AccessoryInformation",
      "BridgingState", 
      "HAPProtocolInformation",
      "Pairing",
      "BridgeConfiguration",
    ];
    
    for (const service of accessory.services) {
      const serviceType = service.constructor.name;
      if (!utilityServices.includes(serviceType)) {
        return service;
      }
    }
    
    return null;
  }

  /**
   * Determine the appropriate Matter device type for a HAP service
   */
  private getMatterDeviceType(serviceType: string, characteristics: string[]): string | null {
    // Handle lighting services with specific capabilities
    if (serviceType === "Lightbulb") {
      if (characteristics.includes("Hue") && characteristics.includes("Saturation")) {
        return "ExtendedColorLight";
      } else if (characteristics.includes("ColorTemperature")) {
        return "ColorTemperatureLight";
      } else if (characteristics.includes("Brightness")) {
        return "DimmableLight";
      } else {
        return "OnOffLight";
      }
    }

    // Handle outlet services
    if (serviceType === "Outlet") {
      if (characteristics.includes("Brightness")) {
        return "DimmablePlugInUnit";
      } else {
        return "OnOffPlugInUnit";
      }
    }

    // Handle switch services  
    if (serviceType === "Switch") {
      if (characteristics.includes("Brightness")) {
        return "DimmerSwitch";
      } else {
        return "OnOffLightSwitch";
      }
    }

    // Direct mapping for other services
    const directMappings: Record<string, string> = {
      "TemperatureSensor": "TemperatureSensor",
      "HumiditySensor": "HumiditySensor",
      "LightSensor": "LightSensor",
      "MotionSensor": "OccupancySensor",
      "OccupancySensor": "OccupancySensor",
      "ContactSensor": "ContactSensor",
      "LeakSensor": "WaterLeakDetector",
      "SmokeSensor": "SmokeCoAlarm",
      "CarbonMonoxideSensor": "SmokeCoAlarm",
      "LockManagement": "DoorLock",
      "Thermostat": "Thermostat",
      "Fan": "Fan",
      "Fanv2": "Fan",
      "WindowCovering": "WindowCovering",
      "StatelessProgrammableSwitch": "GenericSwitch",
      "Valve": "WaterValve",
    };

    return directMappings[serviceType] || null;
  }

  /**
   * Create a Matter device with the specified type and map characteristics
   */
  private async createMatterDevice(deviceType: string, accessory: PlatformAccessory, primaryService: Service): Promise<unknown> {
    log.debug(`Creating Matter device of type ${deviceType} (placeholder implementation)`);
    
    // Create a placeholder Matter device
    // In production, this would use real Matter.js device classes
    const device = {
      type: deviceType,
      accessoryUUID: accessory.UUID,
      displayName: accessory.displayName,
      services: accessory.services.map(s => ({
        type: s.constructor.name,
        characteristics: s.characteristics.map(c => ({
          type: c.constructor.name,
          value: c.value,
        })),
      })),
      // Placeholder clusters based on device type
      clusters: this.getPlaceholderClusters(deviceType),
    };

    // Map characteristics to Matter attributes (placeholder)
    await this.mapCharacteristicsToMatter(device, primaryService);

    return device;
  }

  /**
   * Get placeholder clusters for a device type
   */
  private getPlaceholderClusters(deviceType: string): string[] {
    const clusterMappings: Record<string, string[]> = {
      "OnOffLight": ["OnOff", "Identify"],
      "DimmableLight": ["OnOff", "LevelControl", "Identify"],
      "ExtendedColorLight": ["OnOff", "LevelControl", "ColorControl", "Identify"],
      "TemperatureSensor": ["TemperatureMeasurement", "Identify"],
      "HumiditySensor": ["RelativeHumidityMeasurement", "Identify"],
      "ContactSensor": ["BooleanState", "Identify"],
      "DoorLock": ["DoorLock", "Identify"],
      "WindowCovering": ["WindowCovering", "Identify"],
      "Thermostat": ["Thermostat", "Identify"],
      "Fan": ["FanControl", "Identify"],
    };
    
    return clusterMappings[deviceType] || ["Identify"];
  }

  /**
   * Map HAP characteristics to Matter cluster attributes
   */
  private async mapCharacteristicsToMatter(matterDevice: any, hapService: Service): Promise<void> {
    try {
      log.debug(`Mapping characteristics for service ${hapService.constructor.name} (placeholder implementation)`);
      
      // This is a placeholder implementation that tracks the mapping
      // In production, this would actually sync values between HAP and Matter
      matterDevice.characteristicMappings = [];
      
      for (const characteristic of hapService.characteristics) {
        const charType = characteristic.constructor.name;
        
        const mapping = {
          hapCharacteristic: charType,
          hapValue: characteristic.value,
          matterCluster: this.getMatterClusterForCharacteristic(charType),
          matterAttribute: this.getMatterAttributeForCharacteristic(charType),
        };
        
        matterDevice.characteristicMappings.push(mapping);
        
        log.debug(`Mapped ${charType} -> ${mapping.matterCluster}.${mapping.matterAttribute}`);
      }
      
    } catch (error) {
      log.error("Error mapping characteristics to Matter:", error);
    }
  }

  /**
   * Get the Matter cluster name for a HAP characteristic
   */
  private getMatterClusterForCharacteristic(charType: string): string {
    const mappings: Record<string, string> = {
      "On": "OnOff",
      "Brightness": "LevelControl",
      "Hue": "ColorControl",
      "Saturation": "ColorControl",
      "ColorTemperature": "ColorControl",
      "CurrentTemperature": "TemperatureMeasurement",
      "CurrentRelativeHumidity": "RelativeHumidityMeasurement",
      "ContactSensorState": "BooleanState",
      "MotionDetected": "OccupancySensing",
      "LockCurrentState": "DoorLock",
      "CurrentPosition": "WindowCovering",
      "CurrentHeatingCoolingState": "Thermostat",
      "RotationSpeed": "FanControl",
    };
    
    return mappings[charType] || "Unknown";
  }

  /**
   * Get the Matter attribute name for a HAP characteristic
   */
  private getMatterAttributeForCharacteristic(charType: string): string {
    const mappings: Record<string, string> = {
      "On": "OnOff",
      "Brightness": "CurrentLevel",
      "Hue": "CurrentHue",
      "Saturation": "CurrentSaturation",
      "ColorTemperature": "ColorTemperatureMireds",
      "CurrentTemperature": "MeasuredValue",
      "CurrentRelativeHumidity": "MeasuredValue",
      "ContactSensorState": "StateValue",
      "MotionDetected": "Occupancy",
      "LockCurrentState": "LockState",
      "CurrentPosition": "CurrentPositionLiftPercent100ths",
      "CurrentHeatingCoolingState": "SystemMode",
      "RotationSpeed": "PercentCurrent",
    };
    
    return mappings[charType] || "Value";
  }

  /**
   * Get Matter server status
   */
  getStatus(): { enabled: boolean; running: boolean; accessoryCount: number; qrCode?: string; setupCode?: string } {
    const status = {
      enabled: this.isEnabled,
      running: this.isStarted,
      accessoryCount: this.publishedAccessories.size,
    };

    // Add commissioning info if server is running
    if (this.isStarted && this.isEnabled) {
      try {
        const setupCode = `MT:${this.matterConfig.discriminator!.toString().padStart(4, "0")}${this.matterConfig.passcode!}`;
        const qrCodeUrl = `https://dhrishi.github.io/connectedhomeip/qrcode.html?data=${setupCode}`;

        return {
          ...status,
          qrCode: qrCodeUrl,
          setupCode: setupCode,
        };
      } catch (error) {
        log.debug("Could not generate QR code for status:", error);
      }
    }

    return status;
  }

  /**
   * Get commissioning QR code for setup
   */
  getCommissioningQRCode(): string | null {
    if (!this.isEnabled || !this.isStarted) {
      return null;
    }

    try {
      // Generate placeholder QR code
      // In production, this would use real Matter.js QrCode.encode()
      const setupCode = `MT:${this.matterConfig.discriminator!.toString().padStart(4, "0")}${this.matterConfig.passcode!}`;
      return `https://dhrishi.github.io/connectedhomeip/qrcode.html?data=${setupCode}`;
    } catch (error) {
      log.error("Failed to generate commissioning QR code:", error);
      return null;
    }
  }

  /**
   * Get manual pairing code for setup
   */
  getManualPairingCode(): string | null {
    if (!this.isEnabled || !this.isStarted) {
      return null;
    }

    return this.formatPairingCode(this.matterConfig.passcode!);
  }

  /**
   * Get list of published accessories
   */
  getPublishedAccessories(): PlatformAccessory[] {
    return Array.from(this.publishedAccessories.values()).map(item => item.accessory);
  }

  /**
   * Check if an accessory is published via Matter
   */
  isAccessoryPublished(accessory: PlatformAccessory): boolean {
    return this.publishedAccessories.has(accessory.UUID);
  }

  /**
   * Get Matter configuration (read-only)
   */
  getConfiguration(): Readonly<MatterConfiguration> {
    return { ...this.matterConfig };
  }

  /**
   * Force restart the Matter server (for configuration changes)
   */
  async restart(): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    log.info("Restarting Matter server...");
    
    try {
      await this.stop();
      await this.initialize();
      await this.start();
      
      log.info("Matter server restarted successfully");
    } catch (error) {
      log.error("Failed to restart Matter server:", error);
      throw error;
    }
  }
}