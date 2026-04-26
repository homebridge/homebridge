/**
 * Air Quality Cluster Behavior
 *
 * Handles air quality sensor readings
 * This cluster is primarily read-only, exposing air quality measurements to Matter controllers
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
 *     airQuality: {
 *       airQuality: 1, // 0=Unknown, 1=Good, 2=Fair, 3=Moderate, 4=Poor, 5=VeryPoor, 6=ExtremelyPoor
 *     }
 *   }
 * }
 *
 * // Update air quality reading
 * await api.matter?.updateClusterState(accessory.UUID, 'airQuality', { airQuality: 2 })
 * ```
 */

import { AirQualityServer } from '@matter/main/behaviors/air-quality'

/**
 * Custom Air Quality Server
 *
 * The Air Quality cluster provides an interface for monitoring air quality levels.
 * It includes measurements for overall air quality and various pollutants.
 *
 * This is a read-only cluster - plugins update state via the Matter API,
 * and Matter controllers read these values. No commands are defined.
 */
export class HomebridgeAirQualityServer extends AirQualityServer {
  /**
   * Initialize the air quality server
   * Sets up any required state or listeners
   */
  override initialize(): void {
    super.initialize()

    // Air Quality cluster is read-only, no command handlers needed
    // State updates come from plugin via Matter API's updateClusterState()
  }
}
