/**
 * Reading and re-applying the features a device type's clusters were composed
 * with.
 *
 * Kept apart from serverHelpers on purpose: the Matter accessory cache uses
 * these, and serverHelpers loads every matter.js cluster and device type the
 * moment it is imported.
 */
import type { EndpointType } from '@matter/main'
import type { Behavior } from '@matter/node'

import { Logger } from '../logger.js'

const log = Logger.withPrefix('Matter/Server')

interface BehaviorFeatures {
  cluster?: { supportedFeatures?: Record<string, boolean> }
  features?: Record<string, boolean>
}

/**
 * Extract whatever features a behavior already declares, whatever the cluster.
 *
 * matter.js records a composed behavior's features as camelCase booleans and
 * `.with(...)` takes the PascalCase names, so carrying a feature set across is
 * just a capitalise - the same mapping the per-cluster extractors in serverHelpers do by
 * hand (`hueSaturation` to `HueSaturation`, `xy` to `Xy`).
 *
 * Used for clusters whose features we have no reason to reason about. We only
 * need them preserved when a Homebridge behavior replaces the base one, and a
 * hand-written list would silently drop any feature matter.js adds later.
 */
export function extractDeclaredFeatures(supportedFeatures: Record<string, boolean>): string[] {
  return Object.entries(supportedFeatures)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name.charAt(0).toUpperCase() + name.slice(1))
}

/**
 * The features each cluster on a device type was composed with, by behavior id,
 * e.g. `{ fanControl: ['Auto'], thermostat: ['Cooling', 'Heating'] }`.
 *
 * Clusters with no features enabled are left out, so a plain device type gives
 * `undefined`. The names are the PascalCase ones `.with(...)` takes, sorted so
 * two device types can be compared by their JSON.
 */
export function declaredClusterFeatures(deviceType: unknown): Record<string, string[]> | undefined {
  const behaviors = (deviceType as { behaviors?: Record<string, BehaviorFeatures> } | undefined)?.behaviors
  if (!behaviors || typeof behaviors !== 'object') {
    return undefined
  }
  const result: Record<string, string[]> = {}
  for (const [id, behavior] of Object.entries(behaviors)) {
    const supportedFeatures = behavior?.cluster?.supportedFeatures ?? behavior?.features
    if (!supportedFeatures || typeof supportedFeatures !== 'object') {
      continue
    }
    const names = extractDeclaredFeatures(supportedFeatures).sort()
    if (names.length > 0) {
      result[id] = names
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * Compose a device type's clusters with the features recorded by
 * {@link declaredClusterFeatures}.
 *
 * This is how a cache restore gets back what the plugin chose. The cache can
 * only name a device type, so a restore starts from the base type in the
 * registry, and a plugin's own composition - a fan with Auto, an air
 * conditioner with AutoMode - was lost. The restored endpoint then no longer
 * matched the state cached with it, and matter.js refused to build it.
 *
 * A cluster the base type does not carry at all (the feature-gated ones, like
 * the thermostat on a plain Thermostat) is taken from the device type's own
 * requirements. A cluster that cannot be composed is left as it is: the
 * registration that follows compares the result against the plugin's and
 * starts afresh if they differ.
 */
export function applyDeclaredClusterFeatures(deviceType: EndpointType, clusterFeatures: Record<string, string[]> | undefined): EndpointType {
  if (!clusterFeatures) {
    return deviceType
  }
  let result = deviceType as EndpointType & {
    behaviors?: Record<string, { with?: (...features: string[]) => Behavior.Type }>
    requirements?: Record<string, { with?: (...features: string[]) => Behavior.Type }>
  }
  for (const [id, names] of Object.entries(clusterFeatures)) {
    const wanted = [...names].sort()
    const current = declaredClusterFeatures(result)?.[id] ?? []
    if (JSON.stringify(current) === JSON.stringify(wanted)) {
      continue
    }
    const serverName = `${id.charAt(0).toUpperCase()}${id.slice(1)}Server`
    const behavior = result.behaviors?.[id] ?? result.requirements?.[serverName]
    if (typeof behavior?.with !== 'function') {
      log.debug(`Cannot restore the ${id} features (${wanted.join(', ')}) on ${(deviceType as { name?: string }).name}: no behavior to compose`)
      continue
    }
    try {
      result = (result as any).with(behavior.with(...wanted))
    } catch (error) {
      log.debug(`Cannot restore the ${id} features (${wanted.join(', ')}) on ${(deviceType as { name?: string }).name}:`, error)
    }
  }
  return result
}
