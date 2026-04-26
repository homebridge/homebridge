/**
 * Concentration Measurement Cluster Behavior
 *
 * Handles concentration measurement readings for various pollutants and gases.
 * This cluster is primarily read-only, exposing concentration measurements to Matter controllers.
 *
 * Supported measurement types:
 * - PM2.5: Fine particulate matter density
 * - PM10: Coarse particulate matter density
 * - Ozone (O3): Ozone concentration
 * - NO2: Nitrogen dioxide concentration
 * - CO: Carbon monoxide level
 *
 * Example usage:
 * ```typescript
 * const accessory: MatterAccessory = {
 *   uuid: 'air-quality-sensor-1',
 *   displayName: 'Living Room Air Quality',
 *   deviceType: api.matter!.deviceTypes.AirQualitySensor,
 *   serialNumber: 'AQ-12345',
 *   manufacturer: 'Acme',
 *   model: 'AQ-100',
 *   clusters: {
 *     pm25ConcentrationMeasurement: {
 *       measuredValue: 12.5,  // PM2.5 concentration in µg/m³
 *       minMeasuredValue: 0,
 *       maxMeasuredValue: 1000,
 *       measurementUnit: 0,   // 0 = µg/m³
 *     },
 *     pm10ConcentrationMeasurement: {
 *       measuredValue: 25.0,  // PM10 concentration in µg/m³
 *       minMeasuredValue: 0,
 *       maxMeasuredValue: 1000,
 *       measurementUnit: 0,
 *     },
 *     ozoneConcentrationMeasurement: {
 *       measuredValue: 0.05,  // Ozone concentration in ppm
 *       minMeasuredValue: 0,
 *       maxMeasuredValue: 1,
 *       measurementUnit: 1,   // 1 = ppm
 *     },
 *     nitrogenDioxideConcentrationMeasurement: {
 *       measuredValue: 0.02,  // NO2 concentration in ppm
 *       minMeasuredValue: 0,
 *       maxMeasuredValue: 1,
 *       measurementUnit: 1,
 *     },
 *     carbonMonoxideConcentrationMeasurement: {
 *       measuredValue: 3.0,   // CO concentration in ppm
 *       minMeasuredValue: 0,
 *       maxMeasuredValue: 100,
 *       measurementUnit: 1,
 *     }
 *   }
 * }
 *
 * // Update concentration readings
 * await api.matter?.updateClusterState(accessory.UUID, 'pm25ConcentrationMeasurement', { measuredValue: 15.3 })
 * await api.matter?.updateClusterState(accessory.UUID, 'carbonMonoxideConcentrationMeasurement', { measuredValue: 2.5 })
 * ```
 */

import { CarbonMonoxideConcentrationMeasurementServer } from '@matter/node/behaviors/carbon-monoxide-concentration-measurement'
import { NitrogenDioxideConcentrationMeasurementServer } from '@matter/node/behaviors/nitrogen-dioxide-concentration-measurement'
import { OzoneConcentrationMeasurementServer } from '@matter/node/behaviors/ozone-concentration-measurement'
import { Pm10ConcentrationMeasurementServer } from '@matter/node/behaviors/pm10-concentration-measurement'
import { Pm25ConcentrationMeasurementServer } from '@matter/node/behaviors/pm25-concentration-measurement'

/**
 * Custom PM2.5 Concentration Measurement Server
 *
 * Measures fine particulate matter (particles with diameter ≤ 2.5 micrometers)
 * This is a read-only cluster - plugins update state via the Matter API
 */
export class HomebridgePm25ConcentrationMeasurementServer extends Pm25ConcentrationMeasurementServer {
  override initialize(): void {
    super.initialize()
    // Read-only cluster, no command handlers needed
  }
}

/**
 * Custom PM10 Concentration Measurement Server
 *
 * Measures coarse particulate matter (particles with diameter ≤ 10 micrometers)
 * This is a read-only cluster - plugins update state via the Matter API
 */
export class HomebridgePm10ConcentrationMeasurementServer extends Pm10ConcentrationMeasurementServer {
  override initialize(): void {
    super.initialize()
    // Read-only cluster, no command handlers needed
  }
}

/**
 * Custom Ozone Concentration Measurement Server
 *
 * Measures ozone (O3) concentration
 * This is a read-only cluster - plugins update state via the Matter API
 */
export class HomebridgeOzoneConcentrationMeasurementServer extends OzoneConcentrationMeasurementServer {
  override initialize(): void {
    super.initialize()
    // Read-only cluster, no command handlers needed
  }
}

/**
 * Custom Nitrogen Dioxide Concentration Measurement Server
 *
 * Measures nitrogen dioxide (NO2) concentration
 * This is a read-only cluster - plugins update state via the Matter API
 */
export class HomebridgeNitrogenDioxideConcentrationMeasurementServer extends NitrogenDioxideConcentrationMeasurementServer {
  override initialize(): void {
    super.initialize()
    // Read-only cluster, no command handlers needed
  }
}

/**
 * Custom Carbon Monoxide Concentration Measurement Server
 *
 * Measures carbon monoxide (CO) concentration
 * This is a read-only cluster - plugins update state via the Matter API
 */
export class HomebridgeCarbonMonoxideConcentrationMeasurementServer extends CarbonMonoxideConcentrationMeasurementServer {
  override initialize(): void {
    super.initialize()
    // Read-only cluster, no command handlers needed
  }
}
