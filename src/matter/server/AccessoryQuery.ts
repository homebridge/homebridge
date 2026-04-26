/**
 * Accessory Query
 *
 * Handles accessory lookup and UI display collection methods.
 */

import type { EndpointType } from '@matter/main'

import type { MatterAccessoryCache, SerializedMatterAccessory } from '../accessoryCache.js'
import type { InternalMatterAccessory, MatterAccessory } from '../types.js'

import { Logger } from '../../logger.js'

const log = Logger.withPrefix('Matter/Server')

export class AccessoryQuery {
  constructor(
    private readonly accessories: Map<string, InternalMatterAccessory>,
    private readonly getAccessoryCache: () => MatterAccessoryCache | null,
  ) {}

  /**
   * Get all registered accessories (Plugin API)
   */
  getAccessories(): MatterAccessory[] {
    return Array.from(this.accessories.values(), (acc) => {
      // eslint-disable-next-line unused-imports/no-unused-vars
      const { endpoint, registered, ...publicAccessory } = acc
      return publicAccessory
    })
  }

  /**
   * Get a specific accessory by UUID (Plugin API)
   */
  getAccessory(uuid: string): MatterAccessory | undefined {
    const accessory = this.accessories.get(uuid)
    if (!accessory) {
      return undefined
    }

    // eslint-disable-next-line unused-imports/no-unused-vars
    const { endpoint, registered, ...publicAccessory } = accessory
    return publicAccessory
  }

  /**
   * Get all cached accessories (Internal - for restore process)
   * @internal
   */
  getAllCachedAccessories(): SerializedMatterAccessory[] {
    const cache = this.getAccessoryCache()
    if (!cache) {
      log.debug('getAllCachedAccessories: No cache available')
      return []
    }
    const cached = cache.getAllCached()
    log.debug(`getAllCachedAccessories: Returning ${cached.length} accessories`)
    return cached
  }

  /**
   * Look up a cached accessory by UUID. O(1) Map lookup — prefer this over
   * scanning getAllCachedAccessories() when only one accessory is needed.
   * @internal
   */
  getCachedAccessory(uuid: string): SerializedMatterAccessory | undefined {
    return this.getAccessoryCache()?.getCached(uuid)
  }

  /**
   * Extract device type name from EndpointType
   */
  private getDeviceTypeName(deviceType: EndpointType): string {
    return (deviceType as any).name || 'Unknown'
  }

  /**
   * Get current cluster state for an accessory or part
   */
  private getCurrentState(uuid: string, partId?: string): Record<string, any> {
    const accessory = this.accessories.get(uuid)
    if (!accessory) {
      return {}
    }

    if (partId) {
      const part = accessory._parts?.find(p => p.id === partId)
      return part?.clusters || {}
    }

    return accessory.clusters || {}
  }

  /**
   * Collect all accessories for UI display
   */
  collectAccessories(bridgeUsername: string, bridgeType: string, bridgeName: string): any[] {
    const accessories: any[] = []

    for (const [uuid, accessory] of this.accessories.entries()) {
      const transformed = {
        uuid,
        displayName: accessory.displayName,
        deviceType: this.getDeviceTypeName(accessory.deviceType),
        clusters: this.getCurrentState(uuid),
        parts: accessory._parts?.map(part => ({
          id: part.id,
          displayName: part.displayName,
          deviceType: this.getDeviceTypeName(part.deviceType),
          clusters: this.getCurrentState(uuid, part.id),
        })),
        bridge: {
          username: bridgeUsername,
          type: bridgeType,
          name: bridgeName,
        },
      }
      accessories.push(transformed)
    }

    return accessories
  }

  /**
   * Get detailed info for a specific accessory
   */
  getAccessoryInfo(uuid: string): any | undefined {
    const accessory = this.accessories.get(uuid)
    if (!accessory) {
      return undefined
    }

    return {
      uuid,
      displayName: accessory.displayName,
      deviceType: this.getDeviceTypeName(accessory.deviceType),
      clusters: this.getCurrentState(uuid),
      parts: accessory._parts?.map(part => ({
        id: part.id,
        displayName: part.displayName,
        deviceType: this.getDeviceTypeName(part.deviceType),
        clusters: this.getCurrentState(uuid, part.id),
      })),
    }
  }
}
