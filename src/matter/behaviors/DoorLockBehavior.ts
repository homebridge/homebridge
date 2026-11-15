/**
 * DoorLock Cluster Behavior
 *
 * Handles door lock commands for smart locks.
 * Uses the DoorLockBehavior base, which implements no command, so that lock
 * and unlock can be done here without matter.js's own DoorLockServer logic
 * (see the class comment).
 */

import { DoorLockBehavior } from '@matter/main/behaviors/door-lock'
import { DoorLock } from '@matter/main/clusters/door-lock'

import { getRegistryManager } from './EndpointContext.js'
import { lockStateForWrite } from './stateLock.js'

/**
 * Custom DoorLock Server that calls plugin handlers.
 *
 * Extends DoorLockBehavior, not matter.js's DoorLockServer. DoorLockServer's
 * lockDoor and unlockDoor do much more than set the state (they check who is
 * asking, the operating mode and auto-relock, and raise the LockOperation
 * event), and they refuse a command that does not come from a paired
 * controller - which is how the Homebridge UI sends one. So lock and unlock
 * set `lockState` here themselves. No LockOperation event is raised.
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

    // Execute user handler. A controller always sends a request; the
    // Homebridge UI calls the command with none, so the handler is given an
    // empty one and can read request.pinCode either way.
    await registry.executeHandler(endpointId, 'doorLock', 'lockDoor', request ?? {})
    await lockStateForWrite(this)

    // Only reached if handler succeeded - update the Matter attribute.
    // DoorLockBehavior has no working super.lockDoor() to delegate to
    // (calling it throws), so set the lockState attribute directly.
    this.state.lockState = DoorLock.LockState.Locked

    // Sync lock state to cache
    registry.syncStateToCache(endpointId, 'doorLock', { lockState: DoorLock.LockState.Locked })
  }

  override async unlockDoor(request: DoorLock.UnlockDoorRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    // Execute user handler (with an empty request from the UI, see lockDoor)
    await registry.executeHandler(endpointId, 'doorLock', 'unlockDoor', request ?? {})
    await lockStateForWrite(this)

    // Only reached if handler succeeded - update the Matter attribute.
    // See lockDoor() above: the base has no working super.unlockDoor(),
    // so set the lockState attribute directly.
    this.state.lockState = DoorLock.LockState.Unlocked

    // Sync lock state to cache
    registry.syncStateToCache(endpointId, 'doorLock', { lockState: DoorLock.LockState.Unlocked })
  }
}
