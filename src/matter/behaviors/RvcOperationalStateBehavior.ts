/**
 * RvcOperationalState Cluster Behavior
 *
 * Handles robotic vacuum cleaner operational state commands
 */

import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { RvcOperationalStateServer } from '@matter/main/behaviors/rvc-operational-state'
import { RvcOperationalState } from '@matter/main/clusters'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'

/**
 * Custom RvcOperationalState Server that calls plugin handlers
 */
export class HomebridgeRvcOperationalStateServer extends RvcOperationalStateServer {
  private static registry: BehaviorRegistry

  /**
   * Set the behavior registry (called once during server initialization)
   */
  static setRegistry(registry: BehaviorRegistry): void {
    this.registry = registry
  }

  override async pause(): Promise<RvcOperationalState.OperationalCommandResponse> {
    const endpointId = this.endpoint.id

    try {
      // Execute user handler
      await HomebridgeRvcOperationalStateServer.registry.executeHandler(endpointId, 'rvcOperationalState', 'pause')

      // Only reached if handler succeeded - call base implementation
      return await super.pause()
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to pause: ${message}`, Status.Failure)
    }
  }

  override async resume(): Promise<RvcOperationalState.OperationalCommandResponse> {
    const endpointId = this.endpoint.id

    try {
      // Execute user handler
      await HomebridgeRvcOperationalStateServer.registry.executeHandler(endpointId, 'rvcOperationalState', 'resume')

      // Only reached if handler succeeded - call base implementation
      return await super.resume()
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to resume: ${message}`, Status.Failure)
    }
  }

  override async goHome(): Promise<RvcOperationalState.OperationalCommandResponse> {
    const endpointId = this.endpoint.id

    try {
      // Execute user handler
      await HomebridgeRvcOperationalStateServer.registry.executeHandler(endpointId, 'rvcOperationalState', 'goHome')

      // Only reached if handler succeeded - return success response
      return {
        commandResponseState: {
          errorStateId: RvcOperationalState.ErrorState.NoError,
        },
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
      throw new StatusResponseError(`Failed to go home: ${message}`, Status.Failure)
    }
  }
}
