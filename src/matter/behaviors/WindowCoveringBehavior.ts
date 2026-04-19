/**
 * WindowCovering Cluster Behavior
 *
 * Handles window covering commands for blinds, shades, and curtains
 */

import type { WindowCovering } from '@matter/main/clusters'

import { WindowCoveringServer } from '@matter/main/behaviors/window-covering'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'
import { getRegistryManager } from './EndpointContext.js'

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

  override async upOrOpen(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'windowCovering', 'upOrOpen')

      // Only reached if handler succeeded - update Matter state
      await super.upOrOpen()

      // Sync state to cache - window covering opening
      this.syncPositionStateToCache(
        endpointId,
        WindowCoveringStateProps.targetPositionLiftPercent100ths,
        WindowCoveringStateProps.currentPositionLiftPercent100ths,
      )
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to open window covering: ${message}`, Status.Failure)
    }
  }

  override async downOrClose(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'windowCovering', 'downOrClose')

      // Only reached if handler succeeded - update Matter state
      await super.downOrClose()

      // Sync state to cache - window covering closing
      this.syncPositionStateToCache(
        endpointId,
        WindowCoveringStateProps.targetPositionLiftPercent100ths,
        WindowCoveringStateProps.currentPositionLiftPercent100ths,
      )
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to close window covering: ${message}`, Status.Failure)
    }
  }

  override async stopMotion(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'windowCovering', 'stopMotion')

      // Only reached if handler succeeded - update Matter state
      await super.stopMotion()

      // Sync state to cache - window covering stopped
      this.syncPositionStateToCache(
        endpointId,
        WindowCoveringStateProps.targetPositionLiftPercent100ths,
        WindowCoveringStateProps.currentPositionLiftPercent100ths,
      )
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to stop window covering: ${message}`, Status.Failure)
    }
  }

  override async goToLiftPercentage(request: WindowCovering.GoToLiftPercentageRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(
        endpointId,
        'windowCovering',
        'goToLiftPercentage',
        request,
      )

      // Only reached if handler succeeded - update Matter state
      await super.goToLiftPercentage(request)

      // Sync state to cache - window covering moving to target position
      this.syncPositionStateToCache(
        endpointId,
        WindowCoveringStateProps.targetPositionLiftPercent100ths,
        WindowCoveringStateProps.currentPositionLiftPercent100ths,
      )
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to set window covering position: ${message}`, Status.Failure)
    }
  }

  override async goToTiltPercentage(request: WindowCovering.GoToTiltPercentageRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(
        endpointId,
        'windowCovering',
        'goToTiltPercentage',
        request,
      )

      // Only reached if handler succeeded - update Matter state
      await super.goToTiltPercentage(request)

      // Sync state to cache - window covering tilting to target angle
      this.syncPositionStateToCache(
        endpointId,
        WindowCoveringStateProps.targetPositionTiltPercent100ths,
        WindowCoveringStateProps.currentPositionTiltPercent100ths,
      )
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to set window covering tilt: ${message}`, Status.Failure)
    }
  }
}
