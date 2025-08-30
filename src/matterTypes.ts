import { Logger } from "./logger";

const log = Logger.internal;

/**
 * Matter Device Types and Clusters for plugin developers
 * 
 * This module provides access to standard Matter device types and clusters
 * that plugin developers can use to create Matter-compatible devices.
 */

// Import Matter.js clusters and device types
let MatterClusters: Record<string, unknown> = {};
let MatterDeviceTypes: Record<string, unknown> = {};

try {
  // Import commonly used clusters from Matter.js
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const clusters = require("@matter/main/clusters");
  
  // Export the most commonly used clusters for HomeKit-to-Matter conversion
  MatterClusters = {
    // Basic clusters
    OnOffCluster: clusters.OnOffCluster,
    LevelControlCluster: clusters.LevelControlCluster,
    ColorControlCluster: clusters.ColorControlCluster,
    IdentifyCluster: clusters.IdentifyCluster,
    
    // Sensor clusters
    TemperatureMeasurementCluster: clusters.TemperatureMeasurementCluster,
    RelativeHumidityMeasurementCluster: clusters.RelativeHumidityMeasurementCluster,
    IlluminanceMeasurementCluster: clusters.IlluminanceMeasurementCluster,
    OccupancySensingCluster: clusters.OccupancySensingCluster,
    PressureMeasurementCluster: clusters.PressureMeasurementCluster,
    FlowMeasurementCluster: clusters.FlowMeasurementCluster,
    
    // Security clusters
    DoorLockCluster: clusters.DoorLockCluster,
    SmokeCoAlarmCluster: clusters.SmokeCoAlarmCluster,
    BooleanStateCluster: clusters.BooleanStateCluster,
    
    // HVAC clusters  
    ThermostatCluster: clusters.ThermostatCluster,
    FanControlCluster: clusters.FanControlCluster,
    
    // Window covering clusters
    WindowCoveringCluster: clusters.WindowCoveringCluster,
    
    // Switch clusters
    SwitchCluster: clusters.SwitchCluster,
    
    // General clusters
    BasicInformationCluster: clusters.BasicInformationCluster,
    BridgedDeviceBasicInformationCluster: clusters.BridgedDeviceBasicInformationCluster,
    DescriptorCluster: clusters.DescriptorCluster,
    PowerSourceCluster: clusters.PowerSourceCluster,
    GeneralDiagnosticsCluster: clusters.GeneralDiagnosticsCluster,
    
    // Media clusters
    MediaInputCluster: clusters.MediaInputCluster,
    MediaPlaybackCluster: clusters.MediaPlaybackCluster,
    AudioOutputCluster: clusters.AudioOutputCluster,
    
    // Appliance clusters
    ModeSelectCluster: clusters.ModeSelectCluster,
    OperationalStateCluster: clusters.OperationalStateCluster,
  };
  
  log.debug("Matter clusters loaded successfully");
} catch (error) {
  log.warn("Failed to load Matter clusters:", error);
  MatterClusters = {};
}

try {
  // Import commonly used device types from Matter.js
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const devices = require("@matter/main/devices");
  
  // Export the most commonly used device types for HomeKit-to-Matter conversion
  MatterDeviceTypes = {
    // Lighting devices
    OnOffLight: devices.OnOffLight,
    DimmableLight: devices.DimmableLight,
    ColorTemperatureLight: devices.ColorTemperatureLight,
    ExtendedColorLight: devices.ExtendedColorLight,
    
    // Switch devices
    OnOffLightSwitch: devices.OnOffLightSwitch,
    DimmerSwitch: devices.DimmerSwitch,
    ColorDimmerSwitch: devices.ColorDimmerSwitch,
    GenericSwitch: devices.GenericSwitch,
    
    // Outlet devices
    OnOffPlugInUnit: devices.OnOffPlugInUnit,
    DimmablePlugInUnit: devices.DimmablePlugInUnit,
    
    // Sensor devices  
    TemperatureSensor: devices.TemperatureSensor,
    HumiditySensor: devices.HumiditySensor,
    LightSensor: devices.LightSensor,
    OccupancySensor: devices.OccupancySensor,
    ContactSensor: devices.ContactSensor,
    PressureSensor: devices.PressureSensor,
    FlowSensor: devices.FlowSensor,
    OnOffSensor: devices.OnOffSensor,
    
    // Security devices
    DoorLock: devices.DoorLock,
    DoorLockController: devices.DoorLockController,
    SmokeCoAlarm: devices.SmokeCoAlarm,
    WaterLeakDetector: devices.WaterLeakDetector,
    WaterFreezeDetector: devices.WaterFreezeDetector,
    
    // HVAC devices
    Thermostat: devices.Thermostat,
    Fan: devices.Fan,
    
    // Window covering devices  
    WindowCovering: devices.WindowCovering,
    WindowCoveringController: devices.WindowCoveringController,
    
    // Appliance devices
    ModeSelect: devices.ModeSelect,
    
    // Water management
    WaterValve: devices.WaterValve,
    Pump: devices.Pump,
    PumpController: devices.PumpController,
    
    // Other common devices
    ControlBridge: devices.ControlBridge,
    Speaker: devices.Speaker,
  };
  
  log.debug("Matter device types loaded successfully");
} catch (error) {
  log.warn("Failed to load Matter device types:", error);
  MatterDeviceTypes = {};
}

/**
 * Maps common HomeKit service types to appropriate Matter clusters
 */
export const HAPToMatterClusterMapping: Record<string, string[]> = {
  // Lighting services
  "Lightbulb": [
    "OnOffCluster",
    "LevelControlCluster", 
    "ColorControlCluster",
  ],
  
  // Switch services
  "Switch": [
    "OnOffCluster",
  ],
  
  // Outlet services  
  "Outlet": [
    "OnOffCluster",
  ],
  
  // Sensor services
  "TemperatureSensor": [
    "TemperatureMeasurementCluster",
  ],
  "HumiditySensor": [
    "RelativeHumidityMeasurementCluster",
  ],
  "LightSensor": [
    "IlluminanceMeasurementCluster",
  ],
  "MotionSensor": [
    "OccupancySensingCluster",
  ],
  "OccupancySensor": [
    "OccupancySensingCluster",
  ],
  "ContactSensor": [
    "BooleanStateCluster",
  ],
  "LeakSensor": [
    "BooleanStateCluster",
  ],
  "SmokeSensor": [
    "SmokeCoAlarmCluster",
  ],
  "CarbonMonoxideSensor": [
    "SmokeCoAlarmCluster",
  ],
  
  // Security services
  "LockManagement": [
    "DoorLockCluster",
  ],
  "SecuritySystem": [
    "BooleanStateCluster",
  ],
  
  // HVAC services
  "Thermostat": [
    "ThermostatCluster",
  ],
  "Fan": [
    "FanControlCluster",
  ],
  "Fanv2": [
    "FanControlCluster",
  ],
  "HeaterCooler": [
    "ThermostatCluster",
  ],
  
  // Window covering services
  "WindowCovering": [
    "WindowCoveringCluster",
  ],
  
  // Other services
  "StatelessProgrammableSwitch": [
    "SwitchCluster",
  ],
  "Valve": [
    "OnOffCluster",
  ],
  "IrrigationSystem": [
    "OnOffCluster",
  ],
};

/**
 * Maps common HomeKit service types to appropriate Matter device types
 */
export const HAPToMatterDeviceMapping: Record<string, string> = {
  // Lighting services
  "Lightbulb": "OnOffLight", // Default to basic light, can be upgraded based on characteristics
  
  // Switch services  
  "Switch": "OnOffLightSwitch",
  
  // Outlet services
  "Outlet": "OnOffPlugInUnit",
  
  // Sensor services
  "TemperatureSensor": "TemperatureSensor",
  "HumiditySensor": "HumiditySensor", 
  "LightSensor": "LightSensor",
  "MotionSensor": "OccupancySensor",
  "OccupancySensor": "OccupancySensor",
  "ContactSensor": "ContactSensor",
  "LeakSensor": "WaterLeakDetector",
  "SmokeSensor": "SmokeCoAlarm",
  "CarbonMonoxideSensor": "SmokeCoAlarm",
  
  // Security services
  "LockManagement": "DoorLock",
  
  // HVAC services
  "Thermostat": "Thermostat",
  "Fan": "Fan",
  "Fanv2": "Fan",
  
  // Window covering services
  "WindowCovering": "WindowCovering",
  
  // Other services
  "StatelessProgrammableSwitch": "GenericSwitch",
  "Valve": "WaterValve",
};

/**
 * Helper function to get Matter device type for a HomeKit service
 */
export function getMatterDeviceTypeForHAPService(serviceType: string, characteristics?: string[]): string | null {
  const baseDeviceType = HAPToMatterDeviceMapping[serviceType];
  
  if (!baseDeviceType) {
    return null;
  }
  
  // Upgrade device type based on available characteristics for lighting
  if (serviceType === "Lightbulb" && characteristics) {
    if (characteristics.includes("Hue") && characteristics.includes("Saturation")) {
      return "ExtendedColorLight";
    } else if (characteristics.includes("ColorTemperature")) {
      return "ColorTemperatureLight";
    } else if (characteristics.includes("Brightness")) {
      return "DimmableLight";
    }
  }
  
  // Upgrade outlet type based on dimming capability
  if (serviceType === "Outlet" && characteristics?.includes("Brightness")) {
    return "DimmablePlugInUnit";
  }
  
  return baseDeviceType;
}

/**
 * Helper function to get Matter clusters for a HomeKit service
 */
export function getMatterClustersForHAPService(serviceType: string, characteristics?: string[]): string[] {
  const baseClusters = HAPToMatterClusterMapping[serviceType] || [];
  
  // Add conditional clusters based on characteristics
  const result = [...baseClusters];
  
  if (characteristics) {
    if (serviceType === "Lightbulb") {
      // Only add level control if brightness is supported
      if (characteristics.includes("Brightness") && !result.includes("LevelControlCluster")) {
        result.push("LevelControlCluster");
      }
      
      // Only add color control if color characteristics are supported  
      if ((characteristics.includes("Hue") || characteristics.includes("ColorTemperature")) && 
          !result.includes("ColorControlCluster")) {
        result.push("ColorControlCluster");
      }
    }
  }
  
  // Always add basic required clusters
  if (!result.includes("IdentifyCluster")) {
    result.push("IdentifyCluster");
  }
  
  return result;
}

export { MatterClusters, MatterDeviceTypes };