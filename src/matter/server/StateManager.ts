/**
 * State Manager
 *
 * Handles accessory state updates, state retrieval, command triggering,
 * and state change notifications.
 */

import type { Endpoint } from '@matter/main'
import type { EventEmitter } from 'node:events'

import type {
  InternalMatterAccessory,
  InternalMatterAccessoryPart,
} from '../types.js'

import { Logger } from '../../logger.js'
import { forgetPluginUpdate, notePluginUpdate } from '../behaviors/pluginUpdates.js'
import { deviceErrorFrom } from '../MatterError.js'
import { MatterDeviceError } from '../types.js'

const log = Logger.withPrefix('Matter/Server')

/**
 * Recursively convert bigint values to numbers. matter.js can surface int64
 * attributes (e.g. ElectricalPowerMeasurement.activePower, energy readings)
 * as bigint, which JSON.stringify cannot serialize - and state read results
 * cross the child-bridge IPC boundary as JSON. Energy values stay far below
 * Number.MAX_SAFE_INTEGER (2^53 mWh is around nine billion kWh), so the
 * conversion is lossless in practice.
 */
export function coerceBigintsToNumbers(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return Number(value)
  }
  if (Array.isArray(value)) {
    return value.map(coerceBigintsToNumbers)
  }
  // Only recurse into plain data objects (cluster structs). Anything with a
  // prototype - Uint8Array byte strings, Dates, class instances - must pass
  // through untouched or the copy would mangle it.
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) {
      return value
    }
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      result[key] = coerceBigintsToNumbers(entry)
    }
    return result
  }
  return value
}

/**
 * Maps the four ElectricalEnergyMeasurement reading attributes to the shape
 * matter.js setMeasurement() expects.
 */
const ENERGY_ATTRIBUTE_MAP: Record<string, { period: 'cumulativeEnergy' | 'periodicEnergy', direction: 'imported' | 'exported' }> = {
  cumulativeEnergyImported: { period: 'cumulativeEnergy', direction: 'imported' },
  cumulativeEnergyExported: { period: 'cumulativeEnergy', direction: 'exported' },
  periodicEnergyImported: { period: 'periodicEnergy', direction: 'imported' },
  periodicEnergyExported: { period: 'periodicEnergy', direction: 'exported' },
}

/**
 * Whether a cluster command has request fields. matter.js describes each
 * command of a cluster; a command with no fields there takes no request.
 * When that description is not there, the answer is no.
 */
function commandTakesRequest(clusterBehavior: unknown, command: string): boolean {
  const described = clusterBehavior as {
    cluster?: { commands?: Record<string, { schema?: { members?: { length?: unknown } } } | undefined> }
  }
  const members = described.cluster?.commands?.[command]?.schema?.members
  const count = members?.length
  return typeof count === 'number' && count > 0
}

export class StateManager {
  /**
   * The last command started on each endpoint. Each command runs in its own
   * transaction, and the UI sends some in pairs without waiting - a dimmable
   * light's tile sends the level, then "on". The second then reached the onOff
   * state while the first still held it, and failed with "Cannot lock ...
   * synchronously" (#4029). So commands for one endpoint run one at a time.
   */
  private readonly commandQueues = new WeakMap<object, Promise<unknown>>()

  constructor(
    private readonly accessories: Map<string, InternalMatterAccessory>,
    private readonly emitter: EventEmitter,
    private readonly getMonitoringEnabled: () => boolean,
  ) {}

  /**
   * Update the state of a Matter accessory (Plugin API)
   *
   * A plugin calls this to report what its device did, so the plugin's own
   * attribute-change handlers (fan mode, thermostat setpoints and so on) are
   * not called for it. The Homebridge UI sets these attributes through here as
   * well, to ask for a change: it passes `callHandlers` so they are.
   */
  async updateAccessoryState(
    uuid: string,
    cluster: string,
    attributes: Record<string, unknown>,
    partId?: string,
    options: { callHandlers?: boolean } = {},
  ): Promise<void> {
    const accessory = this.accessories.get(uuid)
    if (!accessory) {
      throw new MatterDeviceError(`Accessory ${uuid} not found or not registered`)
    }

    // Plugins may pass bigint for int64 attributes (e.g. energy readings).
    // Coerce once at entry: the values also land in accessory.clusters, which
    // is JSON-serialized by the accessory cache and the UI IPC channel -
    // JSON.stringify throws on bigint. matter.js accepts number for int64.
    attributes = coerceBigintsToNumbers(attributes) as Record<string, unknown>

    let targetEndpoint: Endpoint
    let targetClusters: InternalMatterAccessory['clusters'] | InternalMatterAccessoryPart['clusters']
    let displayName: string

    if (partId) {
      const part = accessory._parts?.find(p => p.id === partId)
      if (!part || !part.endpoint) {
        throw new MatterDeviceError(`Part ${partId} not found in accessory ${uuid}`)
      }
      targetEndpoint = part.endpoint
      targetClusters = part.clusters
      displayName = part.displayName || `${accessory.displayName} - ${partId}`
    } else {
      if (!accessory.endpoint) {
        throw new MatterDeviceError(`Accessory ${uuid} not registered or missing endpoint`)
      }
      targetEndpoint = accessory.endpoint
      targetClusters = accessory.clusters
      displayName = accessory.displayName
    }

    // Defer the update to avoid "read-only transaction" errors when called from handlers.
    // setImmediate is enough: it runs after the current call stack and its
    // promise jobs, so the handler's own (read-only) step has returned by then.
    return new Promise((resolve, reject) => {
      setImmediate(async () => {
        try {
          if (cluster === 'electricalEnergyMeasurement') {
            // Energy readings must go through matter.js setMeasurement() so the
            // spec-required CumulativeEnergyMeasured / PeriodicEnergyMeasured
            // events are emitted alongside the attribute updates.
            await this.applyEnergyMeasurementUpdate(targetEndpoint, attributes)
          } else {
            const updateObject = { [cluster]: attributes }
            const noted = options.callHandlers
              ? []
              : notePluginUpdate(targetEndpoint, cluster, attributes, (targetEndpoint.state as Record<string, Record<string, unknown> | undefined>)[cluster])
            try {
              await targetEndpoint.set(updateObject)
            } catch (error) {
              forgetPluginUpdate(targetEndpoint, cluster, noted)
              throw error
            }
          }

          // Update cached clusters object for persistence
          if (!targetClusters) {
            log.warn(`Target clusters undefined for ${displayName}, cannot cache state`)
          } else {
            if (!targetClusters[cluster]) {
              targetClusters[cluster] = {}
            }
            targetClusters[cluster] = {
              ...targetClusters[cluster],
              ...attributes,
            }
          }

          const partInfo = partId
            ? ` (part: ${partId})`
            : ''
          log.debug(`Updated ${cluster} state for ${displayName}${partInfo}:`, attributes)

          this.notifyStateChange(uuid, cluster, attributes, partId)
          resolve()
        } catch (error) {
          const partInfo = partId
            ? ` part ${partId}`
            : ''
          log.error(`Failed to update state for accessory ${uuid}${partInfo}:`, error)
          reject(deviceErrorFrom('Failed to update accessory state', error))
        }
      })
    })
  }

  /**
   * Apply an ElectricalEnergyMeasurement update. Non-null energy readings are
   * routed through the matter.js setMeasurement() helper, which updates the
   * attributes and also emits the CumulativeEnergyMeasured /
   * PeriodicEnergyMeasured events the spec requires. Everything else (accuracy,
   * null clears) goes through a plain state set.
   */
  private async applyEnergyMeasurementUpdate(endpoint: Endpoint, attributes: Record<string, unknown>): Promise<void> {
    const behaviorClass = (endpoint as any).behaviors?.supported?.electricalEnergyMeasurement
    if (!behaviorClass) {
      // No EEM behavior on this endpoint - let the plain set produce the
      // same "unsupported cluster" error any other cluster would.
      await endpoint.set({ electricalEnergyMeasurement: attributes } as any)
      return
    }

    const measurement: Record<string, Record<string, unknown>> = {}
    const rest: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(attributes)) {
      const mapping = ENERGY_ATTRIBUTE_MAP[key]
      if (mapping && value !== null && value !== undefined) {
        measurement[mapping.period] = { ...measurement[mapping.period], [mapping.direction]: value }
      } else {
        rest[key] = value
      }
    }

    if (Object.keys(rest).length > 0) {
      await endpoint.set({ electricalEnergyMeasurement: rest } as any)
    }

    if (Object.keys(measurement).length > 0) {
      await endpoint.act((agent: any) => agent.get(behaviorClass).setMeasurement(measurement))
    }
  }

  /**
   * Get a Matter accessory's current state
   */
  getAccessoryState(uuid: string, cluster: string, partId?: string): Record<string, unknown> | undefined {
    const accessory = this.accessories.get(uuid)
    if (!accessory) {
      log.debug(`Accessory ${uuid} not found`)
      return undefined
    }

    let targetEndpoint: Endpoint
    let displayName: string

    if (partId) {
      const part = accessory._parts?.find(p => p.id === partId)
      if (!part || !part.endpoint) {
        log.debug(`Part ${partId} not found in accessory ${uuid}`)
        return undefined
      }
      targetEndpoint = part.endpoint
      displayName = part.displayName || `${accessory.displayName} - ${partId}`
    } else {
      if (!accessory.endpoint) {
        log.debug(`Accessory ${uuid} not registered or missing endpoint`)
        return undefined
      }
      targetEndpoint = accessory.endpoint
      displayName = accessory.displayName
    }

    try {
      const clusterState = (targetEndpoint.state as Record<string, Record<string, unknown> | undefined> | undefined)?.[cluster]
      if (!clusterState) {
        log.debug(`Cluster '${cluster}' not found on ${displayName}. Available: ${Object.keys(targetEndpoint.state ?? {}).join(', ')}`)
        return undefined
      }

      // matter.js lists every attribute of a cluster's state as a plain entry
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(clusterState)) {
        if (!key.startsWith('_') && !key.startsWith('$') && typeof value !== 'function' && value !== undefined) {
          result[key] = coerceBigintsToNumbers(value)
        }
      }

      if (Object.keys(result).length === 0) {
        log.debug(`Cluster ${cluster} found but no readable properties on accessory ${accessory.displayName}`)
        return undefined
      }

      return result
    } catch (error) {
      log.error(`Failed to get state for accessory ${uuid}:`, error)
      return undefined
    }
  }

  /**
   * Trigger a command on a Matter accessory
   */
  async triggerCommand(
    uuid: string,
    cluster: string,
    command: string,
    args?: Record<string, unknown>,
    partId?: string,
  ): Promise<void> {
    const accessory = this.accessories.get(uuid)
    if (!accessory) {
      throw new MatterDeviceError(`Accessory ${uuid} not found or not registered`)
    }

    let targetEndpoint: any
    let displayName: string

    if (partId) {
      const part = accessory._parts?.find(p => p.id === partId)
      if (!part || !part.endpoint) {
        throw new MatterDeviceError(`Part ${partId} not found in accessory ${uuid}`)
      }
      targetEndpoint = part.endpoint
      displayName = part.displayName || `${accessory.displayName} - ${partId}`
    } else {
      if (!accessory.endpoint) {
        throw new MatterDeviceError(`Accessory ${uuid} not registered or missing endpoint`)
      }
      targetEndpoint = accessory.endpoint
      displayName = accessory.displayName
    }

    try {
      const partInfo = partId
        ? ` (part: ${partId})`
        : ''
      log.debug(`Triggering command ${cluster}.${command} for ${displayName}${partInfo}`, args)

      const previous = this.commandQueues.get(targetEndpoint) ?? Promise.resolve()
      const run = previous.catch(() => {}).then(() => targetEndpoint.act((agent: any) => {
        const clusterBehavior = agent[cluster]
        if (!clusterBehavior) {
          throw new Error(`Cluster '${cluster}' not found on endpoint`)
        }
        if (typeof clusterBehavior[command] !== 'function') {
          throw new TypeError(`Command '${command}' not found on cluster '${cluster}'`)
        }

        // Over Matter, a command that has request fields always arrives with a
        // request object, also when every field is left out. The same holds
        // here, so a handler can read its request whether the command came
        // from a controller or from the UI. A command with no request (on,
        // off, stop and so on) is still called with nothing.
        if (args && Object.keys(args).length > 0) {
          return clusterBehavior[command](args)
        }
        return commandTakesRequest(clusterBehavior, command)
          ? clusterBehavior[command]({})
          : clusterBehavior[command]()
      }))
      this.commandQueues.set(targetEndpoint, run)
      try {
        await run
      } finally {
        if (this.commandQueues.get(targetEndpoint) === run) {
          this.commandQueues.delete(targetEndpoint)
        }
      }

      log.debug(`Command ${cluster}.${command} succeeded for ${displayName}${partInfo}`)
    } catch (error) {
      const partInfo = partId
        ? ` part ${partId}`
        : ''
      log.error(`Failed to trigger command for accessory ${uuid}${partInfo}:`, error)
      throw deviceErrorFrom('Failed to trigger command', error)
    }
  }

  /**
   * Notify that an accessory's state has changed
   */
  notifyStateChange(uuid: string, cluster: string, state: Record<string, unknown>, partId?: string): void {
    if (!this.getMonitoringEnabled()) {
      return
    }

    this.emitter.emit('stateChange', { uuid, cluster, state, partId })
  }
}
