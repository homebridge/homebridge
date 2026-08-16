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

      // Only reached if handler succeeded - update Matter state.
      //
      // This also turns the OnOff cluster on or off where the device type
      // couples them: matter.js does that itself, from inside this command's
      // transaction, and its rule is `off` only when the target is minLevel
      // (deferred to commit) rather than anything at or below zero.
      //
      // ⚠️ Do NOT write the OnOff cluster here as well. `endpoint.set()` opens
      // a SECOND transaction, and the one running this command already holds
      // the lock on `onOff.state` - matter.js then throws
      // "Cannot lock <endpoint>.onOff.state synchronously" and the whole
      // command fails, after the plugin's handler has already run (#3993).
      // HomebridgeOnOffServer reports the coupled change to the cache instead.
      await super.moveToLevelWithOnOff(request)

      // Sync level state to cache
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
      throw new StatusResponseError(`Failed to set level with on/off: ${message}`, Status.Failure)
    }
  }
}
