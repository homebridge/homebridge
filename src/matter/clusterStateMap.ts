/**
 * Cluster State Map
 *
 * Maps Matter cluster names to their typed state interfaces.
 * Provides IDE autocomplete and type safety for plugin developers when
 * working with cluster attributes via api.matter?.updateAccessoryState()
 * and api.matter?.getAccessoryState().
 *
 * State interfaces are defined in clusterTypes.ts and derived from
 * @matter/main/clusters where possible.
 */

import type {
  ColorControlState,
  DeviceEnergyManagementState,
  DoorLockState,
  ElectricalEnergyMeasurementState,
  ElectricalPowerMeasurementState,
  EnergyEvseState,
  EnergyModeState,
  FanControlState,
  LevelControlState,
  MeterIdentificationState,
  OnOffState,
  PowerSourceState,
  RvcCleanModeState,
  RvcOperationalState,
  RvcRunModeState,
  ServiceAreaState,
  ThermostatState,
  ValveConfigurationAndControlState,
  WaterHeaterManagementState,
  WaterHeaterModeState,
  WindowCoveringState,
} from './clusterTypes.js'

/**
 * The shape every concentration measurement cluster shares.
 *
 * Homebridge turns on the cluster's features from the attributes declared at
 * registration: a reading or unit brings NumericMeasurement, and levelValue
 * brings LevelIndication. A numeric reading also needs measurementUnit.
 */
interface ConcentrationMeasurementState {
  measuredValue: number | null
  minMeasuredValue?: number | null
  maxMeasuredValue?: number | null
  peakMeasuredValue?: number | null
  peakMeasuredValueWindow?: number
  averageMeasuredValue?: number | null
  averageMeasuredValueWindow?: number
  uncertainty?: number
  /** 0 = ppm, 1 = ppb, 2 = ppt, 3 = mg/m³, 4 = µg/m³, 5 = ng/m³, 6 = particles/m³, 7 = Bq/m³ */
  measurementUnit?: number
  /** 0 = air (assumed when left out), 1 = water, 2 = soil */
  measurementMedium: number
  /** 0 = unknown, 1 = low, 2 = medium, 3 = high, 4 = critical */
  levelValue?: number
}

/**
 * Maps known cluster names to their typed state interfaces.
 *
 * Plugin developers get autocomplete for known clusters while unknown clusters
 * fall back to `Record<string, unknown>`.
 *
 * @example
 * ```typescript
 * // With typed overload on api.matter:
 * await api.matter?.updateAccessoryState(uuid, 'onOff', { onOff: true })
 * //                                                      ^-- autocomplete!
 *
 * const state = await api.matter?.getAccessoryState(uuid, 'levelControl')
 * // state is Partial<LevelControlState> | undefined
 * ```
 */
export interface ClusterStateMap {
  // Control clusters
  onOff: OnOffState
  levelControl: LevelControlState
  colorControl: ColorControlState
  doorLock: DoorLockState
  windowCovering: WindowCoveringState
  thermostat: ThermostatState
  fanControl: FanControlState

  // RVC clusters
  rvcOperationalState: RvcOperationalState
  rvcRunMode: RvcRunModeState
  rvcCleanMode: RvcCleanModeState
  serviceArea: ServiceAreaState

  // Power
  powerSource: PowerSourceState

  // Sensor clusters
  temperatureMeasurement: { measuredValue: number | null, minMeasuredValue?: number | null, maxMeasuredValue?: number | null }
  relativeHumidityMeasurement: { measuredValue: number | null, minMeasuredValue?: number | null, maxMeasuredValue?: number | null }
  illuminanceMeasurement: { measuredValue: number | null, minMeasuredValue?: number | null, maxMeasuredValue?: number | null }
  flowMeasurement: { measuredValue: number | null, minMeasuredValue?: number | null, maxMeasuredValue?: number | null, tolerance?: number }
  /** The scaled attributes turn on the Extended feature, for a resolution finer than 1 kPa */
  pressureMeasurement: { measuredValue: number | null, minMeasuredValue?: number | null, maxMeasuredValue?: number | null, tolerance?: number, scaledValue?: number | null, minScaledValue?: number | null, maxScaledValue?: number | null, scaledTolerance?: number, scale?: number }
  occupancySensing: { occupancy: { occupied: boolean }, occupancySensorType?: number, occupancySensorTypeBitmap?: { pir?: boolean, ultrasonic?: boolean, physicalContact?: boolean } }
  booleanState: { stateValue: boolean }

  // Valve clusters
  valveConfigurationAndControl: ValveConfigurationAndControlState

  // Water heater clusters
  waterHeaterMode: WaterHeaterModeState
  waterHeaterManagement: WaterHeaterManagementState

  // Air quality clusters
  airQuality: { airQuality: number }
  carbonDioxideConcentrationMeasurement: ConcentrationMeasurementState
  carbonMonoxideConcentrationMeasurement: ConcentrationMeasurementState
  formaldehydeConcentrationMeasurement: ConcentrationMeasurementState
  nitrogenDioxideConcentrationMeasurement: ConcentrationMeasurementState
  ozoneConcentrationMeasurement: ConcentrationMeasurementState
  pm1ConcentrationMeasurement: ConcentrationMeasurementState
  pm10ConcentrationMeasurement: ConcentrationMeasurementState
  pm25ConcentrationMeasurement: ConcentrationMeasurementState
  radonConcentrationMeasurement: ConcentrationMeasurementState
  totalVolatileOrganicCompoundsConcentrationMeasurement: ConcentrationMeasurementState

  // Switch (GenericSwitch - stateless remotes and buttons)
  switch: { currentPosition: number, numberOfPositions?: number }

  // Electrical measurement (iOS 27+ energy display)
  electricalPowerMeasurement: ElectricalPowerMeasurementState
  electricalEnergyMeasurement: ElectricalEnergyMeasurementState

  // Energy management, EV chargers and meters
  deviceEnergyManagement: DeviceEnergyManagementState
  deviceEnergyManagementMode: EnergyModeState
  energyEvse: EnergyEvseState
  energyEvseMode: EnergyModeState
  meterIdentification: MeterIdentificationState

  // Identification
  identify: { identifyTime: number, identifyType: number }
}
