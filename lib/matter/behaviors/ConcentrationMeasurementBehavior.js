"use strict";
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
 *   deviceType: api.matter.deviceTypes.AirQualitySensor,
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
 * await api.matter.updateClusterState(accessory.UUID, 'pm25ConcentrationMeasurement', { measuredValue: 15.3 })
 * await api.matter.updateClusterState(accessory.UUID, 'carbonMonoxideConcentrationMeasurement', { measuredValue: 2.5 })
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomebridgeCarbonMonoxideConcentrationMeasurementServer = exports.HomebridgeNitrogenDioxideConcentrationMeasurementServer = exports.HomebridgeOzoneConcentrationMeasurementServer = exports.HomebridgePm10ConcentrationMeasurementServer = exports.HomebridgePm25ConcentrationMeasurementServer = void 0;
const carbon_monoxide_concentration_measurement_1 = require("@matter/node/behaviors/carbon-monoxide-concentration-measurement");
const nitrogen_dioxide_concentration_measurement_1 = require("@matter/node/behaviors/nitrogen-dioxide-concentration-measurement");
const ozone_concentration_measurement_1 = require("@matter/node/behaviors/ozone-concentration-measurement");
const pm10_concentration_measurement_1 = require("@matter/node/behaviors/pm10-concentration-measurement");
const pm25_concentration_measurement_1 = require("@matter/node/behaviors/pm25-concentration-measurement");
/**
 * Custom PM2.5 Concentration Measurement Server
 *
 * Measures fine particulate matter (particles with diameter ≤ 2.5 micrometers)
 * This is a read-only cluster - plugins update state via the Matter API
 */
class HomebridgePm25ConcentrationMeasurementServer extends pm25_concentration_measurement_1.Pm25ConcentrationMeasurementServer {
    initialize() {
        super.initialize();
        // Read-only cluster, no command handlers needed
    }
}
exports.HomebridgePm25ConcentrationMeasurementServer = HomebridgePm25ConcentrationMeasurementServer;
/**
 * Custom PM10 Concentration Measurement Server
 *
 * Measures coarse particulate matter (particles with diameter ≤ 10 micrometers)
 * This is a read-only cluster - plugins update state via the Matter API
 */
class HomebridgePm10ConcentrationMeasurementServer extends pm10_concentration_measurement_1.Pm10ConcentrationMeasurementServer {
    initialize() {
        super.initialize();
        // Read-only cluster, no command handlers needed
    }
}
exports.HomebridgePm10ConcentrationMeasurementServer = HomebridgePm10ConcentrationMeasurementServer;
/**
 * Custom Ozone Concentration Measurement Server
 *
 * Measures ozone (O3) concentration
 * This is a read-only cluster - plugins update state via the Matter API
 */
class HomebridgeOzoneConcentrationMeasurementServer extends ozone_concentration_measurement_1.OzoneConcentrationMeasurementServer {
    initialize() {
        super.initialize();
        // Read-only cluster, no command handlers needed
    }
}
exports.HomebridgeOzoneConcentrationMeasurementServer = HomebridgeOzoneConcentrationMeasurementServer;
/**
 * Custom Nitrogen Dioxide Concentration Measurement Server
 *
 * Measures nitrogen dioxide (NO2) concentration
 * This is a read-only cluster - plugins update state via the Matter API
 */
class HomebridgeNitrogenDioxideConcentrationMeasurementServer extends nitrogen_dioxide_concentration_measurement_1.NitrogenDioxideConcentrationMeasurementServer {
    initialize() {
        super.initialize();
        // Read-only cluster, no command handlers needed
    }
}
exports.HomebridgeNitrogenDioxideConcentrationMeasurementServer = HomebridgeNitrogenDioxideConcentrationMeasurementServer;
/**
 * Custom Carbon Monoxide Concentration Measurement Server
 *
 * Measures carbon monoxide (CO) concentration
 * This is a read-only cluster - plugins update state via the Matter API
 */
class HomebridgeCarbonMonoxideConcentrationMeasurementServer extends carbon_monoxide_concentration_measurement_1.CarbonMonoxideConcentrationMeasurementServer {
    initialize() {
        super.initialize();
        // Read-only cluster, no command handlers needed
    }
}
exports.HomebridgeCarbonMonoxideConcentrationMeasurementServer = HomebridgeCarbonMonoxideConcentrationMeasurementServer;
//# sourceMappingURL=ConcentrationMeasurementBehavior.js.map