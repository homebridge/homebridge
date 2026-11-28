/**
 * Accessory Query
 *
 * Handles accessory lookup and UI display collection methods.
 */

import type { Endpoint, EndpointType } from '@matter/main'

import type { MatterAccessoryCache, SerializedMatterAccessory } from '../accessoryCache.js'
import type { AccessoryInfo, ServerAccessoryData, ServerAccessoryListEntry } from '../managerTypes.js'
import type { InternalMatterAccessory, MatterAccessory } from '../types.js'

import { Logger } from '../../logger.js'
import { coerceBigintsToNumbers } from './StateManager.js'

const log = Logger.withPrefix('Matter/Server')

/**
 * Add each cluster's featureMap to the declared cluster state.
 *
 * The declared clusters are what the PLUGIN asked for, so on their own they
 * cannot tell a consumer which features the cluster ended up with - a
 * thermostat with and without AutoMode declares the same setpoints, and the
 * deadband is optional either way. The featureMap (named booleans, e.g.
 * `{ heating: true, cooling: true, autoMode: false }`) comes off the live
 * endpoint and settles that.
 *
 * Features never change after registration and the UI merges later state
 * updates into the cluster object rather than replacing it, so sending the map
 * once is enough.
 */
function withFeatureMaps(
  clusters: Record<string, any>,
  endpoint: Endpoint | undefined,
): Record<string, any> {
  const endpointState = (endpoint as { state?: Record<string, { featureMap?: unknown }> } | undefined)?.state
  if (!endpointState) {
    // Not registered yet (or restored without a live endpoint) - serve the
    // declared state as-is and let the consumer fall back
    return clusters
  }

  const enriched: Record<string, any> = {}
  for (const [clusterName, state] of Object.entries(clusters)) {
    try {
      const featureMap = endpointState[clusterName]?.featureMap
      enriched[clusterName] = featureMap !== undefined
        ? { featureMap, ...state }
        : state
    } catch {
      // Reading a behavior's state can throw while the endpoint is still
      // initialising - the declared state alone is still correct
      enriched[clusterName] = state
    }
  }
  return enriched
}

/** The fields of the public MatterAccessory type. */
const PUBLIC_ACCESSORY_FIELDS = [
  'UUID',
  'displayName',
  'deviceType',
  'features',
  'serialNumber',
  'manufacturer',
  'model',
  'firmwareRevision',
  'hardwareRevision',
  'softwareVersion',
  'context',
  'clusters',
  'handlers',
  'getState',
  'parts',
] as const satisfies ReadonlyArray<keyof MatterAccessory>

/**
 * The public view of an accessory record: the fields of MatterAccessory and
 * nothing else. The record also holds the live matter.js endpoints (its own
 * and one per part), which are not for a caller to hold and which can not be
 * written as JSON (they refer back to themselves).
 */
function toPublicAccessory(accessory: InternalMatterAccessory): MatterAccessory {
  const publicAccessory: Partial<Record<keyof MatterAccessory, unknown>> = {}
  for (const field of PUBLIC_ACCESSORY_FIELDS) {
    if (accessory[field] !== undefined) {
      publicAccessory[field] = accessory[field]
    }
  }
  return publicAccessory as unknown as MatterAccessory
}

export class AccessoryQuery {
  constructor(
    private readonly accessories: Map<string, InternalMatterAccessory>,
    private readonly getAccessoryCache: () => MatterAccessoryCache | null,
  ) {}

  /**
   * Get all registered accessories (Plugin API)
   */
  getAccessories(): MatterAccessory[] {
    return Array.from(this.accessories.values(), toPublicAccessory)
  }

  /**
   * Get a specific accessory by UUID (Plugin API)
   */
  getAccessory(uuid: string): MatterAccessory | undefined {
    const accessory = this.accessories.get(uuid)
    return accessory && toPublicAccessory(accessory)
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
   * Get current cluster state for an accessory or part, enriched with each
   * cluster's featureMap - see {@link withFeatureMaps}
   */
  private getCurrentState(uuid: string, partId?: string): Record<string, any> {
    const accessory = this.accessories.get(uuid)
    if (!accessory) {
      return {}
    }

    if (partId) {
      // A part carries its own endpoint, so its clusters are enriched the same
      // way - a thermostat exposed as a part needs the features just as much
      const part = accessory._parts?.find(p => p.id === partId)
      return part
        ? withFeatureMaps(part.clusters || {}, part.endpoint)
        : {}
    }

    return withFeatureMaps(accessory.clusters || {}, accessory.endpoint)
  }

  /**
   * Read the live cluster state of an accessory or one of its parts, straight
   * from its endpoint. Returns an empty object when the accessory, part or
   * endpoint does not exist (yet).
   *
   * This reads the internal record: getAccessory() leaves the endpoint out of
   * what it hands back, so a caller that only has that can never see the
   * state (#4014).
   */
  getLiveState(uuid: string, partId?: string): Record<string, Record<string, unknown>> {
    const accessory = this.accessories.get(uuid)
    const endpoint = partId
      ? accessory?._parts?.find(part => part.id === partId)?.endpoint
      : accessory?.endpoint
    const endpointState = (endpoint as { state?: Record<string, Record<string, unknown>> } | undefined)?.state
    if (!endpointState) {
      return {}
    }

    const state: Record<string, Record<string, unknown>> = {}
    for (const [clusterName, clusterState] of Object.entries(endpointState)) {
      state[clusterName] = {}
      for (const [key, value] of Object.entries(clusterState ?? {})) {
        if (!key.startsWith('_') && !key.startsWith('$')) {
          // The UI gets this as JSON, which has no way to write a bigint
          // (matter.js uses one for some 64-bit values): one such value made
          // the whole accessory list fail to send.
          state[clusterName][key] = coerceBigintsToNumbers(value)
        }
      }
    }
    return state
  }

  /**
   * Collect all accessories for UI display
   */
  collectAccessories(bridgeUsername: string, bridgeType: AccessoryInfo['bridge']['type'], bridgeName: string): ServerAccessoryListEntry[] {
    const accessories: ServerAccessoryListEntry[] = []

    for (const [uuid, accessory] of this.accessories.entries()) {
      const transformed: ServerAccessoryListEntry = {
        uuid,
        displayName: accessory.displayName,
        deviceType: this.getDeviceTypeName(accessory.deviceType),
        manufacturer: accessory.manufacturer,
        model: accessory.model,
        serialNumber: accessory.serialNumber,
        firmwareRevision: accessory.firmwareRevision,
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
  getAccessoryInfo(uuid: string): ServerAccessoryData | undefined {
    const accessory = this.accessories.get(uuid)
    if (!accessory) {
      return undefined
    }

    return {
      uuid,
      displayName: accessory.displayName,
      deviceType: this.getDeviceTypeName(accessory.deviceType),
      manufacturer: accessory.manufacturer,
      model: accessory.model,
      serialNumber: accessory.serialNumber,
      firmwareRevision: accessory.firmwareRevision,
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
