import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { MediaPlayback } from '@matter/main/clusters/media-playback'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setRegistryManager } from './EndpointContext.js'
import { DefaultMediaPlaybackServer, HomebridgeMediaPlaybackServer } from './MediaPlaybackBehavior.js'
import { RegistryManager } from './RegistryManager.js'

function makeBehavior<T>(prototype: object, state: { currentState?: number }, endpoint?: unknown): T {
  const behavior = Object.create(prototype)
  Object.defineProperty(behavior, 'state', { get: () => state, configurable: true })
  if (endpoint) {
    Object.defineProperty(behavior, 'endpoint', { get: () => endpoint, configurable: true })
  }
  return behavior as T
}

describe('defaultMediaPlaybackServer', () => {
  let state: { currentState?: number }
  let behavior: DefaultMediaPlaybackServer

  beforeEach(() => {
    state = { currentState: MediaPlayback.PlaybackState.NotPlaying }
    behavior = makeBehavior(DefaultMediaPlaybackServer.prototype, state)
  })

  it.each([
    ['play', MediaPlayback.PlaybackState.Playing],
    ['pause', MediaPlayback.PlaybackState.Paused],
    ['stop', MediaPlayback.PlaybackState.NotPlaying],
  ] as const)('should record the playback state implied by %s', async (command, expected) => {
    // The matter.js base server leaves every transport command unimplemented,
    // so without this a player would advertise the controls and fail them all.
    state.currentState = MediaPlayback.PlaybackState.Paused

    const response = await behavior[command]()

    expect(state.currentState).toBe(expected)
    expect(response.status).toBe(MediaPlayback.Status.Success)
  })

  it.each(['startOver', 'previous', 'next'] as const)('should leave the playback state alone for %s', async (command) => {
    // Track navigation does not say anything about whether the player is
    // playing, so it must not overwrite the state.
    state.currentState = MediaPlayback.PlaybackState.Playing

    const response = await behavior[command]()

    expect(state.currentState).toBe(MediaPlayback.PlaybackState.Playing)
    expect(response.status).toBe(MediaPlayback.Status.Success)
  })
})

describe('homebridgeMediaPlaybackServer', () => {
  let registry: BehaviorRegistry
  let behavior: HomebridgeMediaPlaybackServer
  let state: { currentState?: number }
  const endpointId = 'test-endpoint-player'

  beforeEach(() => {
    registry = {
      executeHandler: vi.fn().mockResolvedValue(true),
      syncStateToCache: vi.fn(),
    } as any

    state = { currentState: MediaPlayback.PlaybackState.NotPlaying }
    const endpoint = { id: endpointId }
    const registryManager = new RegistryManager()
    setRegistryManager(endpoint, registryManager)
    registryManager.registerEndpoint(endpointId, registry)

    behavior = makeBehavior(HomebridgeMediaPlaybackServer.prototype, state, endpoint)
  })

  it.each(['play', 'pause', 'stop', 'startOver', 'previous', 'next'] as const)(
    'should route %s to the plugin handler',
    async (command) => {
      await behavior[command]()

      expect(registry.executeHandler).toHaveBeenCalledWith(endpointId, 'mediaPlayback', command, undefined)
    },
  )

  it('should pass the request through for skipForward', async () => {
    const request = { deltaPositionMilliseconds: 30000 } as any

    await behavior.skipForward(request)

    expect(registry.executeHandler).toHaveBeenCalledWith(endpointId, 'mediaPlayback', 'skipForward', request)
  })

  it('should pass the request through for skipBackward', async () => {
    const request = { deltaPositionMilliseconds: 10000 } as any

    await behavior.skipBackward(request)

    expect(registry.executeHandler).toHaveBeenCalledWith(endpointId, 'mediaPlayback', 'skipBackward', request)
  })

  it('should record the state and sync it once the handler succeeds', async () => {
    const response = await behavior.play()

    expect(state.currentState).toBe(MediaPlayback.PlaybackState.Playing)
    expect(response.status).toBe(MediaPlayback.Status.Success)
    expect(registry.syncStateToCache).toHaveBeenCalledWith(endpointId, 'mediaPlayback', {
      currentState: MediaPlayback.PlaybackState.Playing,
    })
  })

  it('should report a failed handler through the response, not as an exception', async () => {
    // MediaPlayback carries its own status, so a failure belongs there - and
    // not throwing keeps the endpoint online.
    vi.mocked(registry.executeHandler).mockRejectedValueOnce(new Error('receiver is off'))

    const response = await behavior.play()

    expect(response.status).toBe(MediaPlayback.Status.InvalidStateForCommand)
    expect(state.currentState).toBe(MediaPlayback.PlaybackState.NotPlaying)
  })

  it('should not touch the state when no handler is registered', async () => {
    vi.mocked(registry.executeHandler).mockRejectedValueOnce(new Error('No handler registered'))

    await behavior.pause()

    expect(state.currentState).toBe(MediaPlayback.PlaybackState.NotPlaying)
    expect(registry.syncStateToCache).not.toHaveBeenCalled()
  })
})
