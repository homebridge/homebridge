/**
 * Accessory Manager
 *
 * Handles registering/unregistering accessories, building custom behaviors,
 * detecting cluster features, creating endpoint options, creating accessory parts,
 * and restoring cached state.
 */

import type { EndpointType, ServerNode } from '@matter/main'
import type { Behavior } from '@matter/node'

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
import process from 'node:process'

import { Endpoint } from '@matter/main'
import { BasicInformationServer, BridgedDeviceBasicInformationServer, DescriptorServer, FixedLabelServer } from '@matter/main/behaviors'
import { PowerSourceServer } from '@matter/node/behaviors'

import { IpcOutgoingEvent } from '../../ipcService.js'
import { Logger } from '../../logger.js'
import { setRegistryManager } from '../behaviors/EndpointContext.js'
import { HomebridgeRvcCleanModeServer, HomebridgeServiceAreaServer } from '../behaviors/index.js'
import {
  applyElectricalMeasurementClusters,
  applyElectricalMeasurementDefaults,
  applyLevelControlLightingFloor,
  applySmokeCoAlarmFeatures,
  applyThermostatFeatures,
  applyWindowCoveringFeatures,
  CLUSTER_IDS,
  detectBehaviorFeatures,
  detectElectricalMeasurementClusters,
  detectSmokeCoAlarmFeatures,
  detectThermostatFeatures,
  detectWindowCoveringFeatures,
  determineColorControlFeaturesFromClusters,
  determineColorControlFeaturesFromHandlers,
  extractColorControlFeatures,
  extractDeclaredFeatures,
  extractLevelControlFeatures,
  extractThermostatFeatures,
  validateAccessoryRequiredFields,
} from '../serverHelpers.js'
import {
  devices,
  MatterDeviceError,
} from '../types.js'
import { stripVendorFromLabel } from '../utils.js'
import { CORE_CLUSTER_BEHAVIOR_MAP } from './BehaviorMap.js'

// The parts-list update and ConfigurationVersion bump run inside matter.js
// transactions that acquire their resource lock synchronously. A controller
// re-establishing its subscription (matter.js-internal "offline" transactions)
// can briefly hold that lock, making the synchronous acquisition throw. Those
// transactions release almost immediately, so retry with a short yield rather
// than dropping the structure-change notification (#3970).
const PARTS_LIST_NOTIFY_ATTEMPTS = 5
const PARTS_LIST_NOTIFY_RETRY_DELAY_MS = 50

type BehaviorType = Behavior.Type

interface DetectedClusterFeatures {
  windowCoveringFeatures: string[]
  serviceAreaFeatures: string[] | null
  colorControlFeatures: string[] | null
  thermostatFeatures: string[] | null
  closureControlFeatures: string[] | null
  mediaPlaybackFeatures: string[] | null
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

    if (deps.accessories.has(accessory.UUID)) {
      const existing = deps.accessories.get(accessory.UUID)
      // A cache-restored accessory keeps its endpoint (so the parts list never
      // churns); the plugin's registration attaches its handlers and metadata
      // in place. Structural changes fall through to a fresh registration.
      if (existing?._restoredFromCache) {
        const partIds = (list?: { id: string }[]) => JSON.stringify((list ?? []).map(part => part.id).sort())
        // ⚠️ The name is not enough. The cache stores a device type as
        // {name, code}, so a restore rebuilds the BASE type - anything the
        // plugin composed itself (via api.matter.deviceRequirements) is gone,
        // while the name still matches. Attaching in place then kept the
        // restored endpoint and silently reverted the plugin's own feature
        // choice to the detected one on every restart, which is exactly the
        // case deviceRequirements exists to serve. Compare what is composed.
        const behaviorKeys = (deviceType: unknown) =>
          Object.keys((deviceType as { behaviors?: Record<string, unknown> })?.behaviors ?? {}).sort().join(',')
        const sameShape = (existing.deviceType as { name?: string })?.name === (accessory.deviceType as { name?: string })?.name
          && partIds(existing._parts ?? existing.parts) === partIds(accessory.parts)
          && behaviorKeys(existing.deviceType) === behaviorKeys(accessory.deviceType)
        if (sameShape) {
          log.info(`Attached plugin registration to restored accessory ${accessory.displayName} (${accessory.UUID})`)
          deps.accessories.set(accessory.UUID, {
            ...existing,
            ...accessory,
            endpoint: existing.endpoint,
            _parts: existing._parts,
            registered: true,
            _restoredFromCache: false,
          })
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
        log.info(`Restored accessory ${accessory.displayName} changed structure - re-registering`)
        await this.unregisterAccessory(accessory.UUID, deps)
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

      const endpointOptions = this.createEndpointOptions(accessory, deps.config)

      // Composed parents carry a FixedLabel marking the composition, matching
      // known-good bridges - Apple's controller needs it to bind child endpoints
      // to the composed accessory. Without it (plus the PowerSource below),
      // homed never finishes its per-accessory session setup: commands fail
      // silently ("No Response") from ~30s after pairing while reads keep working.
      if (accessory.parts && accessory.parts.length > 0) {
        if ((deviceType as { behaviors?: Record<string, unknown> }).behaviors?.fixedLabel === undefined) {
          deviceType = (deviceType as any).with(FixedLabelServer)
          endpointOptions.fixedLabel = {
            labelList: [{ label: 'composed', value: 'true' }],
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
      }

      const endpoint = new Endpoint(deviceType, endpointOptions)

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
      const internalParts = await this.createAccessoryParts(accessory, endpoint, deps)

      await this.finalizeAccessoryRegistration(accessory, endpoint, internalParts, deps)
    } catch (error) {
      log.error(`Failed to register Matter accessory ${accessory.displayName}:`, error)
      throw new MatterDeviceError(`Failed to register accessory: ${error}`)
    }
  }

  /**
   * Unregister a Matter accessory
   */
  async unregisterAccessory(uuid: string, deps: AccessoryManagerDeps): Promise<void> {
    const accessory = deps.accessories.get(uuid)
    if (!accessory) {
      log.debug(`Accessory ${uuid} not found or not registered`)

      if (deps.accessoryCache && deps.accessoryCache.getCached(uuid)) {
        log.debug(`Removing ${uuid} from cache`)
        deps.accessoryCache.removeCached(uuid)
        deps.accessoryCache.requestSave(deps.accessories)
      }
      return
    }

    try {
      if (accessory.endpoint && deps.getAggregator()) {
        await accessory.endpoint.close()
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

      if (deps.getMonitoringEnabled() && process.send) {
        const event: MatterEvent = {
          type: 'accessoryRemoved',
          data: { uuid },
        }
        process.send({
          id: IpcOutgoingEvent.MATTER_EVENT,
          data: event,
        })
      }
    } catch (error) {
      log.error(`Failed to unregister Matter accessory ${uuid}:`, error)
      throw new MatterDeviceError(`Failed to unregister accessory: ${error}`)
    }
  }

  /**
   * Restore cached state for an accessory
   */
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

        log.info(`Restored cached state for Matter accessory: ${accessory.displayName}`)
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
      if (!accessory.context) {
        accessory.context = {}
      }
      (accessory.context as Record<string, unknown>)._skipWindowCoveringBehavior = true
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

    const features = this.detectClusterFeatures(accessory, deviceType)

    // Now that we know whether LevelControl keeps its Lighting feature, make
    // sure the declared levels are legal for it.
    applyLevelControlLightingFloor(accessory, features.levelControlFeatures)

    const customBehaviors = await this.buildCustomBehaviors(accessory, deviceType, features)
    if (customBehaviors.length > 0) {
      deviceType = (deviceType as any).with(...customBehaviors)
      log.info(`Applied ${customBehaviors.length} custom behavior(s) to device type`)
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
        log.info(`ServiceArea features will be enabled for ${accessory.displayName}: ${features.join(', ')}`)
      }
    }

    let colorControlFeatures: string[] | null = null
    if (accessory.handlers?.colorControl) {
      colorControlFeatures = detectBehaviorFeatures(
        deviceType,
        CLUSTER_IDS.COLOR_CONTROL,
        extractColorControlFeatures,
      )
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

    let thermostatFeatures: string[] | null = null
    if (accessory.handlers?.thermostat) {
      thermostatFeatures = detectBehaviorFeatures(
        deviceType,
        CLUSTER_IDS.THERMOSTAT,
        extractThermostatFeatures,
      )
    }

    // ClosureControl and MediaPlayback are feature-gated too, and the device
    // type is where the choice was made - Closure composes Positioning, and a
    // plugin may have composed more. Read whatever is there so replacing the
    // base behavior with the handler-calling one carries it across instead of
    // resetting the cluster to its featureless form.
    let closureControlFeatures: string[] | null = null
    if (accessory.handlers?.closureControl) {
      closureControlFeatures = detectBehaviorFeatures(
        deviceType,
        CLUSTER_IDS.CLOSURE_CONTROL,
        extractDeclaredFeatures,
      )
    }

    let mediaPlaybackFeatures: string[] | null = null
    if (accessory.handlers?.mediaPlayback) {
      mediaPlaybackFeatures = detectBehaviorFeatures(
        deviceType,
        CLUSTER_IDS.MEDIA_PLAYBACK,
        extractDeclaredFeatures,
      )
    }

    // LevelControl: matter.js's public `LevelControlServer` inherits the
    // Lighting+OnOff feature set from its internal `LevelControlBase` (see
    // LevelControlServer.ts line ~20: `LevelControlBehavior.with(OnOff, Lighting)`).
    // The `.for(LevelControl)` pattern that's supposed to reset features is a
    // no-op because the raw `LevelControl` cluster doesn't declare
    // `supportedFeatures`, so `syncFeatures` returns the base schema unchanged.
    //
    // Consequence: on a Pump endpoint (whose device-type requirements put
    // LevelControl in `optional`, not `SupportedBehaviors`), attaching our
    // behavior as-is leaves `features.lighting === true` at runtime. matter.js
    // then picks the spec's `[LT]` branch for MinLevel ("constraint 1 to 254")
    // and rejects `minLevel: 0` with a ValidationError, plus
    // `initializeLighting()` emits "currentLevel/minLevel invalid" warnings.
    //
    // Fix: detect the device type's declared LevelControl features and apply
    // them via `.with(...)`. When the device type declares nothing (Pump and
    // similar), fall back to an EMPTY feature set so `.with()` explicitly
    // strips the inherited Lighting/OnOff — the `[!LT]` branch then applies,
    // `minLevel: 0` is valid, and `initializeLighting()` is skipped.
    //
    // See homebridge#3905 and the matter.js Device Library spec § 5 (Pump).
    let levelControlFeatures: string[] | null = null
    if (accessory.handlers?.levelControl) {
      levelControlFeatures = detectBehaviorFeatures(
        deviceType,
        CLUSTER_IDS.LEVEL_CONTROL,
        extractLevelControlFeatures,
      )
      if (levelControlFeatures === null) {
        levelControlFeatures = []
        log.debug(`[${accessory.displayName}] Device type declares no LevelControl requirement; stripping inherited Lighting via .with()`)
      }
    }

    return {
      windowCoveringFeatures,
      serviceAreaFeatures,
      colorControlFeatures,
      thermostatFeatures,
      closureControlFeatures,
      mediaPlaybackFeatures,
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
      // of intent, so they count. Nothing here invents a reading: a source that
      // declares no battery attribute whatsoever is indistinguishable from a
      // wired one and is left alone.
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
        log.debug('Adding base PowerSource server')
      }
      customBehaviors.push(powerSourceBehavior)
    }

    if (!accessory.handlers) {
      return customBehaviors
    }

    log.debug(`[${accessory.displayName}] Has handlers: ${Object.keys(accessory.handlers).join(', ')}`)

    // Handle RoboticVacuumCleaner optional clusters
    if (deviceType.deviceType === devices.RoboticVacuumCleanerDevice.deviceType) {
      const { RvcCleanModeServer, ServiceAreaServer } = devices.RoboticVacuumCleanerRequirements

      if (accessory.clusters?.rvcCleanMode) {
        if (accessory.handlers?.rvcCleanMode) {
          customBehaviors.push(HomebridgeRvcCleanModeServer)
          log.info('Adding custom RvcCleanMode behavior with handlers')
        } else {
          customBehaviors.push(RvcCleanModeServer)
          log.info('Adding base RvcCleanMode server')
        }
      }

      if (accessory.clusters?.serviceArea) {
        if (accessory.handlers?.serviceArea) {
          let behaviorClass: BehaviorType = HomebridgeServiceAreaServer
          if (features.serviceAreaFeatures && features.serviceAreaFeatures.length > 0) {
            behaviorClass = (behaviorClass as any).with(...features.serviceAreaFeatures)
            log.info(`ServiceArea custom behavior will have features: ${features.serviceAreaFeatures.join(', ')}`)
          }
          customBehaviors.push(behaviorClass)
          log.info('Adding custom ServiceArea behavior with handlers')
        } else {
          let behaviorClass: BehaviorType = ServiceAreaServer
          if (features.serviceAreaFeatures && features.serviceAreaFeatures.length > 0) {
            behaviorClass = (behaviorClass as any).with(...features.serviceAreaFeatures)
            log.info(`ServiceArea base server will have features: ${features.serviceAreaFeatures.join(', ')}`)
          }
          customBehaviors.push(behaviorClass)
          log.info('Adding base ServiceArea server')
        }
      }
    }

    for (const clusterName of Object.keys(accessory.handlers || {})) {
      const skipWindowCoveringBehavior = accessory.context?._skipWindowCoveringBehavior as boolean | undefined
      if (clusterName === 'windowCovering' && skipWindowCoveringBehavior) {
        log.debug('Skipping custom WindowCovering behavior (using base server with features instead)')
        continue
      }

      if (clusterName === 'rvcCleanMode' || clusterName === 'serviceArea' || clusterName === 'powerSource') {
        continue
      }

      let behaviorClass = CORE_CLUSTER_BEHAVIOR_MAP[clusterName]

      if (clusterName === 'colorControl' && behaviorClass && features.colorControlFeatures && features.colorControlFeatures.length > 0) {
        behaviorClass = (behaviorClass as any).with(...features.colorControlFeatures)
        log.info(`ColorControl custom behavior will preserve features: ${features.colorControlFeatures.join(', ')}`)
      }

      if (clusterName === 'thermostat' && behaviorClass && features.thermostatFeatures && features.thermostatFeatures.length > 0) {
        behaviorClass = (behaviorClass as any).with(...features.thermostatFeatures)
        log.info(`Thermostat custom behavior will preserve features: ${features.thermostatFeatures.join(', ')}`)
      }

      // LevelControl: unlike the branches above, we apply `.with(...)` even when
      // the feature array is empty. That's deliberate — an empty feature set is
      // what strips the Lighting/OnOff features HomebridgeLevelControlServer
      // inherits from matter.js's LevelControlBase. See detectClusterFeatures()
      // above for the full explanation.
      if (clusterName === 'levelControl' && behaviorClass && features.levelControlFeatures !== null) {
        behaviorClass = (behaviorClass as any).with(...features.levelControlFeatures)
        if (features.levelControlFeatures.length > 0) {
          log.info(`LevelControl custom behavior will preserve features: ${features.levelControlFeatures.join(', ')}`)
        } else {
          log.debug('LevelControl custom behavior applied with empty feature set (strips inherited Lighting)')
        }
      }

      if (clusterName === 'closureControl' && behaviorClass && features.closureControlFeatures && features.closureControlFeatures.length > 0) {
        behaviorClass = (behaviorClass as any).with(...features.closureControlFeatures)
        log.info(`ClosureControl custom behavior will preserve features: ${features.closureControlFeatures.join(', ')}`)
      }

      if (clusterName === 'mediaPlayback' && behaviorClass && features.mediaPlaybackFeatures && features.mediaPlaybackFeatures.length > 0) {
        behaviorClass = (behaviorClass as any).with(...features.mediaPlaybackFeatures)
        log.info(`MediaPlayback custom behavior will preserve features: ${features.mediaPlaybackFeatures.join(', ')}`)
      }

      if (clusterName === 'serviceArea' && behaviorClass && features.serviceAreaFeatures && features.serviceAreaFeatures.length > 0) {
        behaviorClass = (behaviorClass as any).with(...features.serviceAreaFeatures)
        log.info(`ServiceArea custom behavior will preserve features: ${features.serviceAreaFeatures.join(', ')}`)
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

      if (behaviorClass) {
        customBehaviors.push(behaviorClass)
        log.info(`Will use ${behaviorClass.name} for ${accessory.displayName}`)
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
   * Create endpoint options for an accessory
   */
  private createEndpointOptions(accessory: MatterAccessory, config: MatterServerConfig): any {
    const endpointOptions: any = {
      id: accessory.UUID,
      ...accessory.clusters,
    }

    if (!config.externalAccessory) {
      endpointOptions.bridgedDeviceBasicInformation = {
        vendorName: accessory.manufacturer,
        nodeLabel: accessory.displayName,
        productName: accessory.model,
        // productLabel SHALL NOT include the vendor name per the Matter spec.
        // Fall back to model or "Device" when stripping consumes the whole name.
        productLabel: stripVendorFromLabel(accessory.displayName, accessory.manufacturer)
          || accessory.model || 'Device',
        serialNumber: accessory.serialNumber,
        reachable: true,
      }
      // Surface the device's firmware version to controllers (shown in the
      // accessory details of e.g. Apple Home). The numeric companion is
      // derived from a leading semver triplet when the string has one and
      // the parts fit the 16/8/8-bit encoding - otherwise only the string
      // is set (both attributes are independently optional per spec, and a
      // failed uint32 validation would block the accessory registering).
      // The spec caps SoftwareVersionString at 64 characters.
      if (typeof accessory.firmwareRevision === 'string' && accessory.firmwareRevision.length > 0) {
        endpointOptions.bridgedDeviceBasicInformation.softwareVersionString = accessory.firmwareRevision.slice(0, 64)
        const semver = accessory.firmwareRevision.match(/^(\d+)\.(\d+)\.(\d+)/)
        if (semver) {
          const [major, minor, patch] = [Number(semver[1]), Number(semver[2]), Number(semver[3])]
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
    if (!accessory.handlers) {
      return
    }

    log.info(`Setting up handlers for accessory ${accessory.UUID}`)

    deps.registryManager.registerEndpoint(accessory.UUID, deps.behaviorRegistry)

    for (const [clusterName, handlers] of Object.entries(accessory.handlers)) {
      log.info(`  Processing cluster: ${clusterName}`)

      for (const [commandName, handler] of Object.entries(handlers)) {
        deps.behaviorRegistry.registerHandler(accessory.UUID, clusterName, commandName, handler)
      }
    }
  }

  /**
   * Create and register child endpoints (parts) for an accessory
   *
   * Parts are added as sub-endpoints of the parent endpoint, creating a composed
   * device per the Matter spec. Children are plain device types with no
   * BridgedDeviceBasicInformation — only the parent has that.
   * See: https://github.com/matter-js/matter.js/blob/main/docs/MIGRATION_GUIDE_08.md
   */
  private async createAccessoryParts(
    accessory: MatterAccessory,
    parentEndpoint: Endpoint,
    deps: AccessoryManagerDeps,
  ): Promise<InternalMatterAccessoryPart[]> {
    const internalParts: InternalMatterAccessoryPart[] = []

    if (!accessory.parts || accessory.parts.length === 0) {
      return internalParts
    }

    log.info(`Creating ${accessory.parts.length} child endpoint(s) for ${accessory.displayName}`)

    for (const [partIndex, part] of accessory.parts.entries()) {
      const partEndpointId = `${accessory.UUID}-part-${part.id}`

      deps.behaviorRegistry.registerPartEndpoint(partEndpointId, accessory.UUID, part.id)

      // Parts go through the same preparation as their parent — feature-gated
      // clusters, the battery PowerSource, conformance fix-ups and the
      // behaviors that route commands to handlers. See prepareDeviceType().
      const partPrepared = await this.prepareDeviceType(this.partAsAccessory(part, partEndpointId))
      const partHasElectrical = partPrepared.hasElectrical
      let partDeviceType: EndpointType = partPrepared.deviceType

      // Tag each child with a semantic Number tag so controllers can stably
      // re-map otherwise-identical children of a composed device; without it
      // they are distinguishable only by transient endpoint number, which
      // Apple Home mishandles across hub changes.
      partDeviceType = (partDeviceType as any).with(DescriptorServer.with('TagList'))

      const partEndpointOptions: any = {
        id: partEndpointId,
        descriptor: {
          tagList: [{
            mfgCode: null,
            namespaceId: 7, // Number namespace
            tag: partIndex,
            label: (part.displayName || part.id).slice(0, 64),
          }],
        },
        ...part.clusters,
      }

      const partEndpoint = new Endpoint(partDeviceType, partEndpointOptions)
      setRegistryManager(partEndpoint, deps.registryManager)

      await parentEndpoint.add(partEndpoint)

      if (partHasElectrical) {
        await this.advertiseUtilityDeviceType(partEndpoint, 'ElectricalSensor', part.displayName || part.id)
      }

      // Same rule as the parent: composing the battery cluster is not enough,
      // the endpoint has to advertise the PowerSource device type or no
      // controller has a reason to read it.
      if (part.clusters?.powerSource) {
        await this.advertiseUtilityDeviceType(partEndpoint, 'PowerSource', part.displayName || part.id)
      }

      log.info(`  Created part endpoint: ${part.displayName || part.id} (${partEndpointId}) as child of ${accessory.displayName}`)

      if (part.handlers) {
        deps.registryManager.registerEndpoint(partEndpointId, deps.behaviorRegistry)

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
   * Advertise the ElectricalSensor utility device type (0x0510) in the
   * endpoint's descriptor. Controllers discover power/energy metering through
   * the device type list, not just the clusters, so an outlet that carries
   * the measurement clusters must also list ElectricalSensor. matter.js
   * dedupes the entry, so this is safe when the base device type already is
   * an ElectricalSensor.
   */
  private async advertiseUtilityDeviceType(endpoint: Endpoint, deviceTypeName: string, displayName: string): Promise<void> {
    try {
      await endpoint.act(agent => agent.get(DescriptorServer).addDeviceTypes(deviceTypeName as never))
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
      _parts: internalParts.length > 0 ? internalParts : undefined,
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

    if (deps.getMonitoringEnabled() && process.send) {
      const event: MatterEvent = {
        type: 'accessoryAdded',
        data: { uuid: accessory.UUID },
      }
      process.send({
        id: IpcOutgoingEvent.MATTER_EVENT,
        data: event,
      })
    }
  }

  /**
   * Notify controllers that the parts list has changed
   */
  private async notifyPartsListChanged(deps: AccessoryManagerDeps): Promise<void> {
    const aggregator = deps.getAggregator()
    if (!aggregator || !deps.isCommissioned()) {
      return
    }

    for (let attempt = 1; attempt <= PARTS_LIST_NOTIFY_ATTEMPTS; attempt++) {
      try {
        await this.applyPartsListNotification(aggregator, deps)
        return
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        // matter.js reports synchronous lock contention with "Cannot lock ...
        // synchronously" / "acquire locks asynchronously". The blocking
        // transaction releases almost immediately, so yield and retry rather
        // than dropping the notification.
        const isLockContention = errorMessage.includes('Cannot lock') || errorMessage.includes('acquire locks')
        if (isLockContention && attempt < PARTS_LIST_NOTIFY_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, PARTS_LIST_NOTIFY_RETRY_DELAY_MS))
          continue
        }

        log.warn(`Failed to notify controllers of parts list change: ${errorMessage}`)
        return
      }
    }
  }

  /**
   * A single attempt at pushing the parts-list change to controllers: update the
   * aggregator's parts list and bump the bridge ConfigurationVersion. Both bump
   * once per successful call, so retrying the whole thing after a mid-way lock
   * failure does not double-count (the parts-list set is idempotent and only a
   * successful `increaseConfigurationVersion()` mutates the version).
   */
  private async applyPartsListNotification(
    aggregator: NonNullable<ReturnType<AccessoryManagerDeps['getAggregator']>>,
    deps: AccessoryManagerDeps,
  ): Promise<void> {
    const aggregatorState = aggregator as any

    if (aggregatorState.state?.descriptor) {
      const partsList = aggregatorState.state.descriptor.partsList || []

      if (deps.config.debugModeEnabled) {
        log.debug(`Parts list changed: ${partsList.length} devices (endpoints: ${partsList.join(', ')})`)
      }

      await aggregator.set({
        descriptor: {
          partsList,
        },
      } as any)
    }

    // Matter 1.6 signals bridge structure changes to controllers via
    // BasicInformation's ConfigurationVersion. matter.js seeds the attribute
    // but does not bump it when endpoints are added or removed — that is the
    // bridge's job.
    const serverNode = deps.getServerNode()
    if (serverNode) {
      await serverNode.act(agent => agent.get(BasicInformationServer).increaseConfigurationVersion())
      log.debug('Increased bridge configuration version')
    }

    log.info(`Notified controllers of parts list change (${deps.accessories.size} devices)`)
  }
}
