/**
 * Identify Cluster Behavior
 *
 * Handles identify commands (e.g., flash LED, beep sound)
 */

import type { Identify } from '@matter/main/clusters'

import { IdentifyServer } from '@matter/main/behaviors/identify'

import { Logger } from '../../logger.js'
import { registryOf } from './EndpointContext.js'
import { lockStateForWrite } from './stateLock.js'

const log = Logger.withPrefix('Matter/Identify')

/**
 * Custom Identify Server that calls plugin handlers
 */
export class HomebridgeIdentifyServer extends IdentifyServer {
  override initialize(): void {
    super.initialize()

    // matter.js raises this event for the TriggerEffect command (blink,
    // breathe and so on), which lights and plugs must offer. It is the hook
    // matter.js gives for it: overriding the command itself would make every
    // endpoint offer the command, also where it is optional.
    this.reactTo(this.events.effectTriggered, this.#tellPluginOfEffect, { offline: true })
  }

  /**
   * Pass an identify effect on to the plugin's `triggerEffect` handler. The
   * command has been answered by then, so a handler that fails is logged.
   */
  async #tellPluginOfEffect(effect: Identify.TriggerEffectRequest): Promise<void> {
    try {
      await registryOf(this.endpoint).executeHandler(this.endpoint.id, 'identify', 'triggerEffect', effect)
    } catch (error) {
      log.warn(`The triggerEffect handler of ${this.endpoint.id} failed:`, error)
    }
  }

  override async identify(request: Identify.IdentifyRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = registryOf(this.endpoint)

    // Execute user handler
    await registry.executeHandler(endpointId, 'identify', 'identify', request)
    await lockStateForWrite(this)

    // Only reached if handler succeeded - call base implementation
    return await super.identify(request)
  }
}
