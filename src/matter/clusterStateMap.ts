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
  occupancySensing: { occupancy: { occupied: boolean }, occupancySensorType?: number, occupancySensorTypeBitmap?: { pir?: boolean, ultrasonic?: boolean, physicalContact?: boolean } }
  booleanState: { stateValue: boolean }

  // Valve clusters
  valveConfigurationAndControl: ValveConfigurationAndControlState

  // Water heater clusters
  waterHeaterMode: WaterHeaterModeState
  waterHeaterManagement: WaterHeaterManagementState

  // Air quality clusters
  airQuality: { airQuality: number }
  carbonMonoxideConcentrationMeasurement: { measuredValue: number | null, minMeasuredValue?: number | null, maxMeasuredValue?: number | null, measurementMedium: number, measurementUnit?: number }
  nitrogenDioxideConcentrationMeasurement: { measuredValue: number | null, minMeasuredValue?: number | null, maxMeasuredValue?: number | null, measurementMedium: number, measurementUnit?: number }
  ozoneConcentrationMeasurement: { measuredValue: number | null, minMeasuredValue?: number | null, maxMeasuredValue?: number | null, measurementMedium: number, measurementUnit?: number }
  pm10ConcentrationMeasurement: { measuredValue: number | null, minMeasuredValue?: number | null, maxMeasuredValue?: number | null, measurementMedium: number, measurementUnit?: number }
  pm25ConcentrationMeasurement: { measuredValue: number | null, minMeasuredValue?: number | null, maxMeasuredValue?: number | null, measurementMedium: number, measurementUnit?: number }

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
