/**
 * LevelControl Cluster Behavior
 *
 * Handles brightness/level control for dimmable lights
 */

import { LevelControlServer } from '@matter/main/behaviors/level-control'
import { LevelControl } from '@matter/main/clusters/level-control'

import { getRegistryManager } from './EndpointContext.js'

export class HomebridgeLevelControlServer extends LevelControlServer {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  /**
   * Run the plugin's handler for a level command.
   *
   * Every level handler is optional, and plugins rarely register them all: the
   * docs and examples only show moveToLevelWithOnOff. So a command with no
   * handler of its own name is not failed. The first registered name in
   * `handlerNames` is called with the request (a command and its "with on/off"
   * twin take the same request). When none of those is registered and the
   * command works out to one target level (step, move), the plugin's
   * move-to-level handler is called with that level, so the level never
   * changes without the plugin being told. With no handler at all, matter.js
   * carries on alone.
   */
  private async runHandler(handlerNames: string[], request: unknown, target?: { handlerNames: string[], request: () => LevelControl.MoveToLevelRequest }): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()
    const registered = (names: string[]) => names.find(name => registry.getHandler(endpointId, 'levelControl', name))

    const handlerName = registered(handlerNames)
    if (handlerName) {
      await registry.executeHandler(endpointId, 'levelControl', handlerName, request)
      return
    }

    const targetHandlerName = target && registered(target.handlerNames)
    if (target && targetHandlerName) {
      await registry.executeHandler(endpointId, 'levelControl', targetHandlerName, target.request())
    }
  }

  /**
   * The move-to-level request a step command works out to: the current level
   * moved by the step size, kept within the minimum and maximum level.
   */
  private stepTarget(request: LevelControl.StepRequest): LevelControl.MoveToLevelRequest {
    const direction = request.stepMode === LevelControl.StepMode.Up
      ? 1
      : -1
    return {
      level: Math.min(this.maxLevel, Math.max(this.minLevel, this.currentLevel + request.stepSize * direction)),
      transitionTime: request.transitionTime,
      optionsMask: request.optionsMask,
      optionsOverride: request.optionsOverride,
    }
  }

  /**
   * The move-to-level request a move command works out to: the maximum level
   * when moving up, the minimum level when moving down.
   */
  private moveTarget(request: LevelControl.MoveRequest): LevelControl.MoveToLevelRequest {
    return {
      level: request.moveMode === LevelControl.MoveMode.Up
        ? this.maxLevel
        : this.minLevel,
      transitionTime: null,
      optionsMask: request.optionsMask,
      optionsOverride: request.optionsOverride,
    }
  }

  /**
   * Handle moveToLevel command
   */
  override async moveToLevel(request: LevelControl.MoveToLevelRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    // Execute user handler, falling back to the handler of the twin command
    await this.runHandler(['moveToLevel', 'moveToLevelWithOnOff'], request)

    // Only reached if handler succeeded - update Matter state
    await super.moveToLevel(request)

    // Sync state to cache
    registry.syncStateToCache(endpointId, 'levelControl', {
      currentLevel: request.level,
    })
  }

  /**
   * Handle move command
   */
  override async move(request: LevelControl.MoveRequest): Promise<void> {
    // Execute user handler, falling back to the handler of the twin command
    await this.runHandler(['move', 'moveWithOnOff'], request, {
      handlerNames: ['moveToLevel', 'moveToLevelWithOnOff'],
      request: () => this.moveTarget(request),
    })

    // Only reached if handler succeeded
    await super.move(request)
  }

  /**
   * Handle step command
   */
  override async step(request: LevelControl.StepRequest): Promise<void> {
    // Execute user handler, falling back to the handler of the twin command
    await this.runHandler(['step', 'stepWithOnOff'], request, {
      handlerNames: ['moveToLevel', 'moveToLevelWithOnOff'],
      request: () => this.stepTarget(request),
    })

    // Only reached if handler succeeded
    await super.step(request)
  }

  /**
   * Handle stop command
   */
  override async stop(request: LevelControl.StopRequest): Promise<void> {
    // Execute user handler, falling back to the handler of the twin command
    await this.runHandler(['stop', 'stopWithOnOff'], request)

    // Only reached if handler succeeded
    await super.stop(request)
  }

  /**
   * Handle moveToLevelWithOnOff command
   */
  override async moveToLevelWithOnOff(request: LevelControl.MoveToLevelRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    // Execute user handler, falling back to the handler of the twin command
    await this.runHandler(['moveToLevelWithOnOff', 'moveToLevel'], request)

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
  }

  /**
   * Handle moveWithOnOff command
   */
  override async moveWithOnOff(request: LevelControl.MoveRequest): Promise<void> {
    // Execute user handler, falling back to the plain move handler
    await this.runHandler(['moveWithOnOff', 'move'], request, {
      handlerNames: ['moveToLevelWithOnOff', 'moveToLevel'],
      request: () => this.moveTarget(request),
    })

    // Only reached if handler succeeded
    await super.moveWithOnOff(request)
  }

  /**
   * Handle stepWithOnOff command
   */
  override async stepWithOnOff(request: LevelControl.StepRequest): Promise<void> {
    // Execute user handler, falling back to the plain step handler
    await this.runHandler(['stepWithOnOff', 'step'], request, {
      handlerNames: ['moveToLevelWithOnOff', 'moveToLevel'],
      request: () => this.stepTarget(request),
    })

    // Only reached if handler succeeded
    await super.stepWithOnOff(request)
  }

  /**
   * Handle stopWithOnOff command
   */
  override async stopWithOnOff(request: LevelControl.StopRequest): Promise<void> {
    // Execute user handler, falling back to the plain stop handler
    await this.runHandler(['stopWithOnOff', 'stop'], request)

    // Only reached if handler succeeded
    await super.stopWithOnOff(request)
  }
}
