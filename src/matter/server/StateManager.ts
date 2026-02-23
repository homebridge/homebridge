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
          const updateObject = { [cluster]: attributes }
          await targetEndpoint.set(updateObject)

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
          result[key] = value
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
