/**
 * LevelControl Cluster Behavior
 *
 * Handles brightness/level control for dimmable lights
 */

import type { LevelControl } from '@matter/main/clusters/level-control'

import { LevelControlServer } from '@matter/main/behaviors/level-control'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'
import { getRegistryManager } from './EndpointContext.js'

export class HomebridgeLevelControlServer extends LevelControlServer {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  /**
   * Handle moveToLevel command
   */
  override async moveToLevel(request: LevelControl.MoveToLevelRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(
        endpointId,
        'levelControl',
        'moveToLevel',
        request,
      )

      // Only reached if handler succeeded - update Matter state
      await super.moveToLevel(request)

      // Sync state to cache
      registry.syncStateToCache(endpointId, 'levelControl', {
        currentLevel: request.level,
      })
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to set level: ${message}`, Status.Failure)
    }
  }

  /**
   * Handle move command
   */
  override async move(request: LevelControl.MoveRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(
        endpointId,
        'levelControl',
        'move',
        request,
      )

      // Only reached if handler succeeded
      await super.move(request)
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to move level: ${message}`, Status.Failure)
    }
  }

  /**
   * Handle step command
   */
  override async step(request: LevelControl.StepRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(
        endpointId,
        'levelControl',
        'step',
        request,
      )

      // Only reached if handler succeeded
      await super.step(request)
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to step level: ${message}`, Status.Failure)
    }
  }

  /**
   * Handle stop command
   */
  override async stop(request: LevelControl.StopRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(
        endpointId,
        'levelControl',
        'stop',
        request,
      )

      // Only reached if handler succeeded
      await super.stop(request)
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to stop level change: ${message}`, Status.Failure)
    }
  }

  /**
   * Handle moveToLevelWithOnOff command
   */
  override async moveToLevelWithOnOff(request: LevelControl.MoveToLevelRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(
        endpointId,
        'levelControl',
        'moveToLevelWithOnOff',
        request,
      )

      // Only reached if handler succeeded - update Matter state
      await super.moveToLevelWithOnOff(request)

      // Sync level state to cache
      registry.syncStateToCache(endpointId, 'levelControl', {
        currentLevel: request.level,
      })

      // Update OnOff cluster state through Matter.js to trigger subscription reports
      const targetOnOff = (request.level ?? 0) > 0

      // This is critical for the Home app to receive the state change
      // Using 'as any' because endpoint.set() type doesn't know about dynamically added clusters
      // The onOff cluster may be present on this endpoint at runtime but isn't in the compile-time type
      await (this.endpoint as any).set({
        onOff: {
          onOff: targetOnOff,
        },
      })
      registry.syncStateToCache(endpointId, 'onOff', {
        onOff: targetOnOff,
      })
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to set level with on/off: ${message}`, Status.Failure)
    }
  }
}
