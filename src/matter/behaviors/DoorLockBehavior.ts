/**
 * DoorLock Cluster Behavior
 *
 * Handles door lock commands for smart locks
 */

import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { DoorLockServer } from '@matter/main/behaviors/door-lock'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'

/**
 * Custom DoorLock Server that calls plugin handlers
 */
export class HomebridgeDoorLockServer extends DoorLockServer {
  private static registry: BehaviorRegistry

  /**
   * Set the behavior registry (called once during server initialization)
   */
  static setRegistry(registry: BehaviorRegistry): void {
    this.registry = registry
  }

  override async lockDoor(): Promise<void> {
    const endpointId = this.endpoint.id

    try {
      // Execute user handler
      await HomebridgeDoorLockServer.registry.executeHandler(endpointId, 'doorLock', 'lockDoor')

      // Only reached if handler succeeded - update Matter state
      await super.lockDoor()

      // Sync lock state to cache
      const currentState = this.state as any
      if (currentState.lockState !== undefined) {
        HomebridgeDoorLockServer.registry.syncStateToCache(endpointId, 'doorLock', { lockState: currentState.lockState })
      }
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to lock door: ${message}`, Status.Failure)
    }
  }

  override async unlockDoor(): Promise<void> {
    const endpointId = this.endpoint.id

    try {
      // Execute user handler
      await HomebridgeDoorLockServer.registry.executeHandler(endpointId, 'doorLock', 'unlockDoor')

      // Only reached if handler succeeded - update Matter state
      await super.unlockDoor()

      // Sync lock state to cache
      const currentState = this.state as any
      if (currentState.lockState !== undefined) {
        HomebridgeDoorLockServer.registry.syncStateToCache(endpointId, 'doorLock', { lockState: currentState.lockState })
      }
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to unlock door: ${message}`, Status.Failure)
    }
  }
}
