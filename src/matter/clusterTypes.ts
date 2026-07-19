/**
 * Cluster State Types
 *
 * TypeScript interfaces for Matter cluster state objects.
 * These are used in behavior files to avoid repeated 'as any' casts.
 *
 * Types are derived from @matter/main/clusters where possible.
 */

import type { WindowCovering } from '@matter/main/clusters'

/**
 * Base interface for any cluster state
 */
export interface ClusterState {
  [key: string]: unknown
}

/**
 * OnOff cluster state
 */
export interface OnOffState {
  onOff?: boolean
}

/**
 * LevelControl cluster state
 */
export interface LevelControlState {
  currentLevel?: number
  minLevel?: number
  maxLevel?: number
  remainingTime?: number
  onLevel?: number | null
  options?: number
}

/**
 * ColorControl cluster state
 * Based on @matter/main/clusters ColorControl
 *
 * Note: We use a flexible interface to accommodate both ColorMode and EnhancedColorMode
 * from Matter.js, which are distinct types in the spec but functionally compatible
 */
export interface ColorControlState {
  // Color temperature
  colorTemperatureMireds?: number
  colorTempPhysicalMinMireds?: number
  colorTempPhysicalMaxMireds?: number

  // Hue & Saturation
  currentHue?: number
  currentSaturation?: number
  enhancedCurrentHue?: number

  // XY Color
  currentX?: number
  currentY?: number
  colorX?: number
  colorY?: number

  // Color mode - can be ColorMode or EnhancedColorMode from Matter spec
  colorMode?: number
  enhancedColorMode?: number

  // Options
  options?: number

  // Color temperature coupling (optional, requires ColorTemperature feature)
  coupleColorTempToLevelMinMireds?: number

  // Transition time (not part of state, but used in commands)
  transitionTime?: number
}

/**
 * Partial state interfaces for specific color control operations
 * These are used when we only need to read/write specific properties
 * from the complex Matter.js ColorControl state
 */

/**
 * Color temperature specific state
 */
export interface ColorTemperatureState {
  colorTemperatureMireds?: number
}

/**
 * Hue and saturation specific state
 */
export interface HueSaturationState {
  currentHue?: number
  currentSaturation?: number
}

/**
 * XY color specific state
 */
export interface XYColorState {
  currentX?: number
  currentY?: number
}

/**
 * Hue specific state (including enhanced hue)
 */
export interface HueState {
  currentHue?: number
  enhancedCurrentHue?: number
}

/**
 * Saturation specific state
 */
export interface SaturationState {
  currentSaturation?: number
}

/**
 * WindowCovering cluster state
 * Based on @matter/main/clusters WindowCovering
 */
export interface WindowCoveringState {
  // Type
  type?: WindowCovering.WindowCoveringType

  // Config/Status
  configStatus?: {
    operational?: boolean
    onlineReserved?: boolean
    online?: boolean
    liftMovementReversed?: boolean
    liftPositionAware?: boolean
    tiltPositionAware?: boolean
    liftEncoderControlled?: boolean
    tiltEncoderControlled?: boolean
  }

  // Lift positions (in percent100ths: 0-10000)
  targetPositionLiftPercent100ths?: number | null
  currentPositionLiftPercent100ths?: number | null

  // Tilt positions (in percent100ths: 0-10000)
  targetPositionTiltPercent100ths?: number | null
  currentPositionTiltPercent100ths?: number | null

  // Operational status (bitmap: global, lift, tilt movement status)
  operationalStatus?: {
    global: number
    lift: number
    tilt: number
  }

  // Safety
  safetyStatus?: number

  // End product type
  endProductType?: number

  // Mode
  mode?: number
}

/**
 * FanControl cluster state
 */
export interface FanControlState {
  fanMode?: number
  fanModeSequence?: number
  percentSetting?: number | null
  percentCurrent?: number
  speedMax?: number
  speedSetting?: number | null
  speedCurrent?: number
  rockSupport?: number
  rockSetting?: number
  windSupport?: number
  windSetting?: number
}

/**
 * Thermostat cluster state
 */
export interface ThermostatState {
  // Temperature measurements
  localTemperature?: number | null // read-only, autopopulated from externalMeasuredIndoorTemperature or TemperatureMeasurement cluster
  externalMeasuredIndoorTemperature?: number | null // writable state for external temperature sensor (in hundredths of degrees Celsius)
  outdoorTemperature?: number | null

  // Occupancy
  occupancy?: { occupied?: boolean } // occupancy state (requires Occupancy feature)
  externallyMeasuredOccupancy?: boolean // alternative way to set occupancy via external sensor

  // Setpoint limits
  absMinHeatSetpointLimit?: number
  absMaxHeatSetpointLimit?: number
  absMinCoolSetpointLimit?: number
  absMaxCoolSetpointLimit?: number

  // Setpoints (in hundredths of degrees Celsius)
  occupiedCoolingSetpoint?: number // cooling setpoint when occupied
  occupiedHeatingSetpoint?: number // heating setpoint when occupied
  unoccupiedCoolingSetpoint?: number // cooling setpoint when unoccupied (requires Occupancy feature)
  unoccupiedHeatingSetpoint?: number // heating setpoint when unoccupied (requires Occupancy feature)

  // User-configurable setpoint limits
  minHeatSetpointLimit?: number
  maxHeatSetpointLimit?: number
  minCoolSetpointLimit?: number
  maxCoolSetpointLimit?: number

  // Auto mode configuration
  minSetpointDeadBand?: number // minimum temperature difference between heat/cool setpoints (required for AutoMode, in tenths of degrees Celsius)

  // Other configuration
  remoteSensing?: number
  controlSequenceOfOperation?: number // 0-5: CoolingOnly, CoolingWithReheat, HeatingOnly, HeatingWithReheat, CoolingAndHeating, CoolingAndHeatingWithReheat
  systemMode?: number // 0=Off, 1=Auto, 3=Cool, 4=Heat, 5=EmergencyHeat, 6=Precooling, 7=FanOnly
  thermostatRunningMode?: number // current running state
  startOfWeek?: number
  numberOfWeeklyTransitions?: number
  numberOfDailyTransitions?: number
}

/**
 * DoorLock cluster state
 */
export interface DoorLockState {
  lockState?: number | null
  lockType?: number
  actuatorEnabled?: boolean
  operatingMode?: number
  doorState?: number | null
  doorOpenEvents?: number
  doorClosedEvents?: number
  openPeriod?: number
}

/**
 * RVC (Robotic Vacuum Cleaner) Operational State
 */
export interface RvcOperationalState {
  phaseList?: string[] | null
  currentPhase?: number | null
  countdownTime?: number | null
  operationalStateList?: Array<{
    operationalStateId: number
    operationalStateLabel?: string
  }>
  operationalState?: number
  operationalError?: {
    errorStateId: number
    errorStateLabel?: string
    errorStateDetails?: string
  }
}

/**
 * RVC Run Mode state
 */
export interface RvcRunModeState {
  supportedModes?: Array<{
    label: string
    mode: number
    modeTags?: Array<{ value: number }>
  }>
  currentMode?: number
  startUpMode?: number | null
  onMode?: number | null
}

/**
 * RVC Clean Mode state
 */
export interface RvcCleanModeState {
  supportedModes?: Array<{
    label: string
    mode: number
    modeTags?: Array<{ value: number }>
  }>
  currentMode?: number
  startUpMode?: number | null
  onMode?: number | null
}

/**
 * ValveConfigurationAndControl cluster state
 */
export interface ValveConfigurationAndControlState {
  openDuration?: number | null
  defaultOpenDuration?: number | null
  remainingDuration?: number | null
  currentState?: number | null
  targetState?: number | null
  valveFault?: number
}

/**
 * Service Area state
 */
export interface ServiceAreaState {
  supportedAreas?: Array<{
    areaId: number
    mapId: number | null
    areaInfo: {
      locationInfo?: {
        locationName?: string
        floorNumber?: number | null
        areaType?: number | null
      } | null
      landmarkInfo?: {
        landmarkTag?: number
        positionTag?: number | null
        relativePositionTag?: number | null
      } | null
    }
  }>
  supportedMaps?: Array<{
    mapId: number
    name: string
  }>
  selectedAreas?: number[]
  currentArea?: number | null
  estimatedEndTime?: number | null
  progress?: Array<{
    areaId: number
    status: number
    totalOperationalTime?: number | null
  }>
}

/**
 * Power Source state
 * @see {@link https://matter-standard.github.io/matter/specification/latest/#ref-power-source-cluster}
 *
 * `batPercentRemaining` is encoded as double the percentage (0–200), so 100% = 200.
 * `batChargeLevel`: 0 = Ok, 1 = Warning, 2 = Critical
 */
export interface PowerSourceState {
  status?: number
  order?: number
  description?: string
  batVoltage?: number | null
  batPercentRemaining?: number | null
  batTimeRemaining?: number | null
  batChargeLevel?: number
  batReplacementNeeded?: boolean
  batReplaceability?: number
  batPresent?: boolean
  activeBatFaults?: number[]
  batReplacementDescription?: string
  batQuantity?: number
  batChargeState?: number
  batTimeToFullCharge?: number | null
  batFunctionalWhileCharging?: boolean
  batChargingCurrent?: number | null
  activeBatChargeFaults?: number[]
}

/**
 * One accuracy range within a MeasurementAccuracyStruct.
 * At least one of the percent or fixed fields must be present.
 * Percent fields are in hundredths of a percent (e.g. 100 = 1%),
 * fixed fields are in the measurement's base unit (mV/mA/mW/mWh).
 */
export interface MeasurementAccuracyRangeStruct {
  rangeMin: number
  rangeMax: number
  percentMax?: number
  percentMin?: number
  percentTypical?: number
  fixedMax?: number
  fixedMin?: number
  fixedTypical?: number
}

/**
 * Accuracy declaration for one measurement type (MeasurementAccuracyStruct).
 * measurementType uses the Matter MeasurementType enum
 * (1 = Voltage, 2 = ActiveCurrent, 5 = ActivePower, 14 = ElectricalEnergy).
 */
export interface MeasurementAccuracyStruct {
  measurementType: number
  measured: boolean
  minMeasuredValue: number
  maxMeasuredValue: number
  accuracyRanges: MeasurementAccuracyRangeStruct[]
}

/**
 * An energy reading (EnergyMeasurementStruct). energy is in milliwatt-hours.
 * Timestamps are epoch seconds; systimes are milliseconds since boot.
 */
export interface EnergyMeasurementStruct {
  energy: number
  startTimestamp?: number
  endTimestamp?: number
  startSystime?: number
  endSystime?: number
}

/**
 * ElectricalPowerMeasurement cluster state.
 * Units are the raw Matter units: voltage in millivolts, current in
 * milliamps, power in milliwatts. All measurement values are nullable
 * (null = no measurement currently available).
 *
 * powerMode, numberOfMeasurementTypes and accuracy are mandatory in Matter
 * but are synthesized with sensible defaults at registration when omitted
 * (powerMode defaults to AC; accuracy is derived from the declared
 * measurement attributes).
 *
 * Update cadence: the reading attributes (voltage, activeCurrent,
 * activePower) are quieter-quality attributes - matter.js throttles their
 * reports to subscribers (roughly one per 10 seconds), so frequent updates
 * are tolerated but wasted. A cadence of a few seconds or slower is plenty.
 */
export interface ElectricalPowerMeasurementState {
  powerMode?: number
  numberOfMeasurementTypes?: number
  accuracy?: MeasurementAccuracyStruct[]
  voltage?: number | null
  activeCurrent?: number | null
  activePower?: number | null
}

/**
 * ElectricalEnergyMeasurement cluster state.
 * Cluster features (Imported/Exported x Cumulative/Periodic) are detected at
 * registration from which of these attributes the accessory declares.
 * accuracy is mandatory in Matter but synthesized with a sensible default
 * when omitted.
 *
 * Update cadence: energy readings are delivered to controllers through the
 * Matter CumulativeEnergyMeasured / PeriodicEnergyMeasured events, and these
 * are NOT throttled - every update is pushed to every subscribed controller
 * immediately. Update energy totals at a measured cadence (for example every
 * 30-60 seconds), not on every raw sample from the device.
 */
export interface ElectricalEnergyMeasurementState {
  accuracy?: MeasurementAccuracyStruct
  cumulativeEnergyImported?: EnergyMeasurementStruct | null
  cumulativeEnergyExported?: EnergyMeasurementStruct | null
  periodicEnergyImported?: EnergyMeasurementStruct | null
  periodicEnergyExported?: EnergyMeasurementStruct | null
}
