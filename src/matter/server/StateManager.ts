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
function coerceBigintsToNumbers(value: unknown): unknown {
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

export class StateManager {
  constructor(
    private readonly accessories: Map<string, InternalMatterAccessory>,
    private readonly emitter: EventEmitter,
    private readonly getMonitoringEnabled: () => boolean,
  ) {}

  /**
   * Update the state of a Matter accessory (Plugin API)
   */
  async updateAccessoryState(
    uuid: string,
    cluster: string,
    attributes: Record<string, unknown>,
    partId?: string,
  ): Promise<void> {
    const accessory = this.accessories.get(uuid)
    if (!accessory) {
      throw new MatterDeviceError(`Accessory ${uuid} not found or not registered`)
    }

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

    // Defer the update to avoid "read-only transaction" errors when called from handlers
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
            await targetEndpoint.set(updateObject)
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

          const partInfo = partId ? ` (part: ${partId})` : ''
          log.debug(`Updated ${cluster} state for ${displayName}${partInfo}:`, attributes)

          this.notifyStateChange(uuid, cluster, attributes, partId)
          resolve()
        } catch (error) {
          const partInfo = partId ? ` part ${partId}` : ''
          log.error(`Failed to update state for accessory ${uuid}${partInfo}:`, error)
          reject(new MatterDeviceError(`Failed to update accessory state: ${error}`))
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

    let targetEndpoint: any
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
      if (!targetEndpoint.state) {
        log.debug(`endpoint.state is undefined for ${displayName}`)
        return undefined
      }

      if (!targetEndpoint.state[cluster]) {
        const availableClusters = Object.keys(targetEndpoint.state || {})
        log.debug(`Cluster '${cluster}' not found on ${displayName}. Available: ${availableClusters.join(', ')}`)
        return undefined
      }

      const clusterState = targetEndpoint.state[cluster]
      const result: Record<string, unknown> = {}

      const allKeys = new Set([
        ...Object.keys(clusterState),
        ...Object.getOwnPropertyNames(clusterState),
      ])

      for (const key of allKeys) {
        try {
          if (key.startsWith('_') || key.startsWith('$')) {
            continue
          }
          const value = clusterState[key]
          if (typeof value === 'function' || value === undefined) {
            continue
          }
          result[key] = coerceBigintsToNumbers(value)
        } catch (propError) {
          log.debug(`Could not read property ${key} from ${cluster}:`, propError)
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
      const partInfo = partId ? ` (part: ${partId})` : ''
      log.debug(`Triggering command ${cluster}.${command} for ${displayName}${partInfo}`, args)

      await targetEndpoint.act((agent: any) => {
        const clusterBehavior = agent[cluster]
        if (!clusterBehavior) {
          throw new Error(`Cluster '${cluster}' not found on endpoint`)
        }
        if (typeof clusterBehavior[command] !== 'function') {
          throw new TypeError(`Command '${command}' not found on cluster '${cluster}'`)
        }

        if (args && Object.keys(args).length > 0) {
          return clusterBehavior[command](args)
        } else {
          return clusterBehavior[command]()
        }
      })

      log.debug(`Command ${cluster}.${command} succeeded for ${displayName}${partInfo}`)
    } catch (error) {
      const partInfo = partId ? ` part ${partId}` : ''
      log.error(`Failed to trigger command for accessory ${uuid}${partInfo}:`, error)
      throw new MatterDeviceError(`Failed to trigger command: ${error}`)
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
