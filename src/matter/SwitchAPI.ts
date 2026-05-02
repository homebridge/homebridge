import type { MatterAPI } from '../api.js'

import { Logger } from '../logger.js'
import { clusterNames } from './index.js'

const log = Logger.withPrefix('Matter/Switch')

/**
 * Switch helper API for `GenericSwitch` accessories (stateless remotes and buttons).
 *
 * Grouped under `api.matter?.switch` so device-type-specific helpers don't crowd the
 * top-level `MatterAPI` surface. Built on top of `updateAccessoryState` for the Switch cluster.
 */
export interface SwitchAPI {
  /**
   * Emit a switch action for a `GenericSwitch` accessory.
   *
   * High-level helper for stateless switches and remotes (e.g. Pico remotes, scene controllers).
   * Sets the Switch cluster's `currentPosition` attribute, which causes the Matter.js `SwitchServer`
   * to automatically fire the appropriate cluster events:
   *
   * | Action    | When to use                                | Events fired by Matter.js              |
   * |-----------|-------------------------------------------|----------------------------------------|
   * | `press`   | Physical button pressed / contact closed  | `initialPress`                         |
   * | `release` | Physical button released / contact opened | `shortRelease` or `longRelease`*       |
   *
   * `shortRelease` vs `longRelease` is determined automatically by the SwitchServer based on
   * how long the button was held (configurable via `longPressDelay`, default 2 s).
   * Multi-press sequences (`multiPressComplete`) are generated automatically when `press`/`release`
   * cycles occur within the `multiPressDelay` window (default 300 ms).
   *
   * @param uuid - UUID of the GenericSwitch accessory
   * @param action - `'press'` to press the button, `'release'` to release it
   * @param options - Optional configuration
   * @param options.position - Button position index (1-based). Defaults to `1`. Use when the
   * GenericSwitch has multiple positions (e.g. a multi-button remote).
   * @param options.partId - Part ID for composed devices with GenericSwitch parts.
   *
   * @example
   * ```typescript
   * // Simple single-button press and release
   * await api.matter?.switch.emit(uuid, 'press')
   * await api.matter?.switch.emit(uuid, 'release')
   *
   * // Multi-button remote: button 2 press and release
   * await api.matter?.switch.emit(uuid, 'press', { position: 2 })
   * await api.matter?.switch.emit(uuid, 'release', { position: 2 })
   *
   * // GenericSwitch as a part in a composed device
   * await api.matter?.switch.emit(uuid, 'press', { partId: 'button-top' })
   * await api.matter?.switch.emit(uuid, 'release', { partId: 'button-top' })
   * ```
   */
  emit: (uuid: string, action: 'press' | 'release', options?: { position?: number, partId?: string }) => Promise<void>

  /**
   * Emit a high-level gesture for a `GenericSwitch` accessory.
   *
   * Convenience helper for integrations that already classify gestures (e.g. remotes that
   * report only `single`, `double`, or `hold`). Translates each gesture into the canonical
   * `press` / `release` sequence that Matter.js `SwitchServer` expects, so the server still
   * determines the correct Switch cluster events (`shortRelease`, `longRelease`,
   * `multiPressComplete`) based on timing.
   *
   * | Gesture       | Translated sequence                                             |
   * |---------------|-----------------------------------------------------------------|
   * | `singlePress` | `press` → `release`                                            |
   * | `doublePress` | `press` → `release` → *(multiPressDelayMs)* → `press` → `release` |
   * | `longPress`   | `press` → *(longPressDelayMs)* → `release`                     |
   *
   * Default delays:
   * - `longPressDelayMs` – `2500` ms (just above the Matter.js `longPressDelay` default of 2000 ms)
   * - `multiPressDelayMs` – `100` ms (well within the Matter.js `multiPressDelay` window of 300 ms)
   *
   * @param uuid - UUID of the GenericSwitch accessory
   * @param gesture - The gesture to emit: `'singlePress'`, `'doublePress'`, or `'longPress'`
   * @param options - Optional configuration
   * @param options.position - Button position index (1-based). Defaults to `1`.
   * @param options.partId - Part ID for composed devices with GenericSwitch parts.
   * @param options.longPressDelayMs - How long (ms) to hold the button for a long press.
   * Defaults to `2500`. Only relevant for `'longPress'`.
   * @param options.multiPressDelayMs - Delay (ms) between the two press cycles of a double press.
   * Defaults to `100`. Only relevant for `'doublePress'`.
   *
   * @example
   * ```typescript
   * // Single press on a simple remote
   * await api.matter?.switch.emitGesture(uuid, 'singlePress')
   *
   * // Double press on button 2 of a multi-button remote
   * await api.matter?.switch.emitGesture(uuid, 'doublePress', { position: 2 })
   *
   * // Long press on a composed device part
   * await api.matter?.switch.emitGesture(uuid, 'longPress', { partId: 'button-top' })
   * ```
   */
  emitGesture: (
    uuid: string,
    gesture: 'singlePress' | 'doublePress' | 'longPress',
    options?: {
      position?: number
      partId?: string
      longPressDelayMs?: number
      multiPressDelayMs?: number
    },
  ) => Promise<void>
}

/**
 * Implementation of {@link SwitchAPI}.
 *
 * Translates `press`/`release` into the correct `switch.currentPosition` value
 * (`options.position ?? 1` for press, `0` for release) and delegates to
 * `MatterAPI.updateAccessoryState`. The Matter.js `SwitchServer` reacts to the
 * attribute change and emits the corresponding Switch cluster events
 * (`initialPress`, `shortRelease`, `longRelease`, `multiPressComplete`).
 */
export class SwitchAPIImpl implements SwitchAPI {
  constructor(private readonly matterApi: Pick<MatterAPI, 'updateAccessoryState'>) {}

  async emit(
    uuid: string,
    action: 'press' | 'release',
    options?: { position?: number, partId?: string },
  ): Promise<void> {
    if (!uuid) {
      log.error('switch.emit: uuid parameter is required')
      return
    }

    if (action !== 'press' && action !== 'release') {
      log.error(`switch.emit: invalid action "${action as string}" — must be "press" or "release"`)
      return
    }

    let position: number
    if (action === 'press') {
      const rawPosition = options?.position ?? 1
      if (!Number.isInteger(rawPosition) || rawPosition < 1) {
        log.warn(`switch.emit: invalid position ${rawPosition} — must be a finite integer >= 1; defaulting to 1`)
        position = 1
      } else {
        position = rawPosition
      }
    } else {
      position = 0
    }

    const partId = options?.partId

    log.debug(
      `Emitting switch ${action} for accessory ${uuid}: currentPosition=${position}${partId ? `, partId=${partId}` : ''}`,
    )

    await this.matterApi.updateAccessoryState(uuid, clusterNames.Switch, { currentPosition: position }, partId)
  }

  async emitGesture(
    uuid: string,
    gesture: 'singlePress' | 'doublePress' | 'longPress',
    options?: {
      position?: number
      partId?: string
      longPressDelayMs?: number
      multiPressDelayMs?: number
    },
  ): Promise<void> {
    if (!uuid) {
      log.error('switch.emitGesture: uuid parameter is required')
      return
    }

    if (gesture !== 'singlePress' && gesture !== 'doublePress' && gesture !== 'longPress') {
      log.error(
        `switch.emitGesture: invalid gesture "${gesture as string}" — must be "singlePress", "doublePress", or "longPress"`,
      )
      return
    }

    const emitOpts = { position: options?.position, partId: options?.partId }

    switch (gesture) {
      case 'singlePress': {
        await this.emit(uuid, 'press', emitOpts)
        await this.emit(uuid, 'release', emitOpts)
        break
      }
      case 'doublePress': {
        const multiPressDelayMs = options?.multiPressDelayMs ?? 100
        await this.emit(uuid, 'press', emitOpts)
        await this.emit(uuid, 'release', emitOpts)
        await new Promise<void>(resolve => setTimeout(resolve, multiPressDelayMs))
        await this.emit(uuid, 'press', emitOpts)
        await this.emit(uuid, 'release', emitOpts)
        break
      }
      case 'longPress': {
        const longPressDelayMs = options?.longPressDelayMs ?? 2500
        await this.emit(uuid, 'press', emitOpts)
        await new Promise<void>(resolve => setTimeout(resolve, longPressDelayMs))
        await this.emit(uuid, 'release', emitOpts)
        break
      }
    }
  }
}
