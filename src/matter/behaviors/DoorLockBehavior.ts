/**
 * DoorLock Cluster Behavior
 *
 * Handles door lock commands for smart locks.
 * Uses the featureless DoorLockBehavior base to avoid advertising credential
 * features (PIN, RFID, etc.) that cause issues with Apple Home.
 */

import { DoorLockBehavior } from '@matter/main/behaviors/door-lock'
import { DoorLock } from '@matter/main/clusters/door-lock'

import { getRegistryManager } from './EndpointContext.js'
import { lockStateForWrite } from './stateLock.js'

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

    // Execute user handler
    await registry.executeHandler(endpointId, 'doorLock', 'lockDoor', request)
    await lockStateForWrite(this)

    // Only reached if handler succeeded - update the Matter attribute.
    // We extend the featureless DoorLockBehavior (not DoorLockServer) to avoid
    // advertising credential features, which means there is no working
    // super.lockDoor() to delegate to — calling it throws. Set the lockState
    // attribute directly, mirroring DoorLockServer.lockDoor().
    this.state.lockState = DoorLock.LockState.Locked

    // Sync lock state to cache
    registry.syncStateToCache(endpointId, 'doorLock', { lockState: DoorLock.LockState.Locked })
  }

  override async unlockDoor(request: DoorLock.UnlockDoorRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    // Execute user handler
    await registry.executeHandler(endpointId, 'doorLock', 'unlockDoor', request)
    await lockStateForWrite(this)

    // Only reached if handler succeeded - update the Matter attribute.
    // See lockDoor() above: the featureless base has no working super.unlockDoor(),
    // so set the lockState attribute directly, mirroring DoorLockServer.unlockDoor().
    this.state.lockState = DoorLock.LockState.Unlocked

    // Sync lock state to cache
    registry.syncStateToCache(endpointId, 'doorLock', { lockState: DoorLock.LockState.Unlocked })
  }
}
