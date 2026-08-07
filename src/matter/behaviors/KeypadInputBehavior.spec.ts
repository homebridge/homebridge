import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { KeypadInput } from '@matter/main/clusters/keypad-input'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setRegistryManager } from './EndpointContext.js'
import { DefaultKeypadInputServer, HomebridgeKeypadInputServer } from './KeypadInputBehavior.js'
import { RegistryManager } from './RegistryManager.js'

function makeBehavior<T>(prototype: object, endpoint?: unknown): T {
  const behavior = Object.create(prototype)
  if (endpoint) {
    Object.defineProperty(behavior, 'endpoint', { get: () => endpoint, configurable: true })
  }
  return behavior as T
}

describe('defaultKeypadInputServer', () => {
  it('should answer UnsupportedKey rather than throwing', async () => {
    // The matter.js base leaves sendKey unimplemented, so without this every
    // key press on a player with no handler would fail as a protocol error.
    const behavior = makeBehavior<DefaultKeypadInputServer>(DefaultKeypadInputServer.prototype)

    const response = await behavior.sendKey({ keyCode: KeypadInput.CecKeyCode.Select })

    expect(response.status).toBe(KeypadInput.Status.UnsupportedKey)
  })
})

describe('homebridgeKeypadInputServer', () => {
  let registry: BehaviorRegistry
  let behavior: HomebridgeKeypadInputServer
  const endpointId = 'test-endpoint-keypad'

  beforeEach(() => {
    registry = {
      executeHandler: vi.fn().mockResolvedValue(true),
      syncStateToCache: vi.fn(),
    } as any

    const endpoint = { id: endpointId }
    const registryManager = new RegistryManager()
    setRegistryManager(endpoint, registryManager)
    registryManager.registerEndpoint(endpointId, registry)

    behavior = makeBehavior(HomebridgeKeypadInputServer.prototype, endpoint)
  })

  it('should route the key press to the plugin handler', async () => {
    const request = { keyCode: KeypadInput.CecKeyCode.Up }

    const response = await behavior.sendKey(request)

    expect(registry.executeHandler).toHaveBeenCalledWith(endpointId, 'keypadInput', 'sendKey', request)
    expect(response.status).toBe(KeypadInput.Status.Success)
  })

  it('should report a failed handler through the response, not as an exception', async () => {
    vi.mocked(registry.executeHandler).mockRejectedValueOnce(new Error('remote unreachable'))

    const response = await behavior.sendKey({ keyCode: KeypadInput.CecKeyCode.Down })

    expect(response.status).toBe(KeypadInput.Status.UnsupportedKey)
  })
})
