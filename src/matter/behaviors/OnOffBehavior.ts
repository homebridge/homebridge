/**
 * OnOff Cluster Behavior
 *
 * Handles on/off commands for lights, switches, and outlets
 */

import { OnOffServer } from '@matter/main/behaviors/on-off'

import { registryOf } from './EndpointContext.js'
import { lockStateForWrite } from './stateLock.js'

export class HomebridgeOnOffServer extends OnOffServer {
  override async initialize(): Promise<void> {
    await super.initialize()

    // Report every change to this cluster, not only the ones its own on/off
    // commands made. A brightness command can turn a light on or off through
    // the LevelControl cluster's coupling, and that change is made by
    // matter.js rather than by any handler here - so without this the cache
    // and the UI would still show the old on/off state.
    this.reactTo(this.events.onOff$Changed, this.syncOnOffToCache)
  }

  /**
   * Mirror the cluster's own state into the accessory cache, whatever changed
   * it. Reading the value from the event means the cache follows what matter
   * actually committed, rather than a value predicted before the fact.
   */
  private syncOnOffToCache(onOff: boolean): void {
    registryOf(this.endpoint).syncStateToCache(this.endpoint.id, 'onOff', { onOff })
  }

  /**
   * Handle 'on' command
   */
  override async on(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = registryOf(this.endpoint)

    // Execute user handler
    await registry.executeHandler(endpointId, 'onOff', 'on')
    await lockStateForWrite(this)

    // Only reached if handler succeeded - update Matter state
    await super.on()

    // Sync state to cache
    registry.syncStateToCache(endpointId, 'onOff', { onOff: true })
  }

  /**
   * Handle 'off' command
   */
  override async off(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = registryOf(this.endpoint)

    // Execute user handler
    await registry.executeHandler(endpointId, 'onOff', 'off')
    await lockStateForWrite(this)

    // Only reached if handler succeeded - update Matter state
    await super.off()

    // Sync state to cache
    registry.syncStateToCache(endpointId, 'onOff', { onOff: false })
  }

  /**
   * Handle 'toggle' command
   */
  override async toggle(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = registryOf(this.endpoint)

    // A toggle handler is optional. matter.js's toggle() calls on() or off(),
    // which are the overrides above, so with no toggle handler the plugin's on
    // or off handler does the work (and syncs the cache).
    if (!registry.getHandler(endpointId, 'onOff', 'toggle')) {
      return super.toggle()
    }

    // Execute user handler
    await registry.executeHandler(endpointId, 'onOff', 'toggle')
    await lockStateForWrite(this)

    // Only reached if handler succeeded - update Matter state. Not through
    // super.toggle(): it would come back through the on() / off() overrides
    // and call the plugin a second time. super.on() and super.off() are
    // matter.js's own, and keep its extra work (timed on, scene control).
    if (this.state.onOff) {
      await super.off()
    } else {
      await super.on()
    }

    // Sync state to cache
    registry.syncStateToCache(endpointId, 'onOff', { onOff: this.state.onOff })
  }
}
