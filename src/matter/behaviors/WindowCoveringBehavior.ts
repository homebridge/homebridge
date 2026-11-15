/**
 * WindowCovering Cluster Behavior
 *
 * Handles window covering commands for blinds, shades, and curtains
 */

import type { WindowCovering } from '@matter/main/clusters'

import { WindowCoveringServer } from '@matter/main/behaviors/window-covering'

import { getRegistryManager } from './EndpointContext.js'
import { lockStateForWrite } from './stateLock.js'

/**
 * Feature-rich variant of the public WindowCoveringServer.
 *
 * We extend the public `WindowCoveringServer` (not the internal
 * `WindowCoveringBaseServer`) per apollon77's guidance on homebridge#3905 — the
 * Base class exists so matter.js's default-implementation methods have a concrete
 * feature set to compile against, and consumers shouldn't depend on it. Instead,
 * we declare the superset of features our overrides need via `.with(...)`. At
 * endpoint-attachment time, matter.js still narrows the effective feature set to
 * whatever the device type declares, so an endpoint that declares only Lift won't
 * advertise Tilt commands.
 */
const FeatureRichWindowCoveringServer = WindowCoveringServer.with(
  'Lift',
  'Tilt',
  'PositionAwareLift',
  'PositionAwareTilt',
)

/**
 * WindowCovering state property names
 * These correspond to the Matter.js WindowCovering cluster attribute names
 */
const WindowCoveringStateProps = {
  targetPositionLiftPercent100ths: 'targetPositionLiftPercent100ths' as const,
  currentPositionLiftPercent100ths: 'currentPositionLiftPercent100ths' as const,
  targetPositionTiltPercent100ths: 'targetPositionTiltPercent100ths' as const,
  currentPositionTiltPercent100ths: 'currentPositionTiltPercent100ths' as const,
} satisfies Record<string, keyof InstanceType<typeof FeatureRichWindowCoveringServer>['state']>

/**
 * Custom WindowCovering Server that calls plugin handlers.
 */
export class HomebridgeWindowCoveringServer extends FeatureRichWindowCoveringServer {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  /**
   * Sync window covering position state to cache
   * @param endpointId - The endpoint ID
   * @param targetProperty - Target position property name (e.g., 'targetPositionLiftPercent100ths')
   * @param currentProperty - Current position property name (e.g., 'currentPositionLiftPercent100ths')
   */
  private syncPositionStateToCache<
    TTarget extends keyof InstanceType<typeof FeatureRichWindowCoveringServer>['state'],
    TCurrent extends keyof InstanceType<typeof FeatureRichWindowCoveringServer>['state'],
  >(
    endpointId: string,
    targetProperty: TTarget,
    currentProperty: TCurrent,
  ): void {
    type State = InstanceType<typeof FeatureRichWindowCoveringServer>['state']
    const registry = this.getRegistry()
    const currentState = this.state
    const stateUpdate: Partial<Pick<State, TTarget | TCurrent>> = {}
    if (currentState[targetProperty] !== undefined) {
      stateUpdate[targetProperty] = currentState[targetProperty]
    }
    if (currentState[currentProperty] !== undefined) {
      stateUpdate[currentProperty] = currentState[currentProperty]
    }
    registry.syncStateToCache(endpointId, 'windowCovering', stateUpdate)
  }

  /**
   * Run the plugin's handler for an open or close command. A plugin that only
   * has the go-to-percentage handlers is told through those (0 is fully open,
   * 10000 fully closed), so the covering never moves in Matter without the
   * plugin hearing about it. With no handler at all, matter.js carries on alone.
   */
  private async runOpenOrClose(commandName: 'upOrOpen' | 'downOrClose', percent100ths: number): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()
    if (registry.getHandler(endpointId, 'windowCovering', commandName)) {
      await registry.executeHandler(endpointId, 'windowCovering', commandName)
      await lockStateForWrite(this)
      return
    }
    const lift = registry.getHandler(endpointId, 'windowCovering', 'goToLiftPercentage')
    const tilt = registry.getHandler(endpointId, 'windowCovering', 'goToTiltPercentage')
    if (lift) {
      await registry.executeHandler(endpointId, 'windowCovering', 'goToLiftPercentage', { liftPercent100thsValue: percent100ths })
      await lockStateForWrite(this)
    }
    if (tilt) {
      await registry.executeHandler(endpointId, 'windowCovering', 'goToTiltPercentage', { tiltPercent100thsValue: percent100ths })
      await lockStateForWrite(this)
    }
    if (!lift && !tilt) {
      await registry.executeHandler(endpointId, 'windowCovering', commandName)
      await lockStateForWrite(this)
    }
  }

  /**
   * A go-to-percentage command for a covering that can only open and close
   * (it does not know its position). Matter says 0 opens it and any other
   * value closes it. matter.js does the same, but it starts the open or close
   * command without waiting for it, so a plugin handler that failed there was
   * a rejection nobody caught. Here the command waits, and fails when the
   * handler does.
   */
  private openOrCloseFor(percent100ths: number | undefined): Promise<void> {
    return percent100ths === 0
      ? this.upOrOpen()
      : this.downOrClose()
  }

  override async upOrOpen(): Promise<void> {
    const endpointId = this.endpoint.id

    // Execute user handler
    await this.runOpenOrClose('upOrOpen', 0)

    // Only reached if handler succeeded - update Matter state
    await super.upOrOpen()

    // Sync state to cache - window covering opening
    this.syncPositionStateToCache(
      endpointId,
      WindowCoveringStateProps.targetPositionLiftPercent100ths,
      WindowCoveringStateProps.currentPositionLiftPercent100ths,
    )
  }

  override async downOrClose(): Promise<void> {
    const endpointId = this.endpoint.id

    // Execute user handler
    await this.runOpenOrClose('downOrClose', 10000)

    // Only reached if handler succeeded - update Matter state
    await super.downOrClose()

    // Sync state to cache - window covering closing
    this.syncPositionStateToCache(
      endpointId,
      WindowCoveringStateProps.targetPositionLiftPercent100ths,
      WindowCoveringStateProps.currentPositionLiftPercent100ths,
    )
  }

  override async stopMotion(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    // Execute user handler
    await registry.executeHandler(endpointId, 'windowCovering', 'stopMotion')
    await lockStateForWrite(this)

    // Only reached if handler succeeded - update Matter state
    await super.stopMotion()

    // Sync state to cache - window covering stopped
    this.syncPositionStateToCache(
      endpointId,
      WindowCoveringStateProps.targetPositionLiftPercent100ths,
      WindowCoveringStateProps.currentPositionLiftPercent100ths,
    )
  }

  override async goToLiftPercentage(request: WindowCovering.GoToLiftPercentageRequest): Promise<void> {
    if (!this.features.positionAwareLift) {
      return this.openOrCloseFor(request.liftPercent100thsValue)
    }

    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    // Execute user handler
    await registry.executeHandler(
      endpointId,
      'windowCovering',
      'goToLiftPercentage',
      request,
    )
    await lockStateForWrite(this)

    // Only reached if handler succeeded - update Matter state
    await super.goToLiftPercentage(request)

    // Sync state to cache - window covering moving to target position
    this.syncPositionStateToCache(
      endpointId,
      WindowCoveringStateProps.targetPositionLiftPercent100ths,
      WindowCoveringStateProps.currentPositionLiftPercent100ths,
    )
  }

  override async goToTiltPercentage(request: WindowCovering.GoToTiltPercentageRequest): Promise<void> {
    if (!this.features.positionAwareTilt) {
      return this.openOrCloseFor(request.tiltPercent100thsValue)
    }

    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    // Execute user handler
    await registry.executeHandler(
      endpointId,
      'windowCovering',
      'goToTiltPercentage',
      request,
    )
    await lockStateForWrite(this)

    // Only reached if handler succeeded - update Matter state
    await super.goToTiltPercentage(request)

    // Sync state to cache - window covering tilting to target angle
    this.syncPositionStateToCache(
      endpointId,
      WindowCoveringStateProps.targetPositionTiltPercent100ths,
      WindowCoveringStateProps.currentPositionTiltPercent100ths,
    )
  }
}
