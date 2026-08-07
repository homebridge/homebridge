/**
 * KeypadInput Cluster Behavior
 *
 * Handles remote-control key presses for media players.
 */

import { KeypadInputServer } from '@matter/main/behaviors/keypad-input'
import { KeypadInput } from '@matter/main/clusters/keypad-input'

import { MatterStatus } from '../errors.js'
import { getRegistryManager } from './EndpointContext.js'

/**
 * Default KeypadInput Server.
 *
 * matter.js's base KeypadInputServer leaves sendKey unimplemented (it throws
 * NotImplementedError), so a player without a plugin handler would advertise
 * the keypad and fail every press. Answering UnsupportedKey is the honest
 * response for a device that has nowhere to send the key.
 */
export class DefaultKeypadInputServer extends KeypadInputServer {
  // The key is ignored here - there is nowhere to send it. The parameter must
  // stay so HomebridgeKeypadInputServer can forward it.
  // eslint-disable-next-line unused-imports/no-unused-vars
  override async sendKey(_request: KeypadInput.SendKeyRequest): Promise<KeypadInput.SendKeyResponse> {
    return { status: KeypadInput.Status.UnsupportedKey }
  }
}

/**
 * Custom KeypadInput Server that calls plugin handlers.
 */
export class HomebridgeKeypadInputServer extends DefaultKeypadInputServer {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  /**
   * Handle 'sendKey' command
   */
  override async sendKey(request: KeypadInput.SendKeyRequest): Promise<KeypadInput.SendKeyResponse> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      await registry.executeHandler(endpointId, 'keypadInput', 'sendKey', request)
      return { status: KeypadInput.Status.Success }
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // KeypadInput carries its own status in the response, so a failed handler
      // is reported through that rather than as a protocol-level error - which
      // keeps the endpoint online.
      return { status: KeypadInput.Status.UnsupportedKey }
    }
  }
}
