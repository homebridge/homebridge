/**
 * ClosureControl Cluster Behavior
 *
 * Handles move/stop commands for closures - garage doors, gates and similar.
 */

import { ClosureControlServer } from '@matter/main/behaviors/closure-control'
import { ClosureControl } from '@matter/main/clusters/closure-control'

import { getRegistryManager } from './EndpointContext.js'
import { lockStateForWrite } from './stateLock.js'

/**
 * Default ClosureControl Server.
 *
 * matter.js's base ClosureControlServer implements none of the commands -
 * invoking one throws NotImplementedError - so a closure without plugin
 * handlers would advertise moveTo/stop and then fail every one. This default
 * reflects the command in the cluster state instead, which is enough for the
 * endpoint to behave sanely on its own.
 *
 * The move is reported as complete immediately. A plugin that knows better
 * (a garage door takes ~15 seconds) should update `overallCurrentState` from
 * its own device reports; the point here is only that the target is recorded
 * and the closure never looks stuck.
 */
/**
 * Where the closure is once it has moved to a target. The two are different
 * lists in Matter (the current position also has "partially opened"), so the
 * numbers only match for fully closed and fully open.
 */
const CURRENT_POSITION_FOR_TARGET: Record<ClosureControl.TargetPosition, ClosureControl.CurrentPosition> = {
  [ClosureControl.TargetPosition.MoveToFullyClosed]: ClosureControl.CurrentPosition.FullyClosed,
  [ClosureControl.TargetPosition.MoveToFullyOpen]: ClosureControl.CurrentPosition.FullyOpened,
  [ClosureControl.TargetPosition.MoveToPedestrianPosition]: ClosureControl.CurrentPosition.OpenedForPedestrian,
  [ClosureControl.TargetPosition.MoveToVentilationPosition]: ClosureControl.CurrentPosition.OpenedForVentilation,
  [ClosureControl.TargetPosition.MoveToSignaturePosition]: ClosureControl.CurrentPosition.OpenedAtSignature,
}

/**
 * The target that keeps the closure at a position. "Partially opened" is not
 * something a closure can be sent to, so it has no target (null).
 */
const TARGET_FOR_CURRENT_POSITION: Record<ClosureControl.CurrentPosition, ClosureControl.TargetPosition | null> = {
  [ClosureControl.CurrentPosition.FullyClosed]: ClosureControl.TargetPosition.MoveToFullyClosed,
  [ClosureControl.CurrentPosition.FullyOpened]: ClosureControl.TargetPosition.MoveToFullyOpen,
  [ClosureControl.CurrentPosition.PartiallyOpened]: null,
  [ClosureControl.CurrentPosition.OpenedForPedestrian]: ClosureControl.TargetPosition.MoveToPedestrianPosition,
  [ClosureControl.CurrentPosition.OpenedForVentilation]: ClosureControl.TargetPosition.MoveToVentilationPosition,
  [ClosureControl.CurrentPosition.OpenedAtSignature]: ClosureControl.TargetPosition.MoveToSignaturePosition,
}

/**
 * Whether a closure is secure: fully closed, and latched when it has a latch.
 * Null (unknown) when the position or the latch is unknown.
 */
function secureStateOf(current: { position?: ClosureControl.CurrentPosition | null, latch?: boolean | null }): boolean | null {
  if (current.position === null || current.latch === null) {
    return null
  }
  if (current.position === undefined && current.latch === undefined) {
    return null
  }
  return (current.position === undefined || current.position === ClosureControl.CurrentPosition.FullyClosed)
    && (current.latch === undefined || current.latch)
}

export class DefaultClosureControlServer extends ClosureControlServer {
  override async moveTo(request: ClosureControl.MoveToRequest): Promise<void> {
    const moved = {
      ...(request.latch !== undefined
        ? { latch: request.latch }
        : {}),
      ...(request.speed !== undefined
        ? { speed: request.speed }
        : {}),
    }

    this.state.overallTargetState = {
      ...(this.state.overallTargetState ?? {}),
      ...(request.position !== undefined
        ? { position: request.position }
        : {}),
      ...moved,
    }

    // The fields the request did not mention stay as they were
    const current = {
      ...(this.state.overallCurrentState ?? {}),
      ...(request.position !== undefined
        ? { position: CURRENT_POSITION_FOR_TARGET[request.position] }
        : {}),
      ...moved,
    }
    this.state.overallCurrentState = {
      ...current,
      secureState: secureStateOf(current),
    }
    this.state.mainState = ClosureControl.MainState.Stopped
  }

  override async stop(): Promise<void> {
    // Stopping leaves the closure wherever it is, so the target becomes the
    // current position rather than the other way round.
    const current = this.state.overallCurrentState
    if (current) {
      this.state.overallTargetState = {
        ...(this.state.overallTargetState ?? {}),
        ...(current.position !== undefined
          ? {
              position: current.position === null
                ? null
                : TARGET_FOR_CURRENT_POSITION[current.position],
            }
          : {}),
        ...(current.latch !== undefined
          ? { latch: current.latch }
          : {}),
        ...(current.speed !== undefined
          ? { speed: current.speed }
          : {}),
      }
    }
    this.state.mainState = ClosureControl.MainState.Stopped
  }
}

/**
 * Custom ClosureControl Server that calls plugin handlers.
 *
 * Extends the default server so `super.*()` records the state (the matter.js
 * base would throw NotImplementedError).
 */
export class HomebridgeClosureControlServer extends DefaultClosureControlServer {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  /**
   * Handle 'moveTo' command
   */
  override async moveTo(request: ClosureControl.MoveToRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    // Execute user handler
    await registry.executeHandler(endpointId, 'closureControl', 'moveTo', request)
    await lockStateForWrite(this)

    // Only reached if handler succeeded - update Matter state via super
    await super.moveTo(request)

    // Sync state to cache
    registry.syncStateToCache(endpointId, 'closureControl', {
      overallTargetState: this.state.overallTargetState,
      overallCurrentState: this.state.overallCurrentState,
      mainState: this.state.mainState,
    })
  }

  /**
   * Handle 'stop' command
   */
  override async stop(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    // Execute user handler
    await registry.executeHandler(endpointId, 'closureControl', 'stop')
    await lockStateForWrite(this)

    // Only reached if handler succeeded - update Matter state via super
    await super.stop()

    // Sync state to cache
    registry.syncStateToCache(endpointId, 'closureControl', {
      overallTargetState: this.state.overallTargetState,
      mainState: this.state.mainState,
    })
  }
}
