/**
 * Accessory Manager
 *
 * Handles registering/unregistering accessories, building custom behaviors,
 * detecting cluster features, creating endpoint options, creating accessory parts,
 * and restoring cached state.
 */

import type { Behavior, EndpointType, ServerNode } from '@matter/main'

import type { MatterAccessoryCache } from '../accessoryCache.js'
import type { BehaviorRegistry, RegistryManager } from '../behaviors/index.js'
import type { MatterEvent } from '../ipc-types.js'
import type { MatterServerConfig } from '../sharedTypes.js'
import type {
  InternalMatterAccessory,
  InternalMatterAccessoryPart,
  MatterAccessory,
  MatterAccessoryEventEmitter,
  MatterAccessoryPart,
} from '../types.js'

import { EventEmitter } from 'node:events'

import { Endpoint } from '@matter/main'
import { BasicInformationServer, BridgedDeviceBasicInformationServer, DescriptorServer, FixedLabelServer, PowerSourceServer } from '@matter/main/behaviors'

import { IpcOutgoingEvent } from '../../ipcService.js'
import { Logger } from '../../logger.js'
import { sendToParent } from '../../util/ipc.js'
import { setRegistryManager } from '../behaviors/EndpointContext.js'
import { HomebridgeRvcCleanModeServer, HomebridgeServiceAreaServer } from '../behaviors/index.js'
import { lockStateForWrite } from '../behaviors/stateLock.js'
import { declaredClusterFeatures } from '../clusterFeatures.js'
import { truncateUtf8 } from '../configValidator.js'
import { deviceErrorFrom } from '../MatterError.js'
import {
  applyDeviceEnergyManagementFeatures,
  applyElectricalMeasurementClusters,
  applyElectricalMeasurementDefaults,
  applyEnergyEvseFeatures,
  applyFanAutoFeature,
  applyLevelControlLightingFloor,
  applyOptionalMeasurementClusters,
  applyRoomAirConditionerAutoMode,
  applySmokeCoAlarmFeatures,
  applyThermostatFeatures,
  applyWindowCoveringFeatures,
  detectBehaviorFeatures,
  detectElectricalMeasurementClusters,
  detectSmokeCoAlarmFeatures,
  detectThermostatFeatures,
  detectWindowCoveringFeatures,
  determineColorControlFeaturesFromClusters,
  determineColorControlFeaturesFromHandlers,
  extractDeclaredFeatures,
  isWindowCoveringComposed,
  markWindowCoveringComposed,
  validateAccessoryRequiredFields,
} from '../serverHelpers.js'
import {
  devices,
  deviceTypes,
  MatterDeviceError,
} from '../types.js'
import { stripVendorFromLabel } from '../utils.js'
import { CORE_CLUSTER_BEHAVIOR_MAP } from './BehaviorMap.js'

type BehaviorType = Behavior.Type

interface DetectedClusterFeatures {
  windowCoveringFeatures: string[]
  serviceAreaFeatures: string[] | null
  colorControlFeatures: string[] | null
  /**
   * LevelControl features to apply via `.with(...)`. `null` means the accessory
   * has no `levelControl` handler and we should leave the base class alone.
   * An empty array means "apply `.with()` with no features" — used to strip
   * the Lighting/OnOff features that `HomebridgeLevelControlServer` inherits
   * from matter.js's internal `LevelControlBase` when the device type itself
   * doesn't declare them (e.g. Pump).
   */
  levelControlFeatures: string[] | null
}

const log = Logger.withPrefix('Matter/Server')

export interface AccessoryManagerDeps {
  config: MatterServerConfig
  accessories: Map<string, InternalMatterAccessory>
  behaviorRegistry: BehaviorRegistry
  registryManager: RegistryManager
  accessoryCache: MatterAccessoryCache | null
  getServerNode: () => ServerNode | null
  getAggregator: () => Endpoint<typeof import('@matter/main/endpoints').AggregatorEndpoint> | null
  getIsRunning: () => boolean
  getMonitoringEnabled: () => boolean
  isCommissioned: () => boolean
}

/**
 * Device types whose composition requires every PowerSource to carry a tag
 * (Descriptor TagList): solar power and battery storage.
 */
const TAGGED_POWER_SOURCE_DEVICE_TYPES = new Set<number>([
  devices.SolarPowerDevice?.deviceType,
  devices.BatteryStorageDevice?.deviceType,
].filter((code): code is NonNullable<typeof code> => code !== undefined))

/**
 * A closure must carry exactly one descriptor tag from the Closure namespace,
 * saying what kind of closure it is. Without one matter.js refuses the
 * endpoint. A plugin that gives none gets the garage door tag.
 */
const CLOSURE_DEVICE_TYPE = devices.ClosureDevice?.deviceType
const CLOSURE_TAG_NAMESPACE = 0x44
const CLOSURE_TAG_GARAGE_DOOR = 0x5

/**
 * Clusters whose Homebridge behavior is declared with every optional feature
 * (so the feature-gated commands exist to override), and so must always be
 * narrowed to the features the device type chose.
 */
const FEATURE_RICH_BEHAVIOR_CLUSTERS = new Set([
  'deviceEnergyManagement',
  'energyEvse',
])

/**
 * Clusters the general feature carry-across in
 * {@link AccessoryManager.buildCustomBehaviors} leaves alone, because they work
 * out their features for themselves further up.
 *
 * OnOff is not one of them. Every light and outlet declares Lighting on it,
 * and a room air conditioner DeadFrontBehavior - both required by their device
 * types - and the swap used to drop them. matter.js implements the Lighting
 * commands (OffWithEffect, OnWithTimedOff and the rest) through on() and off(),
 * which the Homebridge behavior overrides, so they still reach the plugin.
 */
const FEATURE_AWARE_CLUSTERS = new Set([
  'colorControl',
  'windowCovering',
])

/**
 * The colour light device types require ColorControl's RemainingTime, which the
 * cluster itself leaves optional. matter.js 0.18 checks endpoints against their
 * device type and flagged every colour light without it, and a value is what
 * turns an optional attribute on.
 */
function withColorRemainingTime(endpointOptions: Record<string, any>): void {
  if (endpointOptions.colorControl && endpointOptions.colorControl.remainingTime === undefined) {
    endpointOptions.colorControl = { ...endpointOptions.colorControl, remainingTime: 0 }
  }
}

/**
 * A part endpoint built but not yet live, and what finishing it needs to know
 */
interface BuiltAccessoryPart {
  part: MatterAccessoryPart
  endpoint: Endpoint
  hasElectrical: boolean
}

/**
 * The attribute names a cluster on an endpoint knows: every attribute in the
 * cluster's Matter definition (whatever its feature), plus the extra state
 * matter.js keeps for the cluster. Undefined when the endpoint does not have
 * the cluster, or when it is not a Matter cluster (nothing to compare with).
 */
function knownAttributeNames(endpoint: Endpoint | undefined, clusterName: string): Set<string> | undefined {
  try {
    const type = endpoint?.behaviors.supported[clusterName] as (Behavior.Type & {
      schema?: { attributes?: Iterable<{ propertyName: string }> }
    }) | undefined
    const attributes = type?.schema?.attributes
    if (!type || !attributes) {
      return undefined
    }
    const names = new Set<string>(Object.keys(new type.State()))
    for (const attribute of attributes) {
      names.add(attribute.propertyName)
    }
    return names
  } catch {
    // never let a check that only warns stop a registration
    return undefined
  }
}

/**
 * Whether the endpoint is known not to have the cluster. False when that can
 * not be told (no endpoint yet, or one that does not list its behaviors).
 */
function lacksCluster(endpoint: Endpoint | undefined, clusterName: string): boolean {
  try {
    const supported = endpoint?.behaviors.supported
    return !!supported && !(clusterName in supported)
  } catch {
    // never let a check that only warns stop a registration
    return false
  }
}

export class AccessoryManager {
  /**
   * Register a single Matter accessory
   * The first two arguments are unused, but kept to keep consistency with the HAP accessory registration function signature.
   */
  async registerAccessory(
    _pluginIdentifier: string,
    _platformName: string,
    accessory: MatterAccessory,
    deps: AccessoryManagerDeps,
  ): Promise<void> {
    const serverNode = deps.getServerNode()
    const aggregator = deps.getAggregator()

    if (!serverNode || (!deps.config.externalAccessory && !aggregator)) {
      throw new MatterDeviceError('Matter server not started')
    }

    validateAccessoryRequiredFields(accessory)

    let preservedUniqueId: string | undefined

    if (deps.accessories.has(accessory.UUID)) {
      const existing = deps.accessories.get(accessory.UUID)
      // A cache-restored accessory keeps its endpoint (so the parts list never
      // churns); the plugin's registration attaches its handlers and metadata
      // in place. Structural changes fall through to a fresh registration.
      if (existing?._restoredFromCache) {
        const featureShape = (features?: MatterAccessory['features']) => JSON.stringify(
          Object.entries(features ?? {})
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([clusterName, clusterFeatures]) => ({
              clusterName,
              enabledFeatures: Object.entries(clusterFeatures ?? {})
                .filter(([, enabled]) => enabled === true)
                .map(([featureName]) => featureName)
                .sort(),
            }))
            .filter(({ enabledFeatures }) => enabledFeatures.length > 0),
        )
        const partShape = (list?: { id: string, features?: MatterAccessory['features'] }[]) => JSON.stringify(
          (list ?? [])
            .map(part => ({
              id: part.id,
              features: featureShape(part.features),
            }))
            .sort((left, right) => left.id.localeCompare(right.id)),
        )
        // ⚠️ The name is not enough. The cache stores a device type as
        // {name, code}, so a restore rebuilds the BASE type - anything the
        // plugin composed itself (via api.matter.deviceRequirements) is gone,
        // while the name still matches. Attaching in place then kept the
        // restored endpoint and silently reverted the plugin's own feature
        // choice to the detected one on every restart, which is exactly the
        // case deviceRequirements exists to serve. Compare what is composed.
        const behaviorKeys = (deviceType: unknown) =>
          Object.keys((deviceType as { behaviors?: Record<string, unknown> })?.behaviors ?? {}).sort().join(',')
        // The cluster features too: the restore puts the cached ones back, so
        // these only differ when the plugin has changed its mind since.
        const clusterFeatureShape = (deviceType: unknown) => JSON.stringify(
          Object.entries(declaredClusterFeatures(deviceType) ?? {}).sort(([left], [right]) => left.localeCompare(right)),
        )
        // Every cluster the plugin has handlers for must have had a handler
        // set on the restored accessory too (a real one or the restore's empty
        // stub), because the Homebridge behavior that calls the handlers is
        // only put on the endpoint for those clusters. A cache written before
        // the handler names were saved does not know a cluster with handlers
        // and no state: without this check its handlers were attached to an
        // endpoint that never calls them.
        const handlersCovered = (restored?: Record<string, unknown>, wanted?: Record<string, unknown>) =>
          Object.keys(wanted ?? {}).every(clusterName => restored?.[clusterName] !== undefined)
        const restoredParts = existing._parts ?? existing.parts ?? []
        const partHandlersCovered = (accessory.parts ?? []).every(part =>
          handlersCovered(restoredParts.find(restoredPart => restoredPart.id === part.id)?.handlers, part.handlers))
        const sameShape = (existing.deviceType as { name?: string })?.name === (accessory.deviceType as { name?: string })?.name
          && handlersCovered(existing.handlers, accessory.handlers)
          && partHandlersCovered
          && partShape(existing._parts ?? existing.parts) === partShape(accessory.parts)
          && featureShape(existing.features) === featureShape(accessory.features)
          && behaviorKeys(existing.deviceType) === behaviorKeys(accessory.deviceType)
          && clusterFeatureShape(existing.deviceType) === clusterFeatureShape(accessory.deviceType)
        if (sameShape) {
          log.debug(`Attached plugin registration to restored accessory ${accessory.displayName} (${accessory.UUID})`)
          // The endpoint keeps the state it was restored with. Keep the record
          // (what the UI lists and the cache saves) the same: the plugin's
          // registration declares its start-up defaults, and taking those
          // would save "off" for a lamp that is on.
          this.keepKnownState(accessory.clusters, existing.clusters)
          for (const part of accessory.parts ?? []) {
            this.keepKnownState(part.clusters, restoredParts.find(restoredPart => restoredPart.id === part.id)?.clusters)
          }
          await this.updateBridgedInformation(existing.endpoint, accessory, deps.config)
          deps.accessories.set(accessory.UUID, {
            ...existing,
            ...accessory,
            endpoint: existing.endpoint,
            _parts: existing._parts,
            registered: true,
            _restoredFromCache: false,
          })
          this.warnForUnknownAttributes(accessory, existing.endpoint, existing._parts)
          this.registerAccessoryHandlers(accessory, deps)
          for (const part of accessory.parts ?? []) {
            if (!part.handlers) {
              continue
            }
            const partEndpointId = `${accessory.UUID}-part-${part.id}`
            deps.behaviorRegistry.registerPartEndpoint(partEndpointId, accessory.UUID, part.id)
            for (const [clusterName, handlers] of Object.entries(part.handlers)) {
              for (const [commandName, handler] of Object.entries(handlers)) {
                deps.behaviorRegistry.registerHandler(partEndpointId, clusterName, commandName, handler)
              }
            }
          }
          if (deps.accessoryCache) {
            deps.accessoryCache.requestSave(deps.accessories)
          }
          return
        }
        // Keep the bridged device's identity across the re-registration. The
        // new endpoint would otherwise get a fresh random uniqueId, and a
        // controller may treat it as a new device (#4018).
        preservedUniqueId = this.readUniqueId(existing.endpoint)
        log.info(`Restored accessory ${accessory.displayName} changed structure - re-registering`)
        // Unregistering drops the cached entry. Hold on to it until the new
        // registration has worked, and carry the state and the plugin's
        // context it restored over to the new accessory.
        deps.accessoryCache?.retain(accessory.UUID)
        await this.unregisterAccessory(accessory.UUID, deps, { keepStorage: true })
        this.keepKnownState(accessory.clusters, existing.clusters)
        for (const part of accessory.parts ?? []) {
          this.keepKnownState(part.clusters, restoredParts.find(restoredPart => restoredPart.id === part.id)?.clusters)
        }
        if (existing.context) {
          accessory.context = existing.context
        }
      } else {
        throw new MatterDeviceError(
          `Matter accessory with UUID "${accessory.UUID}" is already registered.\n`
          + `Existing accessory: "${existing?.displayName}"\n`
          + `New accessory: "${accessory.displayName}"\n`
          + 'Each accessory must have a unique UUID. Use api.hap.uuid.generate() with a unique string.',
        )
      }
    }

    this.restoreCachedState(accessory, deps.accessoryCache)

    if (deps.accessories.size >= 1000) {
      throw new MatterDeviceError(
        `Cannot register Matter accessory "${accessory.displayName}": `
        + 'Maximum device limit reached (1000 devices).\n'
        + `Current registered devices: ${deps.accessories.size}`,
      )
    }

    try {
      const prepared = await this.prepareDeviceType(accessory)
      const { hasElectrical } = prepared
      let { deviceType } = prepared

      if (!deps.config.externalAccessory) {
        // Skip if device type already includes BridgedDeviceBasicInformation
        // (e.g., BridgedNodeEndpoint used as a composed device container)
        const hasBridgedInfo = (deviceType as { behaviors?: Record<string, unknown> }).behaviors?.bridgedDeviceBasicInformation !== undefined
        if (!hasBridgedInfo) {
          deviceType = (deviceType as any).with(BridgedDeviceBasicInformationServer)
          log.debug(`Added BridgedDeviceBasicInformationServer to ${accessory.displayName}`)
        }
      }

      const endpointOptions = this.createEndpointOptions(accessory, deps.config, preservedUniqueId)

      if (CLOSURE_DEVICE_TYPE !== undefined && Number(deviceType.deviceType) === CLOSURE_DEVICE_TYPE) {
        const tagList: { namespaceId?: number }[] = endpointOptions.descriptor?.tagList ?? []
        if (!tagList.some(tag => tag.namespaceId === CLOSURE_TAG_NAMESPACE)) {
          endpointOptions.descriptor = {
            ...endpointOptions.descriptor,
            tagList: [
              ...tagList,
              { mfgCode: null, namespaceId: CLOSURE_TAG_NAMESPACE, tag: CLOSURE_TAG_GARAGE_DOOR },
            ],
          }
        }
      }

      // Composed parents carry a FixedLabel marking the composition, matching
      // known-good bridges - Apple's controller needs it to bind child endpoints
      // to the composed accessory. Without it (plus the PowerSource below),
      // homed never finishes its per-accessory session setup: commands fail
      // silently ("No Response") from ~30s after pairing while reads keep working.
      if (accessory.parts && accessory.parts.length > 0) {
        if ((deviceType as { behaviors?: Record<string, unknown> }).behaviors?.fixedLabel === undefined) {
          deviceType = (deviceType as any).with(FixedLabelServer)
          endpointOptions.fixedLabel = {
            labelList: [
              { label: 'composed', value: 'true' },
            ],
          }
        }

        // Known-good bridges also expose a wired PowerSource on composed
        // parents; Apple's controller appears to expect it. Only synthesize it
        // when the accessory has not declared its own PowerSource — otherwise a
        // plugin-provided battery PowerSource (added below) would be overwritten.
        if (!accessory.clusters?.powerSource) {
          deviceType = (deviceType as any).with((PowerSourceServer as any).with('Wired'))
          endpointOptions.powerSource = {
            status: 1, // Active
            order: 0,
            description: 'AC Power',
            endpointList: [],
            wiredCurrentType: 0, // AC (PowerSource.WiredCurrentType.Ac)
          }
        }

        // Solar power and battery storage require every PowerSource in their
        // composition to carry a tag, and the parent has one too - the one above,
        // or the plugin's own
        if (TAGGED_POWER_SOURCE_DEVICE_TYPES.has(Number(deviceType.deviceType))) {
          deviceType = (deviceType as any).with(DescriptorServer.with('TagList'))
          endpointOptions.descriptor = {
            ...endpointOptions.descriptor,
            tagList: [
              {
                mfgCode: null,
                namespaceId: 7,
                tag: 0,
                label: truncateUtf8(endpointOptions.powerSource?.description ?? accessory.clusters?.powerSource?.description ?? 'Power', 64),
              },
            ],
          }
        }
      }

      // The parts are built first and handed to the parent, so matter.js
      // constructs the composed device in one go. A device type that requires
      // certain parts - solar power, battery storage - is checked when it is
      // constructed, and added one at a time afterwards they were not there yet.
      const builtParts = await this.buildAccessoryParts(accessory, deps)
      const endpoint = new Endpoint(deviceType, {
        ...endpointOptions,
        ...(builtParts.length > 0
          ? {
              parts: builtParts.map(built => built.endpoint),
            }
          : {}),
      })

      setRegistryManager(endpoint, deps.registryManager)

      if (deps.config.debugModeEnabled) {
        log.debug(`Created endpoint for ${accessory.displayName} with initial cluster states`)
      }

      if (deps.config.externalAccessory) {
        await serverNode.add(endpoint)
        log.debug(`Added ${accessory.displayName} as external accessory to ServerNode`)
      } else {
        await aggregator!.add(endpoint)
        if (deps.config.debugModeEnabled) {
          log.debug(`Added endpoint for ${accessory.displayName} to aggregator`)
        }
      }

      if (hasElectrical) {
        await this.advertiseUtilityDeviceType(endpoint, 'ElectricalSensor', accessory.displayName)
      }

      // ⚠️ A battery is only visible to a controller once the endpoint also
      // advertises the PowerSource device type. Composing the cluster is not
      // enough - exactly as with ElectricalSensor above - because a controller
      // that cannot see the type in the DeviceTypeList has no reason to read
      // the cluster. Without this, Apple Home showed no battery anywhere while
      // every attribute was present and correct (homebridge-sharkiq#88).
      //
      // Deliberately only for a power source the plugin declared. The wired one
      // synthesized for composed parents above is left alone: it exists to
      // satisfy Apple's controller in a case that already works, and this area
      // fails silently and badly when disturbed.
      if (accessory.clusters?.powerSource) {
        await this.advertiseUtilityDeviceType(endpoint, 'PowerSource', accessory.displayName)
      }

      this.registerAccessoryHandlers(accessory, deps)
      const internalParts = await this.finishAccessoryParts(accessory, builtParts, deps)
      // A restore registers what the cache holds, not what a plugin wrote now
      if (!(accessory as InternalMatterAccessory)._restoredFromCache) {
        this.warnForUnknownAttributes(accessory, endpoint, internalParts)
      }

      await this.finalizeAccessoryRegistration(accessory, endpoint, internalParts, deps)
      deps.accessoryCache?.release(accessory.UUID)
    } catch (error) {
      log.error(`Failed to register Matter accessory ${accessory.displayName}:`, error)
      this.forgetFailedRegistration(accessory.UUID, deps)
      throw deviceErrorFrom('Failed to register accessory', error)
    }
  }

  /**
   * Warn for each attribute a plugin declared that its cluster does not have,
   * and for each cluster the endpoint does not have at all. matter.js leaves
   * such a name out without a word when the endpoint is built, and the
   * plugin's state then seems to be lost. A typo is the usual cause. The
   * registration still goes ahead.
   *
   * Only a name that is not in the cluster at all is reported. An attribute
   * that belongs to a feature the endpoint does not have is a real attribute,
   * and matter.js reports that case itself.
   */
  private warnForUnknownAttributes(
    accessory: MatterAccessory,
    endpoint: Endpoint | undefined,
    parts: InternalMatterAccessoryPart[] | undefined,
  ): void {
    const check = (label: string, clusters: Record<string, unknown> | undefined, target: Endpoint | undefined) => {
      for (const [clusterName, declared] of Object.entries(clusters ?? {})) {
        if (!declared || typeof declared !== 'object') {
          continue
        }
        // A cluster the endpoint does not have: its device type does not carry
        // it. matter.js drops the whole block without a word, and every later
        // update for it fails with "Behavior ... is not present".
        if (lacksCluster(target, clusterName)) {
          log.warn(`Matter accessory "${label}": the device type has no ${clusterName} cluster, so its state was left out. `
            + 'Use a device type that carries this cluster.')
          continue
        }
        const known = knownAttributeNames(target, clusterName)
        if (!known) {
          continue
        }
        const unknown = Object.keys(declared).filter(name => !known.has(name))
        if (unknown.length > 0) {
          log.warn(`Matter accessory "${label}": the ${clusterName} cluster has no attribute named ${unknown.map(name => `"${name}"`).join(', ')}. `
            + 'It was left out. Please check the spelling.')
        }
      }
    }

    check(accessory.displayName, accessory.clusters, endpoint)
    for (const part of accessory.parts ?? []) {
      const partEndpoint = parts?.find(internal => internal.id === part.id)?.endpoint
      check(`${accessory.displayName}" part "${part.displayName || part.id}`, part.clusters, partEndpoint)
    }
  }

  /**
   * Drop what a registration put in the handler registries before it failed.
   * They are filled while the endpoint is being built, so a failure left the
   * plugin's handlers (and the part mappings) behind for good: nothing else
   * removes them for an accessory that never made it into the list.
   */
  private forgetFailedRegistration(uuid: string, deps: AccessoryManagerDeps): void {
    if (deps.accessories.has(uuid)) {
      return
    }
    for (const endpointId of deps.behaviorRegistry.removeEndpoint(uuid)) {
      deps.registryManager.unregisterEndpoint(endpointId)
    }
  }

  /**
   * Unregister a Matter accessory.
   *
   * By default what matter.js stored for the accessory's endpoint (its
   * uniqueId, its endpoint number, any stored attribute) is erased too: the
   * accessory is gone for good, and the files otherwise stayed in the node's
   * storage for ever, to come back to life if the UUID was used again. Only
   * the accessory's own data goes; the bridge's pairings are not touched.
   *
   * `keepStorage` is for an accessory that is taken off the bridge only to be
   * registered again with a new structure: there the stored uniqueId and
   * endpoint number are wanted, so a controller sees the same device.
   */
  async unregisterAccessory(uuid: string, deps: AccessoryManagerDeps, options: { keepStorage?: boolean } = {}): Promise<void> {
    const accessory = deps.accessories.get(uuid)
    if (!accessory) {
      log.debug(`Accessory ${uuid} not found or not registered`)

      if (deps.accessoryCache) {
        // An entry held for an accessory that could not be restored goes too
        const wasHeld = deps.accessoryCache.release(uuid)
        if (wasHeld || deps.accessoryCache.getCached(uuid)) {
          log.debug(`Removing ${uuid} from cache`)
          deps.accessoryCache.removeCached(uuid)
          deps.accessoryCache.requestSave(deps.accessories)
        }
      }
      return
    }

    try {
      if (accessory.endpoint && deps.getAggregator()) {
        if (options.keepStorage) {
          await accessory.endpoint.close()
        } else {
          await this.deleteEndpoint(accessory.endpoint, accessory.displayName)
        }
        log.debug(`Removed endpoint for ${accessory.displayName}`)
      }

      deps.accessories.delete(uuid)
      // Drop the handler table for this accessory + its parts so we don't
      // retain plugin closures past the accessory's lifetime. removeEndpoint
      // returns the accessory's own endpoint id plus any part endpoint ids it
      // swept, so we can drop the matching endpoint→registry mappings too —
      // RegistryManager has no parent-aware sweep, and without this its map
      // would leak an entry per accessory/part across register/unregister cycles.
      const removedEndpoints = deps.behaviorRegistry.removeEndpoint(uuid)
      for (const endpointId of removedEndpoints) {
        deps.registryManager.unregisterEndpoint(endpointId)
      }
      log.info(`Unregistered Matter accessory: ${accessory.displayName} (${uuid})`)

      await this.notifyPartsListChanged(deps)

      if (deps.accessoryCache) {
        deps.accessoryCache.removeCached(uuid)
        deps.accessoryCache.requestSave(deps.accessories)
      }

      if (deps.getMonitoringEnabled()) {
        const event: MatterEvent = {
          type: 'accessoryRemoved',
          data: { uuid },
        }
        sendToParent({
          id: IpcOutgoingEvent.MATTER_EVENT,
          data: event,
        })
      }
    } catch (error) {
      log.error(`Failed to unregister Matter accessory ${uuid}:`, error)
      throw deviceErrorFrom('Failed to unregister accessory', error)
    }
  }

  /**
   * Take an endpoint off the bridge and erase what matter.js stored for it.
   * An endpoint that can not be erased (one that never finished being built,
   * say) is closed as before: it must still come off the bridge.
   */
  private async deleteEndpoint(endpoint: Endpoint, displayName: string): Promise<void> {
    try {
      await endpoint.delete()
    } catch (error) {
      log.debug(`Could not erase the stored Matter data of ${displayName}; closing its endpoint instead:`, error)
      await endpoint.close()
    }
  }

  /**
   * Restore cached state for an accessory
   */
  /**
   * Put the values already known for an accessory over the ones its plugin
   * declares, for the clusters and attributes the plugin still declares.
   */
  private keepKnownState(declared: MatterAccessory['clusters'], known: MatterAccessory['clusters']): void {
    if (!declared || !known) {
      return
    }
    for (const [clusterName, declaredAttributes] of Object.entries(declared)) {
      const knownAttributes = known[clusterName] as Record<string, unknown> | undefined
      if (!knownAttributes || !declaredAttributes) {
        continue
      }
      for (const attributeName of Object.keys(declaredAttributes)) {
        if (attributeName in knownAttributes) {
          (declaredAttributes as Record<string, unknown>)[attributeName] = knownAttributes[attributeName]
        }
      }
    }
  }

  /**
   * Bring the name, maker, model, serial number and firmware version on a
   * bridged endpoint in line with what its plugin now registers. A restored
   * endpoint is built from the cache, so without this a renamed accessory or
   * a new firmware version only showed after one more restart.
   */
  async updateBridgedInformation(endpoint: Endpoint | undefined, accessory: MatterAccessory, config: MatterServerConfig): Promise<void> {
    if (!endpoint || config.externalAccessory) {
      return
    }
    const current = (endpoint.state as Record<string, Record<string, unknown> | undefined> | undefined)?.bridgedDeviceBasicInformation
    if (!current) {
      return
    }
    const wanted: Record<string, unknown> = this.createEndpointOptions(accessory, config).bridgedDeviceBasicInformation ?? {}
    const changed = Object.fromEntries(
      Object.entries(wanted).filter(([name, value]) => name !== 'reachable' && value !== undefined && value !== current[name]),
    )
    if (Object.keys(changed).length === 0) {
      return
    }
    try {
      await endpoint.setStateOf('bridgedDeviceBasicInformation', changed)
      log.debug(`Updated the bridged device information of ${accessory.displayName}:`, changed)
    } catch (error) {
      log.warn(`Could not update the bridged device information of ${accessory.displayName}:`, error)
    }
  }

  private restoreCachedState(accessory: MatterAccessory, accessoryCache: MatterAccessoryCache | null): void {
    if (accessoryCache && accessoryCache.hasCached(accessory.UUID)) {
      const cached = accessoryCache.getCached(accessory.UUID)
      if (cached?.clusters && accessory.clusters) {
        for (const [clusterName, cachedAttrs] of Object.entries(cached.clusters)) {
          if (!accessory.clusters[clusterName]) {
            // Skip clusters that the accessory no longer declares
            continue
          }

          // Only restore attributes that the accessory's current definition includes
          const currentAttrs = accessory.clusters[clusterName] as Record<string, unknown>
          const filteredCached: Record<string, unknown> = {}
          for (const key of Object.keys(cachedAttrs as Record<string, unknown>)) {
            if (key in currentAttrs) {
              filteredCached[key] = (cachedAttrs as Record<string, unknown>)[key]
            }
          }

          accessory.clusters[clusterName] = {
            ...currentAttrs,
            ...filteredCached,
          }
        }

        if (cached.context) {
          accessory.context = cached.context
        }

        log.debug(`Restored cached state for Matter accessory: ${accessory.displayName}`)
      }
    }
  }

  /**
   * Work out the endpoint's final device type: compose the feature-gated
   * clusters it needs, fix up any state that would fail conformance, and
   * attach the Homebridge behaviors that route commands to plugin handlers.
   *
   * ⚠️ Shared by the parent accessory AND by every part. Child endpoints used
   * to run a cut-down version of this that only looked up behaviors by name,
   * so a composed part quietly lost anything decided here — its battery was
   * never composed, a thermostat part had no thermostat cluster at all
   * (matter.js gates it behind features, so the base device type carries
   * none), and a dimmable part declaring the once-documented `minLevel: 0`
   * still failed to register. Anything added here must therefore stay free of
   * parent-only assumptions; the caller handles what genuinely differs
   * (bridged info, the composed-parent labels, the child tag list).
   */
  private async prepareDeviceType(
    accessory: MatterAccessory,
  ): Promise<{ deviceType: EndpointType, hasElectrical: boolean }> {
    let deviceType = accessory.deviceType
    // WindowCovering is feature-gated too, and detection reads the declared
    // lift/tilt attributes. A plugin that composed the cluster itself has
    // already said what the device does, so leave its choice alone - matching
    // SmokeCoAlarm and Thermostat below.
    //
    // ⚠️ The skip flag still has to be set. It is what stops the behavior loop
    // adding the custom WindowCovering server *without* features on top; only
    // skipping the call here would clobber the plugin's composition further
    // down instead of here.
    const hasWindowCovering = (deviceType as { behaviors?: Record<string, unknown> }).behaviors?.windowCovering !== undefined
    const windowCoveringFeatures = detectWindowCoveringFeatures(accessory)
    if (hasWindowCovering) {
      if (windowCoveringFeatures.length > 0) {
        log.debug(`${accessory.displayName} composed its own WindowCovering cluster - keeping its features`)
      }
      markWindowCoveringComposed(accessory)
    } else if (windowCoveringFeatures.length > 0) {
      deviceType = applyWindowCoveringFeatures(deviceType, accessory, windowCoveringFeatures)
    }

    // SmokeCoAlarm is feature-gated in matter.js, so the base SmokeCoAlarmDevice
    // carries no SmokeCoAlarm cluster. Add it with features detected from the
    // accessory's declared attributes — unless the plugin already composed a
    // device type that includes it.
    const hasSmokeCoAlarm = (deviceType as { behaviors?: Record<string, unknown> }).behaviors?.smokeCoAlarm !== undefined
    if (deviceType.deviceType === devices.SmokeCoAlarmDevice.deviceType && !hasSmokeCoAlarm) {
      deviceType = applySmokeCoAlarmFeatures(deviceType, accessory, detectSmokeCoAlarmFeatures(accessory))
    }

    // Thermostat is feature-gated in the same way, so the base ThermostatDevice
    // carries no thermostat cluster. Add it with features detected from the
    // declared setpoints, so a heating-only thermostat is not forced to claim
    // cooling - unless the plugin already composed the cluster itself.
    const hasThermostat = (deviceType as { behaviors?: Record<string, unknown> }).behaviors?.thermostat !== undefined
    if (deviceType.deviceType === devices.ThermostatDevice?.deviceType && !hasThermostat) {
      deviceType = applyThermostatFeatures(deviceType, accessory, detectThermostatFeatures(accessory))
    }

    // The stock Room Air Conditioner carries Heating and Cooling only. Add
    // AutoMode when the accessory asks for it, see applyRoomAirConditionerAutoMode
    deviceType = applyRoomAirConditionerAutoMode(deviceType, deviceTypes.RoomAirConditioner, accessory)

    // FanControl's Auto mode is feature-gated too. Turn it on for a fan that
    // declares a sequence offering Auto, keeping any features already chosen.
    deviceType = applyFanAutoFeature(deviceType, accessory)

    // The energy clusters' features come from the declared state too, and their
    // commands from Homebridge's default servers - matter.js implements none
    deviceType = applyDeviceEnergyManagementFeatures(deviceType, accessory)
    deviceType = applyEnergyEvseFeatures(deviceType, accessory)

    // Electrical measurement clusters (power/energy metering) are feature-gated
    // in matter.js and not part of any base device type. Detect them from the
    // accessory's declared cluster state so any device type - outlets included -
    // can report power/energy (surfaced by e.g. the iOS 27+ Home app energy view).
    const electricalDetection = detectElectricalMeasurementClusters(accessory)
    const hasElectrical = electricalDetection.hasPowerMeasurement || electricalDetection.energyFeatures.length > 0
    if (hasElectrical) {
      applyElectricalMeasurementDefaults(accessory, electricalDetection)
      deviceType = applyElectricalMeasurementClusters(deviceType, accessory, electricalDetection)
    } else if (deviceType.deviceType === devices.ElectricalSensorEndpoint?.deviceType) {
      log.warn(
        `${accessory.displayName} uses the ElectricalSensor device type but declares no `
        + 'electricalPowerMeasurement or electricalEnergyMeasurement cluster state - '
        + 'the endpoint will expose no measurement clusters.',
      )
    }

    // A device type carries only its mandatory clusters, so the optional
    // readings a plugin declares - an air quality sensor's PM2.5, a
    // thermostat's humidity - need composing too, see applyOptionalMeasurementClusters
    deviceType = applyOptionalMeasurementClusters(deviceType, accessory)

    const features = this.detectClusterFeatures(accessory, deviceType)

    // Now that we know whether LevelControl keeps its Lighting feature, make
    // sure the declared levels are legal for it.
    applyLevelControlLightingFloor(accessory, features.levelControlFeatures)

    const customBehaviors = await this.buildCustomBehaviors(accessory, deviceType, features)
    if (customBehaviors.length > 0) {
      deviceType = (deviceType as any).with(...customBehaviors)
      log.debug(`Applied ${customBehaviors.length} custom behavior(s) to the device type of ${accessory.displayName}`)
    }

    return { deviceType, hasElectrical }
  }

  /**
   * Present a part as an accessory so it can go through {@link prepareDeviceType}.
   *
   * Parts carry the same `deviceType`/`clusters`/`handlers` shape as their
   * parent, just without the bridge-level identity fields — which nothing in
   * the preparation pipeline reads. `clusters` is passed by reference on
   * purpose: the pipeline edits it (electrical defaults, the battery charge
   * state seed, the LevelControl floor) and those edits have to land on the
   * part object that is about to be registered.
   */
  private partAsAccessory(part: MatterAccessoryPart, partEndpointId: string): MatterAccessory {
    return {
      UUID: partEndpointId,
      displayName: part.displayName || part.id,
      deviceType: part.deviceType,
      features: part.features,
      serialNumber: '',
      manufacturer: '',
      model: '',
      clusters: part.clusters,
      handlers: part.handlers,
    } as MatterAccessory
  }

  /**
   * Detect cluster features for an accessory
   */
  private detectClusterFeatures(
    accessory: MatterAccessory,
    deviceType: EndpointType,
  ): DetectedClusterFeatures {
    const windowCoveringFeatures = detectWindowCoveringFeatures(accessory)

    let serviceAreaFeatures: string[] | null = null
    if (accessory.clusters?.serviceArea) {
      const features: string[] = []
      if (accessory.clusters.serviceArea.supportedMaps) {
        features.push('Maps')
      }
      if (accessory.clusters.serviceArea.progress !== undefined) {
        features.push('ProgressReporting')
      }
      if (features.length > 0) {
        serviceAreaFeatures = features
        log.debug(`ServiceArea features will be enabled for ${accessory.displayName}: ${features.join(', ')}`)
      }
    }

    let colorControlFeatures: string[] | null = null
    if (accessory.handlers?.colorControl) {
      // Only asked here whether the device type has the cluster at all: the
      // features themselves are worked out below.
      colorControlFeatures = detectBehaviorFeatures(deviceType, 'colorControl', extractDeclaredFeatures)
      if (colorControlFeatures) {
        // Handlers first: they are the authority on what the plugin can actually do.
        // On a cache restore they are empty stubs though (functions cannot be cached),
        // so fall back to the cluster's own attributes - otherwise ColorControl is
        // built with no features and the persisted colorTemperatureMireds/currentHue
        // fail Matter's conformance check, taking the whole accessory down with them.
        const fromHandlers = determineColorControlFeaturesFromHandlers(accessory.handlers.colorControl)
        colorControlFeatures = fromHandlers.length > 0
          ? fromHandlers
          : determineColorControlFeaturesFromClusters(accessory.clusters)
      }
    }

    // LevelControl: the features the device type declares (a dimmable light's
    // Lighting and OnOff). They are carried onto the Homebridge behavior by
    // the general path in buildCustomBehaviors; they are read here as well
    // because applyLevelControlLightingFloor needs to know about Lighting.
    const levelControlFeatures = accessory.handlers?.levelControl
      ? detectBehaviorFeatures(deviceType, 'levelControl', extractDeclaredFeatures)
      : null

    return {
      windowCoveringFeatures,
      serviceAreaFeatures,
      colorControlFeatures,
      levelControlFeatures,
    }
  }

  /**
   * Build custom behaviors for an accessory based on handlers
   */
  private async buildCustomBehaviors(
    accessory: MatterAccessory,
    deviceType: EndpointType,
    features: DetectedClusterFeatures,
  ): Promise<BehaviorType[]> {
    const customBehaviors: BehaviorType[] = []

    // PowerSource (battery) is a general utility cluster, not device-type
    // specific — like the ElectricalPowerMeasurement/ElectricalEnergyMeasurement
    // clusters, it should be composed for any device type. Compose it up front,
    // before the no-handlers early return below: battery-powered sensors
    // (contact/leak/occupancy, etc.) are read-only and declare no handlers at
    // all, so gating this on handlers would silently drop their battery.
    if (accessory.clusters?.powerSource) {
      // Any battery attribute at all marks this as a battery source. Reading
      // only the live values (batPercentRemaining/batChargeLevel) reintroduced
      // #3982 one level up: a plugin that declares the static battery facts it
      // knows at startup - batReplaceability, batPresent, batQuantity - but has
      // no reading yet from a sleeping device would compose a PowerSource with
      // no Battery feature at all, and then its first real reading would be
      // rejected for the life of the process. Static facts are the declaration
      // of intent, so they count. Nothing here invents a reading. A source that
      // declares no battery attribute at all is a wired one (mains, a solar
      // inverter, the grid side of a home battery) and gets the Wired feature -
      // matter.js rejects a PowerSource with neither feature, which took the
      // whole accessory down with it.
      const powerSource = accessory.clusters.powerSource as Record<string, unknown>
      const hasBattery = Object.keys(powerSource).some(
        key => /^(?:bat|activeBat)/.test(key) && powerSource[key] !== undefined,
      )
      let powerSourceBehavior: BehaviorType = PowerSourceServer
      if (hasBattery) {
        // The feature set is decided once, here, but a device can start
        // reporting batChargeState later (e.g. a vacuum asleep on its dock at
        // startup). If the feature were gated on the attribute being present
        // now, that first report would be rejected by conformance, and the
        // rollback discards every attribute in the same update - the battery
        // freezes at its startup value until a restart happens to catch the
        // device awake (#3982). So every battery carries Rechargeable, seeded
        // with Unknown: the endpoint options spread this same object, so the
        // seed is also the registration-time value the feature's conformance
        // requires.
        //
        // The trade is deliberate: a non-rechargeable battery ends up
        // advertising Rechargeable with a charge state of Unknown, which is not
        // strictly true. Determinism is worth more here than that precision -
        // the alternative decides a device's feature set on whether it happened
        // to be awake when homebridge last restarted, and fails invisibly.
        if (accessory.clusters.powerSource.batChargeState === undefined) {
          accessory.clusters.powerSource.batChargeState = 0 // PowerSource.BatChargeState.Unknown
        }
        // Rechargeable also makes batFunctionalWhileCharging mandatory. matter.js
        // happens to default it to false, so registration succeeds without it -
        // but seeding it here means the feature and BOTH of its required
        // attributes are introduced together, rather than resting on a default
        // in someone else's package that could change.
        if (accessory.clusters.powerSource.batFunctionalWhileCharging === undefined) {
          accessory.clusters.powerSource.batFunctionalWhileCharging = false
        }
        powerSourceBehavior = (PowerSourceServer as any).with('Battery', 'Rechargeable')
        log.debug('Adding PowerSource server with battery and rechargeable features')
      } else {
        powerSourceBehavior = (PowerSourceServer as any).with('Wired')
        log.debug('Adding PowerSource server with the wired feature')
      }
      customBehaviors.push(powerSourceBehavior)
    }

    if (accessory.handlers) {
      log.debug(`[${accessory.displayName}] Has handlers: ${Object.keys(accessory.handlers).join(', ')}`)
    }

    // Handle RoboticVacuumCleaner optional clusters. A vacuum with state and no
    // handlers gets them too (the base servers), so this comes before the
    // "no handlers" return: after it, those clusters and their state were dropped.
    if (deviceType.deviceType === devices.RoboticVacuumCleanerDevice.deviceType) {
      const { RvcCleanModeServer, ServiceAreaServer } = devices.RoboticVacuumCleanerRequirements

      if (accessory.clusters?.rvcCleanMode) {
        let behaviorClass: BehaviorType = accessory.handlers?.rvcCleanMode
          ? HomebridgeRvcCleanModeServer
          : RvcCleanModeServer

        if (accessory.features?.rvcCleanMode?.directModeChange === true) {
          if (!accessory.handlers?.rvcCleanMode?.changeToMode) {
            log.warn(
              `[${accessory.displayName}] rvcCleanMode.directModeChange is declared but there is no changeToMode handler - controllers will offer mid-run mode changes that nothing implements`,
            )
          }
          behaviorClass = (behaviorClass as any).with('DirectModeChange')
          log.debug('RvcCleanMode DirectModeChange feature enabled')
        }

        customBehaviors.push(behaviorClass)
        log.debug(`Adding ${accessory.handlers?.rvcCleanMode ? 'custom' : 'base'} RvcCleanMode server`)
      }

      if (accessory.clusters?.serviceArea) {
        if (accessory.handlers?.serviceArea) {
          let behaviorClass: BehaviorType = HomebridgeServiceAreaServer
          if (features.serviceAreaFeatures && features.serviceAreaFeatures.length > 0) {
            behaviorClass = (behaviorClass as any).with(...features.serviceAreaFeatures)
            log.debug(`ServiceArea custom behavior will have features: ${features.serviceAreaFeatures.join(', ')}`)
          }
          customBehaviors.push(behaviorClass)
          log.debug('Adding custom ServiceArea behavior with handlers')
        } else {
          let behaviorClass: BehaviorType = ServiceAreaServer
          if (features.serviceAreaFeatures && features.serviceAreaFeatures.length > 0) {
            behaviorClass = (behaviorClass as any).with(...features.serviceAreaFeatures)
            log.debug(`ServiceArea base server will have features: ${features.serviceAreaFeatures.join(', ')}`)
          }
          customBehaviors.push(behaviorClass)
          log.debug('Adding base ServiceArea server')
        }
      }
    }

    if (!accessory.handlers) {
      return customBehaviors
    }

    for (const clusterName of Object.keys(accessory.handlers)) {
      if (clusterName === 'windowCovering' && isWindowCoveringComposed(accessory)) {
        log.debug('Skipping custom WindowCovering behavior (using base server with features instead)')
        continue
      }

      if (clusterName === 'rvcCleanMode' || clusterName === 'serviceArea' || clusterName === 'powerSource') {
        continue
      }

      let behaviorClass = CORE_CLUSTER_BEHAVIOR_MAP[clusterName]

      if (clusterName === 'colorControl' && behaviorClass && features.colorControlFeatures && features.colorControlFeatures.length > 0) {
        behaviorClass = (behaviorClass as any).with(...features.colorControlFeatures)
        log.debug(`ColorControl custom behavior will preserve features: ${features.colorControlFeatures.join(', ')}`)
      }

      if (clusterName === 'windowCovering') {
        log.debug(`WindowCovering handler found: behaviorClass=${!!behaviorClass}, windowCoveringFeatures=${features.windowCoveringFeatures}, length=${features.windowCoveringFeatures?.length}`)
        if (behaviorClass && features.windowCoveringFeatures && features.windowCoveringFeatures.length > 0) {
          behaviorClass = (behaviorClass as any).with(...features.windowCoveringFeatures)
          log.debug(`WindowCovering custom behavior will have features: ${features.windowCoveringFeatures.join(', ')}`)
        } else {
          log.debug(`Skipping WindowCovering feature application: behaviorClass=${!!behaviorClass}, features=${features.windowCoveringFeatures}`)
        }
      }

      // Every other cluster: carry across whatever features the device type
      // already chose. Replacing the base behavior with the handler-calling one
      // otherwise resets the cluster to its featureless form - a fan composed
      // with Auto lost it, and so did an air quality sensor composed for the
      // levels beyond Good and Poor. A thermostat, a closure (which composes
      // Positioning) and a media player go this way too: the device type is
      // where their features were chosen. On a cache restore every cached cluster
      // gets an empty handler stub, so it happened to every such accessory on
      // every restart, plugin handlers or not.
      if (behaviorClass && !FEATURE_AWARE_CLUSTERS.has(clusterName)) {
        const declared = detectBehaviorFeatures(deviceType, clusterName, extractDeclaredFeatures)
        if (declared && declared.length > 0) {
          behaviorClass = (behaviorClass as any).with(...declared)
          log.debug(`${clusterName} custom behavior will preserve features: ${declared.join(', ')}`)
        } else if (FEATURE_RICH_BEHAVIOR_CLUSTERS.has(clusterName)) {
          // These handler-calling behaviors carry every feature so their
          // commands exist to override; one the device did not choose must not
          // reach the endpoint
          behaviorClass = (behaviorClass as any).with()
        }
      }

      if (behaviorClass) {
        customBehaviors.push(behaviorClass)
        log.debug(`Will use ${behaviorClass.name} for ${accessory.displayName}`)
      } else if (Object.keys(accessory.handlers?.[clusterName] ?? {}).length === 0) {
        // No handlers, so there is nothing for a custom behavior to route and nothing
        // to warn about. This is the normal shape for a read-only cluster the plugin
        // only pushes state into, and it is every cluster on a cache restore: the
        // restore synthesizes an empty stub per cached cluster, so warning here put a
        // line in the log for clusters the plugin never intended to handle.
        log.debug(`No handlers supplied for cluster '${clusterName}', no custom behavior needed`)
      } else {
        log.warn(`No custom behavior class available for cluster '${clusterName}' - handlers will be registered but may not be called`)
      }
    }

    return customBehaviors
  }

  /**
   * Read the BridgedDeviceBasicInformation uniqueId of an endpoint, if it has one
   */
  private readUniqueId(endpoint: unknown): string | undefined {
    try {
      const uniqueId = (endpoint as { state?: { bridgedDeviceBasicInformation?: { uniqueId?: unknown } } } | undefined)
        ?.state
        ?.bridgedDeviceBasicInformation
        ?.uniqueId
      return typeof uniqueId === 'string' && uniqueId.length > 0
        ? uniqueId
        : undefined
    } catch {
      return undefined
    }
  }

  /**
   * Create endpoint options for an accessory
   */
  private createEndpointOptions(accessory: MatterAccessory, config: MatterServerConfig, uniqueId?: string): any {
    const endpointOptions: any = {
      id: accessory.UUID,
      ...accessory.clusters,
    }
    withColorRemainingTime(endpointOptions)

    if (!config.externalAccessory) {
      // matter.js rejects an over-long string with its own attribute name, so a
      // plugin's 33-character model failed registration as a "productName"
      // constraint error nobody could trace back to `model` (#4016). Shorten it
      // instead, as the bridge's own names already are, and say which property
      const fit = (value: string | undefined, maxLength: number, property: string) => {
        if (typeof value !== 'string') {
          return value
        }
        // The limit is in bytes: a name of 20 "ü" is 40 bytes
        const shortened = truncateUtf8(value, maxLength)
        if (shortened !== value) {
          log.warn(`Matter accessory "${accessory.displayName}": ${property} is longer than the ${maxLength} bytes Matter allows, `
            + `so it has been shortened to "${shortened}"`)
        }
        return shortened
      }
      endpointOptions.bridgedDeviceBasicInformation = {
        vendorName: fit(accessory.manufacturer, 32, 'manufacturer'),
        nodeLabel: fit(accessory.displayName, 32, 'displayName'),
        productName: fit(accessory.model, 32, 'model'),
        // productLabel SHALL NOT include the vendor name per the Matter spec.
        // Fall back to model or "Device" when stripping consumes the whole name.
        productLabel: fit(stripVendorFromLabel(accessory.displayName, accessory.manufacturer)
          || accessory.model || 'Device', 64, 'displayName (as the product label)'),
        serialNumber: fit(accessory.serialNumber, 32, 'serialNumber'),
        reachable: true,
        ...(uniqueId
          ? { uniqueId }
          : {}),
      }
      // Surface the device's firmware version to controllers (shown in the
      // accessory details of e.g. Apple Home). The numeric companion is
      // derived from a leading semver triplet when the string has one and
      // the parts fit the 16/8/8-bit encoding - otherwise only the string
      // is set (both attributes are independently optional per spec, and a
      // failed uint32 validation would block the accessory registering).
      // The spec caps SoftwareVersionString at 64 characters.
      if (typeof accessory.firmwareRevision === 'string' && accessory.firmwareRevision.length > 0) {
        endpointOptions.bridgedDeviceBasicInformation.softwareVersionString = truncateUtf8(accessory.firmwareRevision, 64)
        const semver = accessory.firmwareRevision.match(/^(\d+)\.(\d+)\.(\d+)/)
        if (semver) {
          const [major, minor, patch] = [
            Number(semver[1]),
            Number(semver[2]),
            Number(semver[3]),
          ]
          if (major <= 0xFFFF && minor <= 0xFF && patch <= 0xFF) {
            // >>> 0 keeps the value unsigned - a signed << would go negative
            // for majors >= 0x8000 and fail matter.js's uint32 validation.
            endpointOptions.bridgedDeviceBasicInformation.softwareVersion = ((major << 16) | (minor << 8) | patch) >>> 0
          }
        }
      }
    }

    return endpointOptions
  }

  /**
   * Register command handlers for an accessory
   */
  private registerAccessoryHandlers(accessory: MatterAccessory, deps: AccessoryManagerDeps): void {
    // Every endpoint gets its registry, handlers or not. Some clusters always
    // use Homebridge's own server (a window covering, for one), and it looks
    // the registry up on each command: without one, a covering that has state
    // and no handlers answered every command with a raw "No registry found".
    deps.registryManager.registerEndpoint(accessory.UUID, deps.behaviorRegistry)

    if (!accessory.handlers) {
      return
    }

    log.debug(`Setting up handlers for accessory ${accessory.UUID}`)

    for (const [clusterName, handlers] of Object.entries(accessory.handlers)) {
      log.debug(`  Processing cluster: ${clusterName}`)

      for (const [commandName, handler] of Object.entries(handlers)) {
        deps.behaviorRegistry.registerHandler(accessory.UUID, clusterName, commandName, handler)
      }
    }
  }

  /**
   * Build the child endpoints (parts) for an accessory, ready to hand to the
   * parent endpoint before it is added. {@link finishAccessoryParts} does the
   * rest once they are live.
   *
   * Parts are sub-endpoints of the parent endpoint, creating a composed device
   * per the Matter spec. Children are plain device types with no
   * BridgedDeviceBasicInformation — only the parent has that.
   * See: https://github.com/matter-js/matter.js/blob/main/docs/MIGRATION_GUIDE_08.md
   */
  private async buildAccessoryParts(
    accessory: MatterAccessory,
    deps: AccessoryManagerDeps,
  ): Promise<BuiltAccessoryPart[]> {
    const builtParts: BuiltAccessoryPart[] = []

    if (!accessory.parts || accessory.parts.length === 0) {
      return builtParts
    }

    log.debug(`Creating ${accessory.parts.length} child endpoint(s) for ${accessory.displayName}`)

    for (const [partIndex, part] of accessory.parts.entries()) {
      const partEndpointId = `${accessory.UUID}-part-${part.id}`

      deps.behaviorRegistry.registerPartEndpoint(partEndpointId, accessory.UUID, part.id)

      // Parts go through the same preparation as their parent — feature-gated
      // clusters, the battery PowerSource, conformance fix-ups and the
      // behaviors that route commands to handlers. See prepareDeviceType().
      const partPrepared = await this.prepareDeviceType(this.partAsAccessory(part, partEndpointId))
      let partDeviceType: EndpointType = partPrepared.deviceType

      // Tag each child with a semantic Number tag so controllers can stably
      // re-map otherwise-identical children of a composed device; without it
      // they are distinguishable only by transient endpoint number, which
      // Apple Home mishandles across hub changes.
      partDeviceType = (partDeviceType as any).with(DescriptorServer.with('TagList'))

      const partEndpointOptions: any = {
        id: partEndpointId,
        descriptor: {
          tagList: [
            {
              mfgCode: null,
              namespaceId: 7, // Number namespace
              tag: partIndex,
              label: truncateUtf8(part.displayName || part.id, 64),
            },
          ],
        },
        ...part.clusters,
      }
      withColorRemainingTime(partEndpointOptions)

      const partEndpoint = new Endpoint(partDeviceType, partEndpointOptions)
      setRegistryManager(partEndpoint, deps.registryManager)

      builtParts.push({ part, endpoint: partEndpoint, hasElectrical: partPrepared.hasElectrical })
    }

    return builtParts
  }

  /**
   * Finish the parts {@link buildAccessoryParts} built, now that the parent has
   * been added: advertise their utility device types and register their handlers.
   */
  private async finishAccessoryParts(
    accessory: MatterAccessory,
    builtParts: BuiltAccessoryPart[],
    deps: AccessoryManagerDeps,
  ): Promise<InternalMatterAccessoryPart[]> {
    const internalParts: InternalMatterAccessoryPart[] = []

    for (const { part, endpoint: partEndpoint, hasElectrical } of builtParts) {
      const partEndpointId = `${accessory.UUID}-part-${part.id}`
      await partEndpoint.construction.ready

      if (hasElectrical) {
        await this.advertiseUtilityDeviceType(partEndpoint, 'ElectricalSensor', part.displayName || part.id)
      }

      // Same rule as the parent: composing the battery cluster is not enough,
      // the endpoint has to advertise the PowerSource device type or no
      // controller has a reason to read it.
      if (part.clusters?.powerSource) {
        await this.advertiseUtilityDeviceType(partEndpoint, 'PowerSource', part.displayName || part.id)
      }

      log.debug(`  Created part endpoint: ${part.displayName || part.id} (${partEndpointId}) as child of ${accessory.displayName}`)

      deps.registryManager.registerEndpoint(partEndpointId, deps.behaviorRegistry)
      if (part.handlers) {
        for (const [clusterName, handlers] of Object.entries(part.handlers)) {
          for (const [commandName, handler] of Object.entries(handlers)) {
            deps.behaviorRegistry.registerHandler(partEndpointId, clusterName, commandName, handler)
          }
        }
        log.debug(`  Registered ${Object.keys(part.handlers).length} handler(s) for part ${part.id}`)
      }

      internalParts.push({
        ...part,
        endpoint: partEndpoint,
      })
    }

    return internalParts
  }

  /**
   * Advertise a utility device type (ElectricalSensor 0x0510, PowerSource
   * 0x0011) in the endpoint's descriptor. Controllers discover power/energy
   * metering and batteries through the device type list, not just the
   * clusters, so an endpoint that carries those clusters must also list the
   * type. matter.js dedupes the entry, so this is safe when the base device
   * type already is one.
   *
   * The write waits for the descriptor's lock. Taken without waiting, it
   * failed whenever something else held the lock at that moment, and the
   * battery or power meter was then invisible to controllers.
   */
  private async advertiseUtilityDeviceType(endpoint: Endpoint, deviceTypeName: string, displayName: string): Promise<void> {
    try {
      await endpoint.act(async (agent) => {
        const descriptor = agent.get(DescriptorServer)
        await lockStateForWrite(descriptor)
        descriptor.addDeviceTypes(deviceTypeName)
      })
      log.debug(`Advertised ${deviceTypeName} device type for ${displayName}`)
    } catch (error) {
      log.warn(`Could not advertise ${deviceTypeName} device type for ${displayName}:`, error)
    }
  }

  /**
   * Finalize accessory registration (store, emit events, save cache)
   */
  private async finalizeAccessoryRegistration(
    accessory: MatterAccessory,
    endpoint: Endpoint,
    internalParts: InternalMatterAccessoryPart[],
    deps: AccessoryManagerDeps,
  ): Promise<void> {
    const internalAccessory: InternalMatterAccessory = {
      ...accessory,
      endpoint,
      registered: true,
      _parts: internalParts.length > 0
        ? internalParts
        : undefined,
      _eventEmitter: new EventEmitter() as MatterAccessoryEventEmitter,
    }
    deps.accessories.set(accessory.UUID, internalAccessory)

    log.info(`Registered Matter accessory: ${accessory.displayName} (${accessory.UUID})`)

    if (deps.config.debugModeEnabled) {
      log.debug(`Total registered accessories: ${deps.accessories.size}/1000`)
    }

    await this.notifyPartsListChanged(deps)

    if (deps.accessoryCache) {
      deps.accessoryCache.requestSave(deps.accessories)
    }

    if (deps.getMonitoringEnabled()) {
      const event: MatterEvent = {
        type: 'accessoryAdded',
        data: { uuid: accessory.UUID },
      }
      sendToParent({
        id: IpcOutgoingEvent.MATTER_EVENT,
        data: event,
      })
    }
  }

  /**
   * Notify controllers that the parts list has changed.
   *
   * matter.js keeps the aggregator's parts list up to date by itself. What is
   * left for the bridge is the Matter 1.6 signal for a change of structure:
   * BasicInformation's ConfigurationVersion. matter.js seeds the attribute but
   * does not bump it when endpoints are added or removed.
   *
   * A failure is logged and never fails the registration it follows.
   */
  private async notifyPartsListChanged(deps: AccessoryManagerDeps): Promise<void> {
    const aggregator = deps.getAggregator()
    if (!aggregator || !deps.isCommissioned()) {
      return
    }

    try {
      if (deps.config.debugModeEnabled) {
        const partsList = aggregator.state?.descriptor?.partsList ?? []
        log.debug(`Parts list changed: ${partsList.length} devices (endpoints: ${partsList.join(', ')})`)
      }

      const serverNode = deps.getServerNode()
      if (serverNode) {
        await serverNode.act(async (agent) => {
          const basicInformation = agent.get(BasicInformationServer)
          await lockStateForWrite(basicInformation)
          await basicInformation.increaseConfigurationVersion()
        })
        log.debug('Increased bridge configuration version')
      }

      log.debug(`Notified controllers of parts list change (${deps.accessories.size} devices)`)
    } catch (error: unknown) {
      log.warn(`Failed to notify controllers of parts list change: ${error instanceof Error
        ? error.message
        : String(error)}`)
    }
  }
}
