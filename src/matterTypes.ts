// Import Matter.js clusters and device types
import * as clusters from '@matter/main/clusters'
import * as devices from '@matter/main/devices'

/**
 * Matter Device Types and Clusters for plugin developers
 *
 * This module provides access to standard Matter device types and clusters
 * that plugin developers can use to create Matter-compatible devices.
 */
import { Logger } from './logger.js'

const log = Logger.internal
const MatterClusters: Record<string, unknown> = {}
const MatterDeviceTypes: Record<string, unknown> = {}

try {
  // Import commonly used clusters from Matter.js

  // Export the most commonly used clusters for HomeKit-to-Matter conversion
  Object.assign(MatterClusters, {
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
  })

  log.debug('Matter clusters loaded successfully')
} catch (error) {
  log.warn('Failed to load Matter clusters:', error)
  Object.keys(MatterClusters).forEach(key => delete MatterClusters[key])
}
try {
  // Export the most commonly used device types for HomeKit-to-Matter conversion
  Object.assign(MatterDeviceTypes, {
    // Lighting devices
    OnOffLight: devices.OnOffLightDevice,
    DimmableLight: devices.DimmableLightDevice,
    ColorTemperatureLight: devices.ColorTemperatureLightDevice,
    ExtendedColorLight: devices.ExtendedColorLightDevice,

    // Switch devices
    OnOffLightSwitch: devices.OnOffLightSwitchDevice,
    DimmerSwitch: devices.DimmerSwitchDevice,

    // Outlet devices
    OnOffPlugInUnit: devices.OnOffPlugInUnitDevice,
    DimmablePlugInUnit: devices.DimmablePlugInUnitDevice,

    // Sensor devices
    TemperatureSensor: devices.TemperatureSensorDevice,
    HumiditySensor: devices.HumiditySensorDevice,
    LightSensor: devices.LightSensorDevice,
    OccupancySensor: devices.OccupancySensorDevice,
    ContactSensor: devices.ContactSensorDevice,
    PressureSensor: devices.PressureSensorDevice,
    FlowSensor: devices.FlowSensorDevice,
    OnOffSensor: devices.OnOffSensorDevice,

    // Security devices
    DoorLock: devices.DoorLockDevice,
    DoorLockController: devices.DoorLockControllerDevice,
    SmokeCoAlarm: devices.SmokeCoAlarmDevice,
    WaterLeakDetector: devices.WaterLeakDetectorDevice,
    WaterFreezeDetector: devices.WaterFreezeDetectorDevice,

    // HVAC devices
    Thermostat: devices.ThermostatDevice,
    Fan: devices.FanDevice,

    // Window covering devices
    WindowCovering: devices.WindowCoveringDevice,
    WindowCoveringController: devices.WindowCoveringControllerDevice,

    // Appliance devices
    // ModeSelect: devices.ModeSelect, // Removed because it does not exist

    // Water management
    // WaterValve: devices.WaterValve, // Removed because it does not exist
    // Pump: devices.Pump, // Removed because it does not exist
    // PumpController: devices.PumpController, // Removed because it does not exist

    // Other common devices
    // ControlBridge: devices.ControlBridge, // Removed because it does not exist
    // Speaker: devices.Speaker, // Removed because it does not exist
  })

  log.debug('Matter device types loaded successfully')
} catch (error) {
  log.warn('Failed to load Matter device types:', error)
  Object.keys(MatterDeviceTypes).forEach(key => delete MatterDeviceTypes[key])
}

/**
 * Maps common HomeKit service types to appropriate Matter clusters
 */
export const HAPToMatterClusterMapping: Record<string, string[]> = {
  // Lighting services
  Lightbulb: [
    'OnOffCluster',
    'LevelControlCluster',
    'ColorControlCluster',
  ],

  // Switch services
  Switch: [
    'OnOffCluster',
  ],

  // Outlet services
  Outlet: [
    'OnOffCluster',
  ],

  // Sensor services
  TemperatureSensor: [
    'TemperatureMeasurementCluster',
  ],
  HumiditySensor: [
    'RelativeHumidityMeasurementCluster',
  ],
  LightSensor: [
    'IlluminanceMeasurementCluster',
  ],
  MotionSensor: [
    'OccupancySensingCluster',
  ],
  OccupancySensor: [
    'OccupancySensingCluster',
  ],
  ContactSensor: [
    'BooleanStateCluster',
  ],
  LeakSensor: [
    'BooleanStateCluster',
  ],
  SmokeSensor: [
    'SmokeCoAlarmCluster',
  ],
  CarbonMonoxideSensor: [
    'SmokeCoAlarmCluster',
  ],

  // Security services
  LockManagement: [
    'DoorLockCluster',
  ],
  SecuritySystem: [
    'BooleanStateCluster',
  ],

  // HVAC services
  Thermostat: [
    'ThermostatCluster',
  ],
  Fan: [
    'FanControlCluster',
  ],
  Fanv2: [
    'FanControlCluster',
  ],
  HeaterCooler: [
    'ThermostatCluster',
  ],

  // Window covering services
  WindowCovering: [
    'WindowCoveringCluster',
  ],

  // Other services
  StatelessProgrammableSwitch: [
    'SwitchCluster',
  ],
  Valve: [
    'OnOffCluster',
  ],
  IrrigationSystem: [
    'OnOffCluster',
  ],
}

/**
 * Maps common HomeKit service types to appropriate Matter device types
 */
export const HAPToMatterDeviceMapping: Record<string, string> = {
  // Lighting services
  Lightbulb: 'OnOffLight', // Default to basic light, can be upgraded based on characteristics

  // Switch services
  Switch: 'OnOffLightSwitch',

  // Outlet services
  Outlet: 'OnOffPlugInUnit',

  // Sensor services
  TemperatureSensor: 'TemperatureSensor',
  HumiditySensor: 'HumiditySensor',
  LightSensor: 'LightSensor',
  MotionSensor: 'OccupancySensor',
  OccupancySensor: 'OccupancySensor',
  ContactSensor: 'ContactSensor',
  LeakSensor: 'WaterLeakDetector',
  SmokeSensor: 'SmokeCoAlarm',
  CarbonMonoxideSensor: 'SmokeCoAlarm',

  // Security services
  LockManagement: 'DoorLock',

  // HVAC services
  Thermostat: 'Thermostat',
  Fan: 'Fan',
  Fanv2: 'Fan',

  // Window covering services
  WindowCovering: 'WindowCovering',

  // Other services
  StatelessProgrammableSwitch: 'GenericSwitch',
  Valve: 'WaterValve',
}

/**
 * Helper function to get Matter device type for a HomeKit service
 */
export function getMatterDeviceTypeForHAPService(serviceType: string, characteristics?: string[]): string | null {
  const baseDeviceType = HAPToMatterDeviceMapping[serviceType]

  if (!baseDeviceType) {
    return null
  }

  // Upgrade device type based on available characteristics for lighting
  if (serviceType === 'Lightbulb' && characteristics) {
    if (characteristics.includes('Hue') && characteristics.includes('Saturation')) {
      return 'ExtendedColorLight'
    } else if (characteristics.includes('ColorTemperature')) {
      return 'ColorTemperatureLight'
    } else if (characteristics.includes('Brightness')) {
      return 'DimmableLight'
    }
  }

  // Upgrade outlet type based on dimming capability
  if (serviceType === 'Outlet' && characteristics?.includes('Brightness')) {
    return 'DimmablePlugInUnit'
  }

  return baseDeviceType
}

/**
 * Helper function to get Matter clusters for a HomeKit service
 */
export function getMatterClustersForHAPService(serviceType: string, characteristics?: string[]): string[] {
  const baseClusters = HAPToMatterClusterMapping[serviceType] || []

  // Add conditional clusters based on characteristics
  const result = [...baseClusters]

  if (characteristics) {
    if (serviceType === 'Lightbulb') {
      // Only add level control if brightness is supported
      if (characteristics.includes('Brightness') && !result.includes('LevelControlCluster')) {
        result.push('LevelControlCluster')
      }

      // Only add color control if color characteristics are supported
      if ((characteristics.includes('Hue') || characteristics.includes('ColorTemperature'))
        && !result.includes('ColorControlCluster')) {
        result.push('ColorControlCluster')
      }
    }
  }

  // Always add basic required clusters
  if (!result.includes('IdentifyCluster')) {
    result.push('IdentifyCluster')
  }

  return result
}

export { MatterClusters, MatterDeviceTypes }
