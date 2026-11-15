/**
 * ValveConfigurationAndControl Cluster Behavior
 *
 * Handles open/close commands for water valves and irrigation controllers.
 */

import { ValveConfigurationAndControlServer } from '@matter/main/behaviors/valve-configuration-and-control'
import { ValveConfigurationAndControl } from '@matter/main/clusters/valve-configuration-and-control'

import { registryOf } from './EndpointContext.js'
import { lockStateForWrite } from './stateLock.js'

/**
 * Default ValveConfigurationAndControl Server.
 *
 * matter.js's base ValveConfigurationAndControlServer does NOT implement the
 * open/close commands — invoking them throws NotImplementedError. This default
 * implementation reflects the command in the cluster state, so valves without
 * plugin handlers still respond to open/close from controllers and the UI.
 */
export class DefaultValveConfigurationAndControlServer extends ValveConfigurationAndControlServer {
  // The request (openDuration/targetLevel) is intentionally ignored here — the
  // default implementation only reflects the open/close state. The parameter
  // must stay so HomebridgeValveConfigurationAndControlServer can forward it.
  // eslint-disable-next-line unused-imports/no-unused-vars
  override async open(_request: ValveConfigurationAndControl.OpenRequest): Promise<void> {
    this.state.currentState = ValveConfigurationAndControl.ValveState.Open
    this.state.targetState = ValveConfigurationAndControl.ValveState.Open
  }

  override async close(): Promise<void> {
    this.state.currentState = ValveConfigurationAndControl.ValveState.Closed
    this.state.targetState = ValveConfigurationAndControl.ValveState.Closed
  }
}

/**
 * Custom ValveConfigurationAndControl Server that calls plugin handlers.
 * Extends the default server so the super.open()/super.close() calls update
 * the cluster state (the matter.js base would throw NotImplementedError).
 */
export class HomebridgeValveConfigurationAndControlServer extends DefaultValveConfigurationAndControlServer {
  /**
   * Handle 'open' command
   */
  override async open(request: ValveConfigurationAndControl.OpenRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = registryOf(this.endpoint)

    // Execute user handler. A controller always sends a request; the
    // Homebridge UI calls the command with none, so the handler is given an
    // empty one and can read request.openDuration either way.
    await registry.executeHandler(endpointId, 'valveConfigurationAndControl', 'open', request ?? {})
    await lockStateForWrite(this)

    // Only reached if handler succeeded - update Matter state via super
    await super.open(request)

    // Sync state to cache
    registry.syncStateToCache(endpointId, 'valveConfigurationAndControl', {
      currentState: ValveConfigurationAndControl.ValveState.Open,
      targetState: ValveConfigurationAndControl.ValveState.Open,
    })
  }

  /**
   * Handle 'close' command
   */
  override async close(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = registryOf(this.endpoint)

    // Execute user handler
    await registry.executeHandler(endpointId, 'valveConfigurationAndControl', 'close')
    await lockStateForWrite(this)

    // Only reached if handler succeeded - update Matter state via super
    await super.close()

    // Sync state to cache
    registry.syncStateToCache(endpointId, 'valveConfigurationAndControl', {
      currentState: ValveConfigurationAndControl.ValveState.Closed,
      targetState: ValveConfigurationAndControl.ValveState.Closed,
    })
  }
}
