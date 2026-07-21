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
} from '../types.js'

import { EventEmitter } from 'node:events'
import process from 'node:process'

import { Endpoint } from '@matter/main'
import { BasicInformationServer, BridgedDeviceBasicInformationServer, DescriptorServer } from '@matter/main/behaviors'
import { PowerSourceServer } from '@matter/node/behaviors'

import { IpcOutgoingEvent } from '../../ipcService.js'
import { Logger } from '../../logger.js'
import { setRegistryManager } from '../behaviors/EndpointContext.js'
import { HomebridgeRvcCleanModeServer, HomebridgeServiceAreaServer } from '../behaviors/index.js'
import {
  applyElectricalMeasurementClusters,
  applyElectricalMeasurementDefaults,
  applySmokeCoAlarmFeatures,
  applyThermostatFeatures,
  applyWindowCoveringFeatures,
  CLUSTER_IDS,
  detectBehaviorFeatures,
  detectElectricalMeasurementClusters,
  detectSmokeCoAlarmFeatures,
  detectThermostatFeatures,
  detectWindowCoveringFeatures,
  determineColorControlFeaturesFromHandlers,
  extractColorControlFeatures,
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

type BehaviorType = Behavior.Type

interface DetectedClusterFeatures {
  windowCoveringFeatures: string[]
  serviceAreaFeatures: string[] | null
  colorControlFeatures: string[] | null
  thermostatFeatures: string[] | null
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
        const sameShape = (existing.deviceType as { name?: string })?.name === (accessory.deviceType as { name?: string })?.name
          && partIds(existing._parts ?? existing.parts) === partIds(accessory.parts)
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
      let deviceType = accessory.deviceType
      const windowCoveringFeatures = detectWindowCoveringFeatures(accessory)
      if (windowCoveringFeatures.length > 0) {
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
      const customBehaviors = await this.buildCustomBehaviors(accessory, deviceType, features)
      if (customBehaviors.length > 0) {
        deviceType = (deviceType as any).with(...customBehaviors)
        log.info(`Applied ${customBehaviors.length} custom behavior(s) to device type`)
      }

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
        await this.advertiseElectricalSensorDeviceType(endpoint, accessory.displayName)
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
        colorControlFeatures = determineColorControlFeaturesFromHandlers(accessory.handlers.colorControl)
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
      const hasBattery = accessory.clusters.powerSource.batPercentRemaining !== undefined
        || accessory.clusters.powerSource.batChargeLevel !== undefined
      const hasRechargeable = accessory.clusters.powerSource.batChargeState !== undefined
      let powerSourceBehavior: BehaviorType = PowerSourceServer
      if (hasBattery && hasRechargeable) {
        powerSourceBehavior = (PowerSourceServer as any).with('Battery', 'Rechargeable')
        log.debug('Adding PowerSource server with battery and rechargeable features')
      } else if (hasBattery) {
        powerSourceBehavior = (PowerSourceServer as any).with('Battery')
        log.debug('Adding PowerSource server with battery feature')
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

    for (const part of accessory.parts) {
      const partEndpointId = `${accessory.UUID}-part-${part.id}`

      deps.behaviorRegistry.registerPartEndpoint(partEndpointId, accessory.UUID, part.id)

      let partDeviceType: EndpointType = part.deviceType
      const partCustomBehaviors: BehaviorType[] = []

      if (part.handlers) {
        for (const clusterName of Object.keys(part.handlers)) {
          const behaviorClass = CORE_CLUSTER_BEHAVIOR_MAP[clusterName]
          if (behaviorClass) {
            partCustomBehaviors.push(behaviorClass)
            log.info(`  Will use ${behaviorClass.name} for part ${part.id}`)
          } else {
            log.warn(`No custom behavior class available for cluster '${clusterName}' on part ${part.id}`)
          }
        }

        if (partCustomBehaviors.length > 0) {
          partDeviceType = (partDeviceType as any).with(...partCustomBehaviors)
          log.info(`  Applied ${partCustomBehaviors.length} custom behavior(s) to part ${part.id}`)
        }
      }

      // Electrical measurement detection runs for parts too, so composed
      // devices (e.g. a power strip with metered outlets, or a solar setup
      // exposing separate meters) can report power/energy per part.
      const partElectrical = detectElectricalMeasurementClusters(part)
      const partHasElectrical = partElectrical.hasPowerMeasurement || partElectrical.energyFeatures.length > 0
      if (partHasElectrical) {
        applyElectricalMeasurementDefaults(part, partElectrical)
        partDeviceType = applyElectricalMeasurementClusters(partDeviceType, part, partElectrical)
      }

      const partEndpointOptions: any = {
        id: partEndpointId,
        ...part.clusters,
      }

      const partEndpoint = new Endpoint(partDeviceType, partEndpointOptions)
      setRegistryManager(partEndpoint, deps.registryManager)

      await parentEndpoint.add(partEndpoint)

      if (partHasElectrical) {
        await this.advertiseElectricalSensorDeviceType(partEndpoint, part.displayName || part.id)
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
  private async advertiseElectricalSensorDeviceType(endpoint: Endpoint, displayName: string): Promise<void> {
    try {
      await endpoint.act(agent => agent.get(DescriptorServer).addDeviceTypes('ElectricalSensor'))
      log.debug(`Advertised ElectricalSensor device type for ${displayName}`)
    } catch (error) {
      log.warn(`Could not advertise ElectricalSensor device type for ${displayName}:`, error)
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

    try {
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

        log.info(`Notified controllers of parts list change (${deps.accessories.size} devices)`)
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.warn(`Failed to notify controllers of parts list change: ${errorMessage}`)
    }
  }
}
