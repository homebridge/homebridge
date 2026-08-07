/**
 * MediaPlayback Cluster Behavior
 *
 * Handles transport commands - play, pause, stop and track navigation - for
 * media players and speakers.
 */

import { MediaPlaybackServer } from '@matter/main/behaviors/media-playback'
import { MediaPlayback } from '@matter/main/clusters/media-playback'

import { MatterStatus } from '../errors.js'
import { getRegistryManager } from './EndpointContext.js'

/**
 * Default MediaPlayback Server.
 *
 * matter.js's base MediaPlaybackServer implements none of the commands -
 * invoking one throws NotImplementedError - so a player without plugin
 * handlers would advertise the transport controls and fail every one. This
 * default reflects the command in `currentState` and answers Success, which is
 * enough for the endpoint to behave sanely on its own.
 */
export class DefaultMediaPlaybackServer extends MediaPlaybackServer {
  /**
   * Record a new playback state, when the command implies one.
   */
  protected reflect(state?: MediaPlayback.PlaybackState): MediaPlayback.PlaybackResponse {
    if (state !== undefined) {
      this.state.currentState = state
    }
    return { status: MediaPlayback.Status.Success }
  }

  override async play(): Promise<MediaPlayback.PlaybackResponse> {
    return this.reflect(MediaPlayback.PlaybackState.Playing)
  }

  override async pause(): Promise<MediaPlayback.PlaybackResponse> {
    return this.reflect(MediaPlayback.PlaybackState.Paused)
  }

  override async stop(): Promise<MediaPlayback.PlaybackResponse> {
    return this.reflect(MediaPlayback.PlaybackState.NotPlaying)
  }

  // Track navigation does not change whether the player is playing, so these
  // only acknowledge the command.
  override async startOver(): Promise<MediaPlayback.PlaybackResponse> {
    return this.reflect()
  }

  override async previous(): Promise<MediaPlayback.PlaybackResponse> {
    return this.reflect()
  }

  override async next(): Promise<MediaPlayback.PlaybackResponse> {
    return this.reflect()
  }

  // The requests are ignored here - the default server has no position to
  // seek. The parameters must stay so HomebridgeMediaPlaybackServer can
  // forward them.
  // eslint-disable-next-line unused-imports/no-unused-vars
  override async skipForward(_request: MediaPlayback.SkipForwardRequest): Promise<MediaPlayback.PlaybackResponse> {
    return this.reflect()
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  override async skipBackward(_request: MediaPlayback.SkipBackwardRequest): Promise<MediaPlayback.PlaybackResponse> {
    return this.reflect()
  }
}

/**
 * The transport commands routed to plugin handlers, and the playback state
 * each one implies once the handler succeeds.
 *
 * Kept as data rather than one method per command: every command has the same
 * shape - run the handler, record the state, answer Success - so writing them
 * out longhand would be eight copies of the same error handling.
 */
const PLAYBACK_COMMANDS = {
  play: MediaPlayback.PlaybackState.Playing,
  pause: MediaPlayback.PlaybackState.Paused,
  stop: MediaPlayback.PlaybackState.NotPlaying,
  startOver: undefined,
  previous: undefined,
  next: undefined,
  skipForward: undefined,
  skipBackward: undefined,
} as const

/**
 * Custom MediaPlayback Server that calls plugin handlers.
 *
 * Extends the default server for its `reflect()` state handling (the matter.js
 * base implements nothing at all).
 */
export class HomebridgeMediaPlaybackServer extends DefaultMediaPlaybackServer {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  /**
   * Run a plugin handler and reflect the resulting playback state.
   *
   * A handler that throws a Matter protocol error is propagated as-is so the
   * controller gets the real status; anything else is answered with a
   * cluster-level status rather than an exception, which keeps the endpoint
   * online.
   */
  private async invoke(
    commandName: keyof typeof PLAYBACK_COMMANDS,
    request?: unknown,
  ): Promise<MediaPlayback.PlaybackResponse> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      await registry.executeHandler(endpointId, 'mediaPlayback', commandName, request)

      // Only reached if the handler succeeded - update Matter state
      const response = this.reflect(PLAYBACK_COMMANDS[commandName])

      registry.syncStateToCache(endpointId, 'mediaPlayback', { currentState: this.state.currentState })

      return response
    } catch (error) {
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // Unlike the on/off style clusters, MediaPlayback carries its own status
      // in the response, so a failure is reported through that rather than as
      // a protocol-level error.
      return { status: MediaPlayback.Status.InvalidStateForCommand }
    }
  }

  override async play(): Promise<MediaPlayback.PlaybackResponse> {
    return this.invoke('play')
  }

  override async pause(): Promise<MediaPlayback.PlaybackResponse> {
    return this.invoke('pause')
  }

  override async stop(): Promise<MediaPlayback.PlaybackResponse> {
    return this.invoke('stop')
  }

  override async startOver(): Promise<MediaPlayback.PlaybackResponse> {
    return this.invoke('startOver')
  }

  override async previous(): Promise<MediaPlayback.PlaybackResponse> {
    return this.invoke('previous')
  }

  override async next(): Promise<MediaPlayback.PlaybackResponse> {
    return this.invoke('next')
  }

  override async skipForward(request: MediaPlayback.SkipForwardRequest): Promise<MediaPlayback.PlaybackResponse> {
    return this.invoke('skipForward', request)
  }

  override async skipBackward(request: MediaPlayback.SkipBackwardRequest): Promise<MediaPlayback.PlaybackResponse> {
    return this.invoke('skipBackward', request)
  }
}
