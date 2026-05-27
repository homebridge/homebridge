/**
 * DoorLock Cluster Behavior
 *
 * Handles door lock commands for smart locks.
 * Uses the featureless DoorLockBehavior base to avoid advertising credential
 * features (PIN, RFID, etc.) that cause issues with Apple Home.
 */

import { DoorLockBehavior } from '@matter/main/behaviors/door-lock'
import { DoorLock } from '@matter/main/clusters/door-lock'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'
import { getRegistryManager } from './EndpointContext.js'

/**
 * Custom DoorLock Server that calls plugin handlers.
 *
 * Extends DoorLockBehavior (no credential features) instead of DoorLockServer
 * (which includes PinCredential, RfidCredential, etc.). This prevents Apple Home
 * from seeing credential capabilities that aren't fully implemented.
 */
export class HomebridgeDoorLockServer extends DoorLockBehavior {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  override async lockDoor(request: DoorLock.LockDoorRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'doorLock', 'lockDoor', request)

      // Only reached if handler succeeded - update the Matter attribute.
      // We extend the featureless DoorLockBehavior (not DoorLockServer) to avoid
      // advertising credential features, which means there is no working
      // super.lockDoor() to delegate to — calling it throws. Set the lockState
      // attribute directly, mirroring DoorLockServer.lockDoor().
      this.state.lockState = DoorLock.LockState.Locked

      // Sync lock state to cache
      registry.syncStateToCache(endpointId, 'doorLock', { lockState: DoorLock.LockState.Locked })
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

  override async unlockDoor(request: DoorLock.UnlockDoorRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'doorLock', 'unlockDoor', request)

      // Only reached if handler succeeded - update the Matter attribute.
      // See lockDoor() above: the featureless base has no working super.unlockDoor(),
      // so set the lockState attribute directly, mirroring DoorLockServer.unlockDoor().
      this.state.lockState = DoorLock.LockState.Unlocked

      // Sync lock state to cache
      registry.syncStateToCache(endpointId, 'doorLock', { lockState: DoorLock.LockState.Unlocked })
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
