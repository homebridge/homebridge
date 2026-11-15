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

/** The position attributes a command can change. Which of them exist depends on the features. */
const POSITION_ATTRIBUTES = [
  'targetPositionLiftPercent100ths',
  'currentPositionLiftPercent100ths',
  'targetPositionTiltPercent100ths',
  'currentPositionTiltPercent100ths',
] as const

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
   * Sync the positions to the cache after a command: lift and tilt, as open,
   * close and stop move both on a covering that has both.
   */
  private syncPositionsToCache(): void {
    const stateUpdate: Record<string, number | null> = {}
    for (const attribute of POSITION_ATTRIBUTES) {
      const value = this.state[attribute]
      if (value !== undefined) {
        stateUpdate[attribute] = value
      }
    }
    this.getRegistry().syncStateToCache(this.endpoint.id, 'windowCovering', stateUpdate)
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
    // Execute user handler
    await this.runOpenOrClose('upOrOpen', 0)

    // Only reached if handler succeeded - update Matter state
    await super.upOrOpen()

    this.syncPositionsToCache()
  }

  override async downOrClose(): Promise<void> {
    // Execute user handler
    await this.runOpenOrClose('downOrClose', 10000)

    // Only reached if handler succeeded - update Matter state
    await super.downOrClose()

    this.syncPositionsToCache()
  }

  override async stopMotion(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    // Execute user handler
    await registry.executeHandler(endpointId, 'windowCovering', 'stopMotion')
    await lockStateForWrite(this)

    // Only reached if handler succeeded - update Matter state
    await super.stopMotion()

    this.syncPositionsToCache()
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

    this.syncPositionsToCache()
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

    this.syncPositionsToCache()
  }
}
