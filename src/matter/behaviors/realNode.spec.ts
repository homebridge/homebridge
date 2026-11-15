import type { MockInstance } from 'vitest'

import type { AccessoryManagerDeps } from '../server/AccessoryManager.js'
import type { InternalMatterAccessory, MatterAccessory } from '../types.js'

import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Filesystem } from '@matter/general'
import { Endpoint, Environment, ServerNode } from '@matter/main'
import { ThermostatRequirements } from '@matter/main/devices/thermostat'
import { AggregatorEndpoint } from '@matter/main/endpoints'
import { NodeJsFilesystem } from '@matter/nodejs'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from '../../logger.js'
import { mapAttributesToCommand } from '../ClusterCommandMapper.js'
import { MatterStatus } from '../errors.js'
import { AccessoryManager } from '../server/AccessoryManager.js'
import { StateManager } from '../server/StateManager.js'
import { deviceRequirements, devices, deviceTypes } from '../types.js'
import { BehaviorRegistry, HomebridgeDoorLockServer, HomebridgeOnOffServer, HomebridgeThermostatServer, HomebridgeWindowCoveringServer, RegistryManager } from './index.js'

/**
 * The Homebridge behaviors on a real matter.js node.
 *
 * The other behavior specs mock the matter.js base class, so they cannot see
 * what a command does once matter.js's own logic runs (a base method that
 * calls back into an override, one that is not implemented, and so on). These
 * register an accessory through the real AccessoryManager and invoke commands
 * on the real endpoint. The node never goes online.
 */

let storageRoot: string
let node: ServerNode
let accessories: Map<string, InternalMatterAccessory>
let deps: AccessoryManagerDeps
let stateManager: StateManager
let nodeCount = 0

beforeAll(() => {
  storageRoot = mkdtempSync(join(tmpdir(), 'hb-matter-behaviors-'))
  // keep matter.js's own log lines out of the test output
  Environment.default.vars.set('log.level', 'fatal')
})

beforeEach(async () => {
  for (const level of ['info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(() => {})
  }
  // The node's own environment keeps its storage out of the home directory.
  const environment = new Environment(`behaviors-${nodeCount}`, Environment.default)
  environment.set(Filesystem, new NodeJsFilesystem(join(storageRoot, `node-${nodeCount}`)))
  node = await ServerNode.create({
    id: `behaviors-${nodeCount++}`,
    environment,
    network: { port: 0 },
  })
  const aggregator = new Endpoint(AggregatorEndpoint, { id: 'aggregator' })
  await node.add(aggregator)
  accessories = new Map()
  stateManager = new StateManager(accessories, new EventEmitter(), () => false)
  deps = {
    config: {} as AccessoryManagerDeps['config'],
    accessories,
    behaviorRegistry: new BehaviorRegistry(accessories),
    registryManager: new RegistryManager(),
    accessoryCache: null,
    getServerNode: () => node,
    getAggregator: () => aggregator,
    getIsRunning: () => false,
    getMonitoringEnabled: () => false,
    isCommissioned: () => false,
  }
})

afterEach(async () => {
  await node.close()
  vi.restoreAllMocks()
})

afterAll(() => {
  rmSync(storageRoot, { recursive: true, force: true })
})

/** Register an accessory through the real AccessoryManager and return its endpoint. */
async function register(accessory: Pick<MatterAccessory, 'deviceType' | 'clusters' | 'handlers'>): Promise<Endpoint> {
  await new AccessoryManager().registerAccessory('homebridge-test', 'Test', {
    UUID: 'test-uuid',
    displayName: 'Test',
    serialNumber: 'serial',
    manufacturer: 'maker',
    model: 'model',
    context: {},
    ...accessory,
  }, deps)
  return accessories.get('test-uuid')!.endpoint as Endpoint
}

/** Invoke a cluster command on the endpoint, the way StateManager.triggerCommand does. */
function invoke(endpoint: Endpoint, cluster: string, command: string, request?: unknown): Promise<unknown> {
  return endpoint.act((agent) => {
    const behavior = (agent as unknown as Record<string, Record<string, (request?: unknown) => unknown>>)[cluster]
    return request === undefined
      ? behavior[command]()
      : behavior[command](request)
  }) as Promise<unknown>
}

/** Give the reactions to a change (they run on their own, after the write) time to finish. */
function settle(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 30))
}

/** Write attributes straight to the endpoint, which is what a controller's write comes down to. */
function write(endpoint: Endpoint, patch: Record<string, Record<string, unknown>>): Promise<void> {
  return endpoint.set(patch as never)
}

/** The live state of one cluster on the endpoint. */
function stateOf(endpoint: Endpoint, cluster: string): Record<string, unknown> {
  return (endpoint.state as Record<string, Record<string, unknown>>)[cluster]
}

describe('onOff on a real node', () => {
  it('runs Toggle through the on handler when the plugin has no toggle handler', async () => {
    const calls: string[] = []
    const endpoint = await register({
      deviceType: deviceTypes.OnOffLight,
      clusters: {
        onOff: { onOff: false },
      },
      handlers: {
        onOff: {
          on: async () => {
            calls.push('on')
          },
          off: async () => {
            calls.push('off')
          },
        },
      },
    })

    await invoke(endpoint, 'onOff', 'toggle')
    expect(stateOf(endpoint, 'onOff').onOff).toBe(true)
    await invoke(endpoint, 'onOff', 'toggle')
    expect(stateOf(endpoint, 'onOff').onOff).toBe(false)

    expect(calls).toEqual(['on', 'off'])
  })

  it('calls only the toggle handler when the plugin has one', async () => {
    const calls: string[] = []
    const endpoint = await register({
      deviceType: deviceTypes.OnOffLight,
      clusters: {
        onOff: { onOff: false },
      },
      handlers: {
        onOff: {
          on: async () => {
            calls.push('on')
          },
          off: async () => {
            calls.push('off')
          },
          toggle: async () => {
            calls.push('toggle')
          },
        },
      },
    })

    await invoke(endpoint, 'onOff', 'toggle')

    expect(calls).toEqual(['toggle'])
    expect(stateOf(endpoint, 'onOff').onOff).toBe(true)
  })

  it('leaves the state alone when the toggle handler fails', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.OnOffLight,
      clusters: {
        onOff: { onOff: false },
      },
      handlers: {
        onOff: {
          toggle: async () => {
            throw new Error('device offline')
          },
        },
      },
    })

    await expect(invoke(endpoint, 'onOff', 'toggle')).rejects.toThrow('The onOff.toggle handler failed: device offline')
    expect(stateOf(endpoint, 'onOff').onOff).toBe(false)
  })
})

describe('getAccessoryState on a real node', () => {
  it('reads every attribute of a cluster from the live endpoint, with big numbers as plain numbers', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.DimmableLight,
      clusters: {
        onOff: { onOff: false },
        levelControl: { currentLevel: 100, minLevel: 1, maxLevel: 254 },
      },
      handlers: {
        onOff: {
          on: async () => {},
          off: async () => {},
        },
      },
    })

    await invoke(endpoint, 'onOff', 'on')

    expect(stateManager.getAccessoryState('test-uuid', 'onOff')).toMatchObject({ onOff: true })
    const level = stateManager.getAccessoryState('test-uuid', 'levelControl')
    expect(level).toMatchObject({ currentLevel: 100, minLevel: 1, maxLevel: 254 })
    expect(Object.values(level ?? {}).some(value => typeof value === 'bigint' || typeof value === 'function')).toBe(false)
    expect(stateManager.getAccessoryState('test-uuid', 'colorControl')).toBeUndefined()
  })
})

describe('levelControl on a real node', () => {
  const options = { optionsMask: {}, optionsOverride: {} }

  /** A dimmable light at level 100 that is on, with the given level handlers. */
  function dimmableLight(levelHandlers: Record<string, (request: { level: number }) => Promise<void>>) {
    return register({
      deviceType: deviceTypes.DimmableLight,
      clusters: {
        onOff: { onOff: true },
        levelControl: { currentLevel: 100, minLevel: 1, maxLevel: 254 },
      },
      handlers: {
        onOff: {
          on: async () => {},
          off: async () => {},
        },
        levelControl: levelHandlers,
      },
    })
  }

  it('runs MoveToLevel through moveToLevelWithOnOff when that is the only handler', async () => {
    const levels: number[] = []
    const endpoint = await dimmableLight({
      moveToLevelWithOnOff: async (request) => {
        levels.push(request.level)
      },
    })

    await invoke(endpoint, 'levelControl', 'moveToLevel', { level: 50, transitionTime: 0, ...options })

    expect(levels).toEqual([50])
    expect(stateOf(endpoint, 'levelControl').currentLevel).toBe(50)
  })

  it('runs MoveToLevelWithOnOff through moveToLevel when that is the only handler', async () => {
    const levels: number[] = []
    const endpoint = await dimmableLight({
      moveToLevel: async (request) => {
        levels.push(request.level)
      },
    })

    await invoke(endpoint, 'levelControl', 'moveToLevelWithOnOff', { level: 60, transitionTime: 0, ...options })

    expect(levels).toEqual([60])
    expect(stateOf(endpoint, 'levelControl').currentLevel).toBe(60)
  })

  it.each([
    {
      command: 'step',
      request: { stepMode: 0, stepSize: 40, transitionTime: 0 },
      level: 140,
    },
    {
      command: 'stepWithOnOff',
      request: { stepMode: 1, stepSize: 40, transitionTime: 0 },
      level: 60,
    },
    {
      command: 'stepWithOnOff',
      request: { stepMode: 0, stepSize: 200, transitionTime: 0 },
      level: 254,
    },
    {
      command: 'move',
      request: { moveMode: 0, rate: null },
      level: 254,
    },
    {
      command: 'moveWithOnOff',
      request: { moveMode: 1, rate: null },
      level: 1,
    },
  ])('tells the move-to-level handler the target of $command when it has no handler of its own', async ({ command, request, level }) => {
    const levels: number[] = []
    const endpoint = await dimmableLight({
      moveToLevelWithOnOff: async (moveToLevel) => {
        levels.push(moveToLevel.level)
      },
    })

    await invoke(endpoint, 'levelControl', command, {
      ...request,
      ...options,
    })

    expect(levels).toEqual([level])
    expect(stateOf(endpoint, 'levelControl').currentLevel).toBe(level)
  })

  // #3905: a pump's level control has no Lighting feature, so level 0 is allowed
  it('registers a pump whose level control starts at 0 and calls its handler', async () => {
    const levels: number[] = []
    const endpoint = await register({
      deviceType: deviceTypes.Pump,
      clusters: {
        onOff: { onOff: true },
        pumpConfigurationAndControl: { operationMode: 0, effectiveOperationMode: 0, effectiveControlMode: 0 },
        levelControl: { currentLevel: 0, minLevel: 0, maxLevel: 200 },
      },
      handlers: {
        onOff: {
          on: async () => {},
          off: async () => {},
        },
        levelControl: {
          moveToLevel: async (request: { level: number }) => {
            levels.push(request.level)
          },
        },
      },
    })

    expect(stateOf(endpoint, 'levelControl')).toMatchObject({
      minLevel: 0,
      featureMap: expect.objectContaining({ lighting: false }),
    })
    await invoke(endpoint, 'levelControl', 'moveToLevel', { level: 80, transitionTime: 0, ...options })
    expect(levels).toEqual([80])
  })

  it('keeps the lighting feature of a dimmable light on the homebridge behavior', async () => {
    const endpoint = await dimmableLight({
      moveToLevel: async () => {},
    })

    expect(stateOf(endpoint, 'levelControl').featureMap).toMatchObject({ lighting: true, onOff: true })
  })

  it('prefers the handler of the command itself', async () => {
    const calls: string[] = []
    const endpoint = await dimmableLight({
      step: async () => {
        calls.push('step')
      },
      moveToLevel: async () => {
        calls.push('moveToLevel')
      },
    })

    await invoke(endpoint, 'levelControl', 'stepWithOnOff', {
      stepMode: 0,
      stepSize: 40,
      transitionTime: 0,
      ...options,
    })

    expect(calls).toEqual(['step'])
  })

  it('does not fail Stop when the plugin has no stop handler', async () => {
    const endpoint = await dimmableLight({
      moveToLevel: async () => {},
    })

    await expect(invoke(endpoint, 'levelControl', 'stop', options)).resolves.toBeUndefined()
  })
})

describe('serviceArea on a real node', () => {
  /** A robot vacuum that is cleaning area 1 of the selected areas 1 and 2. */
  function vacuum(serviceAreaHandlers: Record<string, (request: unknown) => Promise<void>>) {
    return register({
      deviceType: deviceTypes.RoboticVacuumCleaner,
      clusters: {
        rvcRunMode: {
          supportedModes: [
            {
              label: 'Idle',
              mode: 0,
              modeTags: [
                { value: 16384 },
              ],
            },
            {
              label: 'Clean',
              mode: 1,
              modeTags: [
                { value: 16385 },
              ],
            },
          ],
          currentMode: 1,
        },
        rvcOperationalState: {
          operationalStateList: [
            { operationalStateId: 0 },
            { operationalStateId: 1 },
            { operationalStateId: 2 },
            { operationalStateId: 3 },
            { operationalStateId: 64 },
            { operationalStateId: 65 },
            { operationalStateId: 66 },
          ],
          operationalState: 1,
        },
        serviceArea: {
          supportedAreas: [
            {
              areaId: 1,
              mapId: null,
              areaInfo: {
                locationInfo: { locationName: 'Kitchen', floorNumber: 0, areaType: null },
                landmarkInfo: null,
              },
            },
            {
              areaId: 2,
              mapId: null,
              areaInfo: {
                locationInfo: { locationName: 'Hall', floorNumber: 0, areaType: null },
                landmarkInfo: null,
              },
            },
          ],
          selectedAreas: [1, 2],
          currentArea: 1,
          progress: [
            { areaId: 1, status: 1 },
            { areaId: 2, status: 0 },
          ],
        },
      },
      handlers: {
        rvcRunMode: {
          changeToMode: async () => {},
        },
        rvcOperationalState: {
          pause: async () => {},
          resume: async () => {},
          goHome: async () => {},
        },
        serviceArea: serviceAreaHandlers,
      },
    })
  }

  it('refuses SelectAreas for an area the vacuum does not have, without calling the plugin', async () => {
    const requests: unknown[] = []
    const endpoint = await vacuum({
      selectAreas: async (request) => {
        requests.push(request)
      },
    })

    const response = await invoke(endpoint, 'serviceArea', 'selectAreas', {
      newAreas: [99],
    })

    // 1 = UnsupportedArea
    expect(response).toMatchObject({ status: 1 })
    expect(requests).toEqual([])
    expect(stateOf(endpoint, 'serviceArea').selectedAreas).toEqual([1, 2])
  })

  it('calls the plugin for a valid SelectAreas and stores the selection', async () => {
    const requests: unknown[] = []
    const endpoint = await vacuum({
      selectAreas: async (request) => {
        requests.push(request)
      },
    })

    const response = await invoke(endpoint, 'serviceArea', 'selectAreas', {
      newAreas: [2],
    })

    expect(response).toMatchObject({ status: 0 })
    expect(requests).toEqual([
      {
        newAreas: [2],
      },
    ])
    expect(stateOf(endpoint, 'serviceArea').selectedAreas).toEqual([2])
  })

  it('answers SkipArea with success after the plugin handler ran', async () => {
    const requests: unknown[] = []
    const endpoint = await vacuum({
      selectAreas: async () => {},
      skipArea: async (request) => {
        requests.push(request)
      },
    })

    const response = await invoke(endpoint, 'serviceArea', 'skipArea', { skippedArea: 1 })

    expect(requests).toEqual([
      { skippedArea: 1 },
    ])
    expect(response).toMatchObject({ status: 0 })
  })

  it('refuses SkipArea for an area that is not selected, without calling the plugin', async () => {
    const requests: unknown[] = []
    const endpoint = await vacuum({
      selectAreas: async () => {},
      skipArea: async (request) => {
        requests.push(request)
      },
    })

    const response = await invoke(endpoint, 'serviceArea', 'skipArea', { skippedArea: 99 })

    // 3 = InvalidSkippedArea
    expect(response).toMatchObject({ status: 3 })
    expect(requests).toEqual([])
  })
})

describe('attribute-change handlers on a real node', () => {
  /** A fan that is off, recording the calls of its two change handlers. */
  async function fan(calls: unknown[]) {
    return register({
      deviceType: deviceTypes.Fan,
      clusters: {
        fanControl: {
          fanMode: 0,
          fanModeSequence: 0,
          percentSetting: 0,
          percentCurrent: 0,
        },
      },
      handlers: {
        fanControl: {
          fanModeChange: async (request) => {
            calls.push(request)
          },
          percentSettingChange: async (request) => {
            calls.push(request)
          },
        },
      },
    })
  }

  /** A thermostat that is off, recording the calls of its change handlers. */
  async function thermostat(calls: unknown[]) {
    return register({
      deviceType: deviceTypes.Thermostat,
      clusters: {
        thermostat: {
          localTemperature: 2000,
          occupiedHeatingSetpoint: 2000,
          occupiedCoolingSetpoint: 2600,
          systemMode: 0,
          controlSequenceOfOperation: 4,
          minSetpointDeadBand: 20,
        },
      },
      handlers: {
        thermostat: {
          systemModeChange: async (request) => {
            calls.push(request)
          },
          occupiedHeatingSetpointChange: async (request) => {
            calls.push(request)
          },
          occupiedCoolingSetpointChange: async (request) => {
            calls.push(request)
          },
        },
      },
    })
  }

  it('does not call the fan handlers for the state a plugin reports', async () => {
    const calls: unknown[] = []
    const endpoint = await fan(calls)

    await stateManager.updateAccessoryState('test-uuid', 'fanControl', { fanMode: 3, percentSetting: 100, percentCurrent: 100 })
    await settle()

    expect(calls).toEqual([])
    expect(stateOf(endpoint, 'fanControl')).toMatchObject({ fanMode: 3, percentSetting: 100 })
  })

  it('does not call the thermostat handlers for the state a plugin reports', async () => {
    const calls: unknown[] = []
    const endpoint = await thermostat(calls)

    await stateManager.updateAccessoryState('test-uuid', 'thermostat', { systemMode: 4, occupiedHeatingSetpoint: 2150, occupiedCoolingSetpoint: 2500 })
    await settle()

    expect(calls).toEqual([])
    expect(stateOf(endpoint, 'thermostat')).toMatchObject({ systemMode: 4, occupiedHeatingSetpoint: 2150, occupiedCoolingSetpoint: 2500 })
  })

  it('calls the handlers for a change the homebridge ui asks for', async () => {
    const calls: unknown[] = []
    await fan(calls)

    await stateManager.updateAccessoryState('test-uuid', 'fanControl', { fanMode: 3 }, undefined, { callHandlers: true })
    await settle()

    expect(calls).toEqual([
      { fanMode: 3, oldFanMode: 0 },
    ])
  })

  it('calls the handlers for a change a controller writes', async () => {
    const calls: unknown[] = []
    const endpoint = await thermostat(calls)

    await write(endpoint, {
      thermostat: { occupiedHeatingSetpoint: 2100 },
    })
    await settle()

    expect(calls).toEqual([
      { occupiedHeatingSetpoint: 2100, oldOccupiedHeatingSetpoint: 2000 },
    ])
  })

  it('calls the handler again when a controller asks for the value a plugin reported earlier', async () => {
    const calls: unknown[] = []
    const endpoint = await fan(calls)

    await stateManager.updateAccessoryState('test-uuid', 'fanControl', { fanMode: 3 })
    await settle()
    await write(endpoint, {
      fanControl: { fanMode: 0 },
    })
    await settle()
    await write(endpoint, {
      fanControl: { fanMode: 3 },
    })
    await settle()

    expect(calls).toEqual([
      { fanMode: 0, oldFanMode: 3 },
      { fanMode: 3, oldFanMode: 0 },
    ])
  })

  it('does not hold a report back for the next request when the reported value is the current one', async () => {
    const calls: unknown[] = []
    const endpoint = await fan(calls)

    // nothing changes, so no change event comes to use the note up
    await stateManager.updateAccessoryState('test-uuid', 'fanControl', { fanMode: 0 })
    await write(endpoint, {
      fanControl: { fanMode: 3 },
    })
    await settle()
    await write(endpoint, {
      fanControl: { fanMode: 0 },
    })
    await settle()

    expect(calls).toEqual([
      { fanMode: 3, oldFanMode: 0 },
      { fanMode: 0, oldFanMode: 3 },
    ])
  })
})

describe('an attribute-change handler that fails, on a real node', () => {
  /** A handler that always fails, counting its calls. */
  function failing(calls: unknown[]) {
    return async (request: unknown) => {
      calls.push(request)
      throw new Error('device offline')
    }
  }

  const thermostatState = {
    localTemperature: 2000,
    occupiedHeatingSetpoint: 2000,
    occupiedCoolingSetpoint: 2600,
    systemMode: 0,
    controlSequenceOfOperation: 4,
    minSetpointDeadBand: 20,
  }

  it('puts the fan mode back', async () => {
    const calls: unknown[] = []
    const endpoint = await register({
      deviceType: deviceTypes.Fan,
      clusters: {
        fanControl: {
          fanMode: 0,
          fanModeSequence: 0,
          percentSetting: 0,
          percentCurrent: 0,
        },
      },
      handlers: {
        fanControl: {
          fanModeChange: failing(calls),
        },
      },
    })

    await write(endpoint, {
      fanControl: { fanMode: 3 },
    })
    await settle()

    expect(stateOf(endpoint, 'fanControl').fanMode).toBe(0)
    // called for the request only, not again for the write back
    expect(calls).toEqual([
      { fanMode: 3, oldFanMode: 0 },
    ])
  })

  it('puts the fan speed back', async () => {
    const calls: unknown[] = []
    const endpoint = await register({
      deviceType: deviceTypes.Fan,
      clusters: {
        fanControl: {
          fanMode: 3,
          fanModeSequence: 0,
          percentSetting: 40,
          percentCurrent: 40,
        },
      },
      handlers: {
        fanControl: {
          percentSettingChange: failing(calls),
        },
      },
    })

    await write(endpoint, {
      fanControl: { percentSetting: 80 },
    })
    await settle()

    expect(stateOf(endpoint, 'fanControl').percentSetting).toBe(40)
    expect(calls).toHaveLength(1)
  })

  it('puts the thermostat mode back', async () => {
    const calls: unknown[] = []
    const endpoint = await register({
      deviceType: deviceTypes.Thermostat,
      clusters: { thermostat: thermostatState },
      handlers: {
        thermostat: {
          systemModeChange: failing(calls),
        },
      },
    })

    await write(endpoint, {
      thermostat: { systemMode: 4 },
    })
    await settle()

    expect(stateOf(endpoint, 'thermostat').systemMode).toBe(0)
    expect(calls).toHaveLength(1)
  })

  it.each([
    {
      attribute: 'occupiedHeatingSetpoint',
      handler: 'occupiedHeatingSetpointChange',
      old: 2000,
      asked: 2100,
    },
    {
      attribute: 'occupiedCoolingSetpoint',
      handler: 'occupiedCoolingSetpointChange',
      old: 2600,
      asked: 2500,
    },
  ])('puts the thermostat $attribute back', async ({ attribute, handler, old, asked }) => {
    const calls: unknown[] = []
    const endpoint = await register({
      deviceType: deviceTypes.Thermostat,
      clusters: { thermostat: thermostatState },
      handlers: {
        thermostat: {
          [handler]: failing(calls),
        },
      },
    })

    await write(endpoint, {
      thermostat: { [attribute]: asked },
    })
    await settle()

    expect(stateOf(endpoint, 'thermostat')[attribute]).toBe(old)
    expect(calls).toHaveLength(1)
  })

  it('still calls the handler for the next request after a failure', async () => {
    const calls: unknown[] = []
    const endpoint = await register({
      deviceType: deviceTypes.Fan,
      clusters: {
        fanControl: {
          fanMode: 0,
          fanModeSequence: 0,
          percentSetting: 0,
          percentCurrent: 0,
        },
      },
      handlers: {
        fanControl: {
          fanModeChange: failing(calls),
        },
      },
    })

    await write(endpoint, {
      fanControl: { fanMode: 3 },
    })
    await settle()
    await write(endpoint, {
      fanControl: { fanMode: 3 },
    })
    await settle()

    expect(calls).toHaveLength(2)
    expect(stateOf(endpoint, 'fanControl').fanMode).toBe(0)
  })
})

describe('a closure on a real node', () => {
  const closureControl = {
    mainState: 0,
    currentErrorList: [],
    overallCurrentState: { position: 0, secureState: true },
    overallTargetState: { position: 0 },
  }

  it('registers from closureControl state alone, tagged as a garage door', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.Closure,
      clusters: { closureControl },
    })

    expect(stateOf(endpoint, 'closureControl').mainState).toBe(0)
    // Matter wants exactly one tag from the Closure namespace (0x44); 5 = garage door
    expect(stateOf(endpoint, 'descriptor').tagList).toEqual([
      expect.objectContaining({ namespaceId: 0x44, tag: 5 }),
    ])
  })

  it('keeps the closure tag a plugin chose', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.Closure,
      clusters: {
        closureControl,
        // 4 = gate
        descriptor: {
          tagList: [
            { mfgCode: null, namespaceId: 0x44, tag: 4 },
          ],
        },
      },
    })

    expect(stateOf(endpoint, 'descriptor').tagList).toEqual([
      expect.objectContaining({ namespaceId: 0x44, tag: 4 }),
    ])
  })
})

describe('window coverings on a real node', () => {
  const handlers = {
    windowCovering: {
      upOrOpen: async () => {},
    },
  }
  const lift = { currentPositionLiftPercent100ths: 0, targetPositionLiftPercent100ths: 0 }
  const tilt = { currentPositionTiltPercent100ths: 0, targetPositionTiltPercent100ths: 0 }

  it('registers a blind that declares its lift position and no configStatus', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.WindowCovering,
      clusters: {
        windowCovering: { ...lift },
      },
      handlers,
    })

    expect(stateOf(endpoint, 'windowCovering')).toMatchObject({
      currentPositionLiftPercent100ths: 0,
      configStatus: expect.objectContaining({ liftPositionAware: true }),
    })
  })

  it('registers a blind that declares lift and tilt positions and no configStatus', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.WindowCovering,
      clusters: {
        windowCovering: {
          ...lift,
          ...tilt,
        },
      },
      handlers,
    })

    expect(stateOf(endpoint, 'windowCovering')).toMatchObject({
      currentPositionTiltPercent100ths: 0,
      configStatus: expect.objectContaining({ liftPositionAware: true, tiltPositionAware: true }),
    })
  })

  it('leaves the plugin context alone', async () => {
    const context = { mine: 1 }
    await new AccessoryManager().registerAccessory('homebridge-test', 'Test', {
      UUID: 'test-uuid',
      displayName: 'Test',
      serialNumber: 'serial',
      manufacturer: 'maker',
      model: 'model',
      context,
      deviceType: deviceTypes.WindowCovering,
      clusters: {
        windowCovering: { ...lift },
      },
      handlers,
    }, deps)

    expect(context).toEqual({ mine: 1 })
  })

  it('registers a tilt-only blind and keeps the type its plugin set', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.WindowCovering,
      // 6 = shutter, which Matter allows for a tilt-only covering
      clusters: {
        windowCovering: {
          ...tilt,
          type: 6,
          endProductType: 22,
          configStatus: { tiltPositionAware: true },
        },
      },
      handlers,
    })

    expect(stateOf(endpoint, 'windowCovering')).toMatchObject({ type: 6, endProductType: 22 })
  })

  it('registers a tilt-only blind that names no type', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.WindowCovering,
      clusters: {
        windowCovering: {
          ...tilt,
          configStatus: { tiltPositionAware: true },
        },
      },
      handlers,
    })

    // 7 = tilt blind, tilt only; 9 = tilt-only interior blind
    expect(stateOf(endpoint, 'windowCovering')).toMatchObject({ type: 7, endProductType: 9 })
  })

  it('registers a blind with lift and tilt that names no type', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.WindowCovering,
      clusters: {
        windowCovering: {
          ...lift,
          ...tilt,
          configStatus: { liftPositionAware: true, tiltPositionAware: true },
        },
      },
      handlers,
    })

    // 8 = tilt blind with lift; 10 = interior blind
    expect(stateOf(endpoint, 'windowCovering')).toMatchObject({ type: 8, endProductType: 10 })
  })
})

describe('clusters that answer with their own status, on a real node', () => {
  /** A media player whose sendKey and play handlers run `handler`. */
  function mediaPlayer(handler: () => Promise<void>) {
    return register({
      deviceType: deviceTypes.MediaPlayer,
      clusters: {
        onOff: { onOff: true },
        mediaPlayback: { currentState: 0 },
      },
      handlers: {
        keypadInput: { sendKey: handler },
        mediaPlayback: { play: handler },
      },
    })
  }

  const failing = async () => {
    throw new Error('device offline')
  }
  const busy = async () => {
    throw new MatterStatus.Busy('tv is starting')
  }

  it('reports a failed sendKey handler as an unsupported key, not as a failed command', async () => {
    const endpoint = await mediaPlayer(failing)

    // 1 = UnsupportedKey
    await expect(invoke(endpoint, 'keypadInput', 'sendKey', { keyCode: 1 })).resolves.toEqual({ status: 1 })
  })

  it('reports a failed play handler as invalid state, not as a failed command', async () => {
    const endpoint = await mediaPlayer(failing)

    // 1 = InvalidStateForCommand
    await expect(invoke(endpoint, 'mediaPlayback', 'play')).resolves.toEqual({ status: 1 })
  })

  it('still passes on a matter status the plugin threw on purpose', async () => {
    const endpoint = await mediaPlayer(busy)

    await expect(invoke(endpoint, 'keypadInput', 'sendKey', { keyCode: 1 })).rejects.toThrow('tv is starting')
    await expect(invoke(endpoint, 'mediaPlayback', 'play')).rejects.toThrow('tv is starting')
  })
})

describe('thermostat SetpointRaiseLower on a real node', () => {
  const thermostatState = {
    localTemperature: 2000,
    occupiedHeatingSetpoint: 2000,
    occupiedCoolingSetpoint: 2600,
    systemMode: 4,
    controlSequenceOfOperation: 4,
    minSetpointDeadBand: 20,
  }

  it('works with only a setpoint-change handler, which is told the new value', async () => {
    const calls: unknown[] = []
    const endpoint = await register({
      deviceType: deviceTypes.Thermostat,
      clusters: { thermostat: thermostatState },
      handlers: {
        thermostat: {
          occupiedHeatingSetpointChange: async (request) => {
            calls.push(request)
          },
        },
      },
    })

    // mode 0 = heat, amount in tenths of a degree
    await invoke(endpoint, 'thermostat', 'setpointRaiseLower', { mode: 0, amount: 10 })
    await settle()

    expect(stateOf(endpoint, 'thermostat').occupiedHeatingSetpoint).toBe(2100)
    expect(calls).toEqual([
      { occupiedHeatingSetpoint: 2100, oldOccupiedHeatingSetpoint: 2000 },
    ])
  })

  it('calls a setpointRaiseLower handler with the request when the plugin has one', async () => {
    const requests: unknown[] = []
    const endpoint = await register({
      deviceType: deviceTypes.Thermostat,
      clusters: { thermostat: thermostatState },
      handlers: {
        thermostat: {
          setpointRaiseLower: async (request) => {
            requests.push(request)
          },
        },
      },
    })

    await invoke(endpoint, 'thermostat', 'setpointRaiseLower', { mode: 0, amount: 10 })

    expect(requests).toEqual([
      { mode: 0, amount: 10 },
    ])
    expect(stateOf(endpoint, 'thermostat').occupiedHeatingSetpoint).toBe(2100)
  })
})

describe('colorControl on a real node', () => {
  // colorMode 2 = color temperature, so a hue command has to switch the mode first
  const colorState = {
    colorMode: 2,
    enhancedColorMode: 2,
    colorTemperatureMireds: 250,
    colorTempPhysicalMinMireds: 147,
    colorTempPhysicalMaxMireds: 454,
    coupleColorTempToLevelMinMireds: 147,
    startUpColorTemperatureMireds: 250,
    currentHue: 0,
    currentSaturation: 0,
    currentX: 24939,
    currentY: 24701,
    numberOfPrimaries: 0,
    colorCapabilities: { hueSaturation: true, xy: true, colorTemperature: true },
    remainingTime: 0,
  }

  async function colorLight(names: string[], calls: string[]): Promise<Endpoint> {
    const handlers: Record<string, () => Promise<void>> = {}
    for (const name of names) {
      handlers[name] = async () => {
        calls.push(name)
      }
    }
    return register({
      deviceType: deviceTypes.ExtendedColorLight,
      clusters: {
        onOff: { onOff: true },
        levelControl: { currentLevel: 100 },
        colorControl: colorState,
      },
      handlers: { colorControl: handlers },
    })
  }

  const all = [
    'moveToColorTemperatureLogic',
    'moveToHueAndSaturationLogic',
    'moveToColorLogic',
    'moveToHueLogic',
    'moveToSaturationLogic',
    'stopAllColorMovement',
  ]
  const hueAndSaturation = {
    hue: 100,
    saturation: 200,
    transitionTime: 0,
    optionsMask: {},
    optionsOverride: {},
  }

  it('calls the stop handler for the StopMoveStep command', async () => {
    const calls: string[] = []
    const endpoint = await colorLight(all, calls)

    await invoke(endpoint, 'colorControl', 'stopMoveStep', { optionsMask: {}, optionsOverride: {} })

    expect(calls).toEqual(['stopAllColorMovement'])
  })

  it('finishes a command whose handler waits for its own update of the colour state', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.ExtendedColorLight,
      clusters: {
        onOff: { onOff: true },
        levelControl: { currentLevel: 100 },
        colorControl: colorState,
      },
      handlers: {
        colorControl: {
          // matter.js writes the colour mode, and so holds the colour state, before it calls this
          moveToHueAndSaturationLogic: async () => {
            await stateManager.updateAccessoryState('test-uuid', 'colorControl', { currentX: 30000 })
          },
          // the colour features come from the handlers there are
          moveToColorLogic: async () => {},
          moveToColorTemperatureLogic: async () => {},
        },
      },
    })

    const outcome = await Promise.race([
      invoke(endpoint, 'colorControl', 'moveToHueAndSaturation', hueAndSaturation).then(() => 'done'),
      new Promise(resolve => setTimeout(resolve, 3000, 'hung')),
    ])
    await settle()

    expect(outcome).toBe('done')
    expect(stateOf(endpoint, 'colorControl')).toMatchObject({ currentHue: 100, currentSaturation: 200, currentX: 30000 })
  })

  it('calls one handler for MoveToHueAndSaturation, also when the color mode has to change', async () => {
    const calls: string[] = []
    const endpoint = await colorLight(all, calls)

    await invoke(endpoint, 'colorControl', 'moveToHueAndSaturation', hueAndSaturation)

    expect(calls).toEqual(['moveToHueAndSaturationLogic'])
    expect(stateOf(endpoint, 'colorControl')).toMatchObject({ currentHue: 100, currentSaturation: 200, colorMode: 0 })
  })

  it('calls the hue and the saturation handler when the plugin has no combined one', async () => {
    const calls: string[] = []
    const endpoint = await colorLight(['moveToHueLogic', 'moveToSaturationLogic'], calls)

    await invoke(endpoint, 'colorControl', 'moveToHueAndSaturation', hueAndSaturation)

    expect(calls).toEqual(['moveToHueLogic', 'moveToSaturationLogic'])
    expect(stateOf(endpoint, 'colorControl')).toMatchObject({ currentHue: 100, currentSaturation: 200 })
  })

  it('still calls the hue handler for a hue command that comes after a combined one', async () => {
    const calls: string[] = []
    const endpoint = await colorLight(all, calls)

    await invoke(endpoint, 'colorControl', 'moveToHueAndSaturation', hueAndSaturation)
    await invoke(endpoint, 'colorControl', 'moveToHue', {
      hue: 50,
      direction: 0,
      transitionTime: 0,
      optionsMask: {},
      optionsOverride: {},
    })

    expect(calls).toEqual(['moveToHueAndSaturationLogic', 'moveToHueLogic'])
  })
})

describe('errors a plugin gets back, on a real node', () => {
  it('names the attribute that was wrong when a registration fails, and keeps the cause', async () => {
    const error: Error = await register({
      deviceType: deviceTypes.DimmableLight,
      clusters: {
        onOff: { onOff: true },
        levelControl: { currentLevel: 300 },
      },
    }).then(() => new Error('registered'), failure => failure)

    expect(error.message).toMatch(/^Failed to register accessory: /)
    expect(error.message).toContain('currentLevel')
    expect(error.message).toContain('254')
    expect(error.cause).toBeInstanceOf(Error)
  })

  it('says what was wrong when a state update fails, and keeps the cause', async () => {
    await register({
      deviceType: deviceTypes.DimmableLight,
      clusters: {
        onOff: { onOff: true },
        levelControl: { currentLevel: 100 },
      },
    })

    const error: Error = await stateManager.updateAccessoryState('test-uuid', 'levelControl', { currentLevel: 300 })
      .then(() => new Error('updated'), failure => failure)

    expect(error.message).toMatch(/^Failed to update accessory state: /)
    expect(error.message).toContain('levelControl')
    expect(error.message).toContain('Value 300')
    expect(error.message).toContain('254')
    expect(error.cause).toBeInstanceOf(Error)
  })

  it('does not wrap its own error a second time', async () => {
    const error: Error = await stateManager.updateAccessoryState('no-such-uuid', 'onOff', { onOff: true })
      .then(() => new Error('updated'), failure => failure)

    expect(error.message).toBe('Accessory no-such-uuid not found or not registered')
  })
})

describe('a registration that fails, on a real node', () => {
  it('leaves no handlers or part mappings behind, and a corrected retry works', async () => {
    const light = (currentLevel: number) => ({
      deviceType: deviceTypes.DimmableLight,
      clusters: {
        onOff: { onOff: true },
        levelControl: { currentLevel },
      },
      handlers: {
        onOff: {
          on: async () => {},
        },
      },
    })
    const withParts = (secondLevel: number) => ({
      deviceType: deviceTypes.BridgedNode,
      clusters: {},
      parts: [
        {
          id: 'a',
          displayName: 'A',
          ...light(100),
        },
        {
          id: 'b',
          displayName: 'B',
          ...light(secondLevel),
        },
      ],
    })

    // matter.js only passes on which part failed (the reason is in its log)
    await expect(register(withParts(300) as never)).rejects.toThrow(/test-uuid-part-b/)

    expect(accessories.has('test-uuid')).toBe(false)
    expect(deps.behaviorRegistry.getStats()).toMatchObject({ partCount: 0, handlerCount: 0 })

    await register(withParts(120) as never)
    expect(deps.behaviorRegistry.getStats()).toMatchObject({ partCount: 2, handlerCount: 2 })
  })
})

describe('the context a handler is given, on a real node', () => {
  it('names the accessory for a handler of the accessory itself', async () => {
    const seen: unknown[] = []
    const endpoint = await register({
      deviceType: deviceTypes.OnOffLight,
      clusters: {
        onOff: { onOff: false },
      },
      handlers: {
        onOff: {
          on: async (_args, context) => {
            seen.push(context)
          },
        },
      },
    })

    await invoke(endpoint, 'onOff', 'on')

    expect(seen).toEqual([
      { uuid: 'test-uuid' },
    ])
  })

  it('names the accessory and the part for a handler of a part', async () => {
    const seen: unknown[] = []
    const outlet = (id: string) => ({
      id,
      displayName: id,
      deviceType: deviceTypes.OnOffOutlet,
      clusters: {
        onOff: { onOff: false },
      },
      handlers: {
        onOff: {
          // one handler for every part, as the docs show
          on: async (_args: unknown, context: { uuid: string, partId?: string }) => {
            seen.push(context)
          },
        },
      },
    })
    await register({
      deviceType: deviceTypes.BridgedNode,
      clusters: {},
      parts: [
        outlet('left'),
        outlet('right'),
      ],
    } as never)

    const parts = accessories.get('test-uuid')!._parts!
    const right = parts.find(part => part.id === 'right')!.endpoint as Endpoint
    await invoke(right, 'onOff', 'on')

    expect(seen).toEqual([
      { uuid: 'test-uuid', partId: 'right' },
    ])
  })
})

describe('texts longer than Matter allows, on a real node', () => {
  it('shortens a name by bytes, so matter.js 0.18.1 (which counts bytes) still takes it', async () => {
    await new AccessoryManager().registerAccessory('homebridge-test', 'Test', {
      UUID: 'test-uuid',
      // 20 characters, 40 bytes
      displayName: 'ü'.repeat(20),
      serialNumber: '客厅的灯'.repeat(4),
      manufacturer: `${'A'.repeat(31)}😀 Lamp`,
      model: 'model',
      context: {},
      deviceType: deviceTypes.OnOffLight,
      clusters: {
        onOff: { onOff: false },
      },
    }, deps)

    const info = stateOf(accessories.get('test-uuid')!.endpoint as Endpoint, 'bridgedDeviceBasicInformation') as Record<string, string>
    expect(info.nodeLabel).toBe('ü'.repeat(16))
    expect(info.serialNumber).toBe('客厅的灯客厅的灯客厅')
    expect(info.vendorName).toBe('A'.repeat(31))
    for (const text of [info.nodeLabel, info.serialNumber, info.vendorName]) {
      expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(32)
      expect(text.isWellFormed()).toBe(true)
    }
  })
})

describe('a thermostat matter.js refuses, on a real node', () => {
  it('fails its own registration with the reason, and leaves no rejection for Node to end Homebridge on', async () => {
    const unhandled: unknown[] = []
    const note = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', note)

    try {
      // matter.js's own thermostat set-up is async, and refuses some thermostats
      // (a deprecated feature, limits it can not reconcile). Make it refuse this one.
      const matterThermostat = Object.getPrototypeOf(HomebridgeThermostatServer.prototype) as { initialize: () => Promise<void> }
      vi.spyOn(matterThermostat, 'initialize').mockImplementation(async () => {
        throw new Error('matter.js refused this thermostat')
      })

      const error: Error = await register({
        deviceType: deviceTypes.Thermostat,
        clusters: {
          thermostat: {
            localTemperature: 2000,
            occupiedHeatingSetpoint: 2000,
            systemMode: 4,
            controlSequenceOfOperation: 2,
          },
        },
        // with a handler, Homebridge's own thermostat class is on the endpoint
        handlers: {
          thermostat: {
            systemModeChange: async () => {},
          },
        },
      }).then(() => new Error('registered'), failure => failure)
      await settle()

      expect(error.message).toMatch(/^Failed to register accessory: /)
      expect(error.message).toContain('matter.js refused this thermostat')
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', note)
    }
  })
})

describe('a command the plugin has no handler for, on a real node', () => {
  it('turns a light off in Matter when the plugin only has an on handler', async () => {
    const calls: string[] = []
    const endpoint = await register({
      deviceType: deviceTypes.OnOffLight,
      clusters: {
        onOff: { onOff: true },
      },
      handlers: {
        onOff: {
          on: async () => {
            calls.push('on')
          },
        },
      },
    })

    await invoke(endpoint, 'onOff', 'off')

    expect(stateOf(endpoint, 'onOff').onOff).toBe(false)
    expect(calls).toEqual([])
  })

  it('locks a door lock in Matter when the plugin only has an unlock handler', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.DoorLock,
      clusters: {
        doorLock: {
          lockState: 2,
          lockType: 0,
          actuatorEnabled: true,
          operatingMode: 0,
        },
      },
      handlers: {
        doorLock: {
          unlockDoor: async () => {},
        },
      },
    })

    await invoke(endpoint, 'doorLock', 'lockDoor', {})

    // 1 = locked
    expect(stateOf(endpoint, 'doorLock').lockState).toBe(1)
  })

  it('tells a blind with only a go-to-percentage handler to open and to close', async () => {
    const requests: unknown[] = []
    const endpoint = await register({
      deviceType: deviceTypes.WindowCovering,
      clusters: {
        windowCovering: {
          type: 0,
          endProductType: 0,
          configStatus: { operational: true, liftPositionAware: true },
          targetPositionLiftPercent100ths: 5000,
          currentPositionLiftPercent100ths: 5000,
        },
      },
      handlers: {
        windowCovering: {
          goToLiftPercentage: async (request) => {
            requests.push(request)
          },
        },
      },
    })

    await invoke(endpoint, 'windowCovering', 'upOrOpen')
    await invoke(endpoint, 'windowCovering', 'downOrClose')

    // 0 is fully open, 10000 fully closed
    expect(requests).toEqual([
      { liftPercent100thsValue: 0 },
      { liftPercent100thsValue: 10000 },
    ])
    expect(stateOf(endpoint, 'windowCovering').targetPositionLiftPercent100ths).toBe(10000)
  })
})

describe('two commands sent together, on a real node', () => {
  const slow = (calls: string[], name: string) => async () => {
    await new Promise(resolve => setTimeout(resolve, 30))
    calls.push(name)
  }

  it('lets both succeed when a controller sends set-level and on as a pair', async () => {
    const calls: string[] = []
    const endpoint = await register({
      deviceType: deviceTypes.DimmableLight,
      clusters: {
        onOff: { onOff: false },
        levelControl: { currentLevel: 100 },
      },
      handlers: {
        onOff: {
          on: slow(calls, 'on'),
          off: slow(calls, 'off'),
        },
        levelControl: {
          moveToLevelWithOnOff: slow(calls, 'level'),
        },
      },
    })

    const results = await Promise.allSettled([
      invoke(endpoint, 'levelControl', 'moveToLevelWithOnOff', {
        level: 200,
        transitionTime: 0,
        optionsMask: {},
        optionsOverride: {},
      }),
      invoke(endpoint, 'onOff', 'on'),
    ])

    expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled'])
    expect(stateOf(endpoint, 'onOff').onOff).toBe(true)
    expect(stateOf(endpoint, 'levelControl').currentLevel).toBe(200)
  })

  it('ends in the state of the last handler that ran, for on and off together', async () => {
    const calls: string[] = []
    const endpoint = await register({
      deviceType: deviceTypes.OnOffLight,
      clusters: {
        onOff: { onOff: false },
      },
      handlers: {
        onOff: {
          on: slow(calls, 'on'),
          off: slow(calls, 'off'),
        },
      },
    })

    const results = await Promise.allSettled([
      invoke(endpoint, 'onOff', 'on'),
      invoke(endpoint, 'onOff', 'off'),
    ])

    expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled'])
    expect(calls).toEqual(['on', 'off'])
    expect(stateOf(endpoint, 'onOff').onOff).toBe(false)
  })

  it('lets the same command sent twice succeed both times', async () => {
    const calls: string[] = []
    const endpoint = await register({
      deviceType: deviceTypes.OnOffLight,
      clusters: {
        onOff: { onOff: false },
      },
      handlers: {
        onOff: {
          on: slow(calls, 'on'),
        },
      },
    })

    const results = await Promise.allSettled([
      invoke(endpoint, 'onOff', 'on'),
      invoke(endpoint, 'onOff', 'on'),
    ])

    expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled'])
  })
})

describe('a robot vacuum with state and no handlers, on a real node', () => {
  it('keeps its clean mode and service area clusters', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.RoboticVacuumCleaner,
      clusters: {
        rvcRunMode: {
          supportedModes: [
            {
              label: 'Idle',
              mode: 0,
              modeTags: [
                { value: 16384 },
              ],
            },
            {
              label: 'Clean',
              mode: 1,
              modeTags: [
                { value: 16385 },
              ],
            },
          ],
          currentMode: 0,
        },
        rvcOperationalState: {
          operationalStateList: [
            { operationalStateId: 0 },
            { operationalStateId: 1 },
            { operationalStateId: 2 },
            { operationalStateId: 3 },
            { operationalStateId: 64 },
            { operationalStateId: 65 },
            { operationalStateId: 66 },
          ],
          operationalState: 0,
        },
        rvcCleanMode: {
          supportedModes: [
            {
              label: 'Vacuum',
              mode: 0,
              modeTags: [
                { value: 16385 },
              ],
            },
            {
              label: 'Mop',
              mode: 1,
              modeTags: [
                { value: 16386 },
              ],
            },
          ],
          currentMode: 1,
        },
        serviceArea: {
          supportedAreas: [
            {
              areaId: 1,
              mapId: null,
              areaInfo: {
                locationInfo: { locationName: 'Kitchen', floorNumber: 0, areaType: null },
                landmarkInfo: null,
              },
            },
          ],
          selectedAreas: [1],
        },
      },
    })

    expect(stateOf(endpoint, 'rvcCleanMode')).toMatchObject({ currentMode: 1 })
    expect(stateOf(endpoint, 'serviceArea')).toMatchObject({
      selectedAreas: [1],
    })
  })
})

describe('a window covering with state and no handlers, on a real node', () => {
  it('answers open and close by moving in Matter, not with an internal error', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.WindowCovering,
      clusters: {
        windowCovering: {
          type: 0,
          endProductType: 0,
          configStatus: { operational: true, liftPositionAware: true },
          targetPositionLiftPercent100ths: 5000,
          currentPositionLiftPercent100ths: 5000,
        },
      },
    })

    await invoke(endpoint, 'windowCovering', 'downOrClose')
    expect(stateOf(endpoint, 'windowCovering').targetPositionLiftPercent100ths).toBe(10000)

    await invoke(endpoint, 'windowCovering', 'upOrOpen')
    expect(stateOf(endpoint, 'windowCovering').targetPositionLiftPercent100ths).toBe(0)
  })
})

describe('an ev charger on a real node', () => {
  /** A charger with the given supply state and energyEvse handlers. */
  function charger(supplyState: number, handlers: Record<string, (request: unknown) => Promise<void>>) {
    return register({
      deviceType: deviceTypes.EnergyEvse,
      clusters: {
        energyEvse: {
          state: 0,
          supplyState,
          faultState: 0,
          chargingEnabledUntil: null,
          circuitCapacity: 32000,
          minimumChargeCurrent: 6000,
          maximumChargeCurrent: 32000,
          sessionId: null,
          sessionDuration: null,
          sessionEnergyCharged: null,
        },
        energyEvseMode: {
          supportedModes: [
            {
              label: 'Manual',
              mode: 0,
              modeTags: [
                { value: 16384 },
              ],
            },
            {
              label: 'Auto',
              mode: 1,
              modeTags: [
                { value: 16385 },
              ],
            },
          ],
          currentMode: 0,
        },
      },
      handlers: { energyEvse: handlers },
    })
  }

  it('refuses StartDiagnostics on a charger that is not disabled, without calling the plugin', async () => {
    const calls: string[] = []
    const endpoint = await charger(1, {
      startDiagnostics: async () => {
        calls.push('startDiagnostics')
      },
    })

    await expect(invoke(endpoint, 'energyEvse', 'startDiagnostics')).rejects.toThrow('Diagnostics can only start when the charger is disabled')

    expect(calls).toEqual([])
    expect(stateOf(endpoint, 'energyEvse').supplyState).toBe(1)
  })

  it('calls the plugin for StartDiagnostics on a disabled charger', async () => {
    const calls: string[] = []
    const endpoint = await charger(0, {
      startDiagnostics: async () => {
        calls.push('startDiagnostics')
      },
    })

    await invoke(endpoint, 'energyEvse', 'startDiagnostics')

    expect(calls).toEqual(['startDiagnostics'])
    expect(stateOf(endpoint, 'energyEvse').supplyState).toBe(4)
  })
})

describe('a window covering that can only open and close, on a real node', () => {
  /** A covering with the Lift feature and no position, as an open/close-only blind has. */
  function openCloseBlind(handlers: Record<string, () => Promise<void>>) {
    return register({
      deviceType: deviceTypes.WindowCovering.with(HomebridgeWindowCoveringServer.with('Lift')),
      clusters: {
        windowCovering: {},
      },
      handlers: { windowCovering: handlers },
    })
  }

  it('registers an open/close-only blind that declares no position, and opens and closes it', async () => {
    const calls: string[] = []
    const endpoint = await register({
      deviceType: deviceTypes.WindowCovering,
      clusters: {
        windowCovering: {
          operationalStatus: { global: 0, lift: 0, tilt: 0 },
        },
      },
      handlers: {
        windowCovering: {
          upOrOpen: async () => {
            calls.push('open')
          },
          downOrClose: async () => {
            calls.push('close')
          },
        },
      },
    })

    await invoke(endpoint, 'windowCovering', 'upOrOpen')
    await invoke(endpoint, 'windowCovering', 'downOrClose')

    expect(calls).toEqual(['open', 'close'])
    expect(stateOf(endpoint, 'windowCovering').featureMap).toMatchObject({ lift: true, positionAwareLift: false, tilt: false })
  })

  it('registers an open/close-only blind that has handlers and no window covering state at all', async () => {
    const calls: string[] = []
    const endpoint = await register({
      deviceType: deviceTypes.WindowCovering,
      clusters: {},
      handlers: {
        windowCovering: {
          upOrOpen: async () => {
            calls.push('open')
          },
        },
      },
    })

    await invoke(endpoint, 'windowCovering', 'upOrOpen')

    expect(calls).toEqual(['open'])
  })

  it('calls the open handler once for open, and the close handler once for close', async () => {
    const calls: string[] = []
    const endpoint = await openCloseBlind({
      upOrOpen: async () => {
        calls.push('open')
      },
      downOrClose: async () => {
        calls.push('close')
      },
    })

    await invoke(endpoint, 'windowCovering', 'upOrOpen')
    await invoke(endpoint, 'windowCovering', 'downOrClose')

    expect(calls).toEqual(['open', 'close'])
  })

  it('waits for the open or close handler when a controller sends a percentage', async () => {
    const calls: string[] = []
    const endpoint = await openCloseBlind({
      upOrOpen: async () => {
        await settle()
        calls.push('open')
      },
      downOrClose: async () => {
        await settle()
        calls.push('close')
      },
    })

    await invoke(endpoint, 'windowCovering', 'goToLiftPercentage', { liftPercent100thsValue: 0 })
    expect(calls).toEqual(['open'])
    await invoke(endpoint, 'windowCovering', 'goToLiftPercentage', { liftPercent100thsValue: 4000 })
    expect(calls).toEqual(['open', 'close'])
  })

  it('fails a percentage command when the close handler fails', async () => {
    const endpoint = await openCloseBlind({
      downOrClose: async () => {
        throw new Error('motor jammed')
      },
    })

    await expect(invoke(endpoint, 'windowCovering', 'goToLiftPercentage', { liftPercent100thsValue: 10000 }))
      .rejects
      .toThrow('The windowCovering.downOrClose handler failed: motor jammed')
  })
})

describe('level commands matter.js ignores or adjusts, on a real node', () => {
  const options = { optionsMask: {}, optionsOverride: {} }

  /** A dimmable light at level 100, with a handler that records the levels it is told. */
  async function light(onOff: boolean, levelControl: Record<string, unknown> = {}) {
    const levels: number[] = []
    const calls: string[] = []
    const endpoint = await register({
      deviceType: deviceTypes.DimmableLight,
      clusters: {
        onOff: { onOff },
        levelControl: {
          currentLevel: 100,
          minLevel: 1,
          maxLevel: 254,
          ...levelControl,
        },
      },
      handlers: {
        onOff: {
          on: async () => {},
          off: async () => {},
        },
        levelControl: {
          moveToLevel: async (request: { level: number }) => {
            levels.push(request.level)
          },
          moveToLevelWithOnOff: async (request: { level: number }) => {
            levels.push(request.level)
          },
          move: async () => {
            calls.push('move')
          },
          step: async () => {
            calls.push('step')
          },
          stop: async () => {
            calls.push('stop')
          },
        },
      },
    })
    const cachedLevel = () => accessories.get('test-uuid')?.clusters?.levelControl?.currentLevel
    return { endpoint, levels, calls, cachedLevel }
  }

  it('does not tell the plugin about a level command for a light that is off', async () => {
    const { endpoint, levels, calls, cachedLevel } = await light(false)

    await invoke(endpoint, 'levelControl', 'moveToLevel', { level: 200, transitionTime: 0, ...options })
    await invoke(endpoint, 'levelControl', 'step', {
      stepMode: 0,
      stepSize: 40,
      transitionTime: 0,
      ...options,
    })
    await invoke(endpoint, 'levelControl', 'move', { moveMode: 0, rate: null, ...options })
    await invoke(endpoint, 'levelControl', 'stop', options)

    expect(levels).toEqual([])
    expect(calls).toEqual([])
    expect(stateOf(endpoint, 'levelControl').currentLevel).toBe(100)
    expect(cachedLevel()).toBe(100)
  })

  it('tells the plugin about a level command for a light that is off when the request says to run it anyway', async () => {
    const { endpoint, levels, cachedLevel } = await light(false)

    await invoke(endpoint, 'levelControl', 'moveToLevel', {
      level: 200,
      transitionTime: 0,
      optionsMask: { executeIfOff: true },
      optionsOverride: { executeIfOff: true },
    })

    expect(levels).toEqual([200])
    expect(stateOf(endpoint, 'levelControl').currentLevel).toBe(200)
    expect(cachedLevel()).toBe(200)
  })

  it('caches the level matter.js stored, not the level that was asked for', async () => {
    const { endpoint, cachedLevel } = await light(true)

    await invoke(endpoint, 'levelControl', 'moveToLevelWithOnOff', { level: 0, transitionTime: 0, ...options })

    // a light can not go below its minimum level
    expect(stateOf(endpoint, 'levelControl').currentLevel).toBe(1)
    expect(cachedLevel()).toBe(1)
  })

  it('caches the level a step ended at', async () => {
    const { endpoint, cachedLevel } = await light(true)

    await invoke(endpoint, 'levelControl', 'step', {
      stepMode: 0,
      stepSize: 40,
      transitionTime: 0,
      ...options,
    })

    expect(stateOf(endpoint, 'levelControl').currentLevel).toBe(140)
    expect(cachedLevel()).toBe(140)
  })

  it('caches the level a light goes to when it turns on', async () => {
    const { endpoint, cachedLevel } = await light(false, { onLevel: 180 })

    await invoke(endpoint, 'onOff', 'on')
    await settle()

    expect(stateOf(endpoint, 'levelControl').currentLevel).toBe(180)
    expect(cachedLevel()).toBe(180)
  })

  it('refuses a move at rate 0 without calling the plugin', async () => {
    const { endpoint, calls } = await light(true)

    await expect(invoke(endpoint, 'levelControl', 'move', { moveMode: 0, rate: 0, ...options })).rejects.toThrow('Illegal move rate of 0')
    await expect(invoke(endpoint, 'levelControl', 'moveWithOnOff', { moveMode: 0, rate: 0, ...options })).rejects.toThrow('Illegal move rate of 0')

    expect(calls).toEqual([])
  })
})

describe('a closure with no handlers, moved on a real node', () => {
  it('keeps the secure state when it is moved and stopped', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.Closure,
      clusters: {
        closureControl: {
          mainState: 0,
          currentErrorList: [],
          overallCurrentState: { position: 0, secureState: true },
          overallTargetState: { position: 0 },
        },
      },
    })

    await invoke(endpoint, 'closureControl', 'moveTo', { position: 1 })
    expect(stateOf(endpoint, 'closureControl').overallCurrentState).toEqual({ position: 1, secureState: false })

    await invoke(endpoint, 'closureControl', 'stop')
    expect(stateOf(endpoint, 'closureControl').overallTargetState).toEqual({ position: 1 })

    await invoke(endpoint, 'closureControl', 'moveTo', { position: 0 })
    expect(stateOf(endpoint, 'closureControl').overallCurrentState).toEqual({ position: 0, secureState: true })
  })
})

describe('the cached state of a fan, on a real node', () => {
  it('holds only what matter holds after a controller changes the speed or the mode', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.Fan,
      clusters: {
        fanControl: {
          fanMode: 3,
          fanModeSequence: 0,
          percentSetting: 50,
          percentCurrent: 50,
        },
      },
      handlers: {
        fanControl: {
          fanModeChange: async () => {},
          percentSettingChange: async () => {},
        },
      },
    })
    const cached = () => accessories.get('test-uuid')?.clusters?.fanControl
    const matter = () => {
      const { fanMode, percentSetting, percentCurrent } = stateOf(endpoint, 'fanControl')
      return { fanMode, percentSetting, percentCurrent }
    }

    await write(endpoint, {
      fanControl: { percentSetting: 80 },
    })
    await settle()
    expect(matter()).toEqual({ fanMode: 3, percentSetting: 80, percentCurrent: 50 })
    expect(cached()).toMatchObject(matter())

    await write(endpoint, {
      fanControl: { fanMode: 0 },
    })
    await settle()
    expect(matter()).toEqual({ fanMode: 0, percentSetting: 80, percentCurrent: 50 })
    expect(cached()).toMatchObject(matter())

    await write(endpoint, {
      fanControl: { fanMode: 3 },
    })
    await write(endpoint, {
      fanControl: { percentSetting: 0 },
    })
    await settle()
    expect(matter()).toEqual({ fanMode: 3, percentSetting: 0, percentCurrent: 50 })
    expect(cached()).toMatchObject(matter())
  })
})

describe('the cached state of a blind with lift and tilt, on a real node', () => {
  it('holds the tilt position too after close, open and stop', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.WindowCovering,
      clusters: {
        windowCovering: {
          currentPositionLiftPercent100ths: 5000,
          targetPositionLiftPercent100ths: 5000,
          currentPositionTiltPercent100ths: 5000,
          targetPositionTiltPercent100ths: 5000,
        },
      },
      handlers: {
        windowCovering: {
          upOrOpen: async () => {},
          downOrClose: async () => {},
          stopMotion: async () => {},
        },
      },
    })
    const positions = (state: Record<string, unknown> | undefined) => ({
      liftTarget: state?.targetPositionLiftPercent100ths,
      lift: state?.currentPositionLiftPercent100ths,
      tiltTarget: state?.targetPositionTiltPercent100ths,
      tilt: state?.currentPositionTiltPercent100ths,
    })
    const cached = () => positions(accessories.get('test-uuid')?.clusters?.windowCovering)
    const matter = () => positions(stateOf(endpoint, 'windowCovering'))

    await invoke(endpoint, 'windowCovering', 'downOrClose')
    expect(matter()).toMatchObject({ liftTarget: 10000, tiltTarget: 10000 })
    expect(cached()).toEqual(matter())

    await invoke(endpoint, 'windowCovering', 'upOrOpen')
    expect(matter()).toMatchObject({ liftTarget: 0, tiltTarget: 0 })
    expect(cached()).toEqual(matter())

    await write(endpoint, {
      windowCovering: { currentPositionLiftPercent100ths: 3000, currentPositionTiltPercent100ths: 4000 },
    })
    await invoke(endpoint, 'windowCovering', 'stopMotion')
    expect(matter()).toMatchObject({ liftTarget: 3000, tiltTarget: 4000 })
    expect(cached()).toEqual(matter())
  })
})

describe('a command sent from the homebridge ui, on a real node', () => {
  /** Send what the UI sends: attributes, mapped to a command, then triggered. */
  async function sendFromUi(cluster: string, attributes: Record<string, unknown>): Promise<void> {
    const mapping = mapAttributesToCommand(cluster, attributes)
    await stateManager.triggerCommand('test-uuid', cluster, mapping!.command, mapping!.args)
  }

  it('gives a lock handler a request object, as a controller does', async () => {
    const requests: unknown[] = []
    await register({
      deviceType: deviceTypes.DoorLock,
      clusters: {
        doorLock: {
          lockState: 2,
          lockType: 0,
          actuatorEnabled: true,
          operatingMode: 0,
        },
      },
      handlers: {
        doorLock: {
          lockDoor: async (request) => {
            requests.push(request)
          },
          unlockDoor: async (request) => {
            requests.push(request)
          },
        },
      },
    })

    await sendFromUi('doorLock', { lockState: 1 })
    await sendFromUi('doorLock', { _command: 'unlockDoor' })

    expect(requests).toEqual([{}, {}])
  })

  it('changes only the hue of a color light when the ui sends only a hue', async () => {
    const calls: string[] = []
    const handlers: Record<string, () => Promise<void>> = {}
    for (const name of [
      'moveToColorTemperatureLogic',
      'moveToHueAndSaturationLogic',
      'moveToColorLogic',
      'moveToHueLogic',
      'moveToSaturationLogic',
      'stopAllColorMovement',
    ]) {
      handlers[name] = async () => {
        calls.push(name)
      }
    }
    // colorMode 0 = hue and saturation
    const colorState = {
      colorMode: 0,
      enhancedColorMode: 0,
      colorTemperatureMireds: 250,
      colorTempPhysicalMinMireds: 147,
      colorTempPhysicalMaxMireds: 454,
      coupleColorTempToLevelMinMireds: 147,
      startUpColorTemperatureMireds: 250,
      currentHue: 10,
      currentSaturation: 150,
      currentX: 24939,
      currentY: 24701,
      numberOfPrimaries: 0,
      colorCapabilities: { hueSaturation: true, xy: true, colorTemperature: true },
      remainingTime: 0,
    }
    const endpoint = await register({
      deviceType: deviceTypes.ExtendedColorLight,
      clusters: {
        onOff: { onOff: true },
        levelControl: { currentLevel: 100 },
        colorControl: colorState,
      },
      handlers: { colorControl: handlers },
    })

    await sendFromUi('colorControl', { currentHue: 100 })
    expect(stateOf(endpoint, 'colorControl')).toMatchObject({ currentHue: 100, currentSaturation: 150 })

    await sendFromUi('colorControl', { currentSaturation: 200 })
    expect(stateOf(endpoint, 'colorControl')).toMatchObject({ currentHue: 100, currentSaturation: 200 })

    expect(calls).toEqual(['moveToHueLogic', 'moveToSaturationLogic'])
  })

  it('gives a valve open handler a request object, as a controller does', async () => {
    const requests: unknown[] = []
    await register({
      deviceType: deviceTypes.WaterValve,
      clusters: {
        valveConfigurationAndControl: {
          openDuration: null,
          defaultOpenDuration: null,
          remainingDuration: null,
          currentState: 0,
          targetState: 0,
        },
      },
      handlers: {
        valveConfigurationAndControl: {
          open: async (request) => {
            requests.push(request)
          },
        },
      },
    })

    await sendFromUi('valveConfigurationAndControl', { targetState: 1 })

    expect(requests).toEqual([{}])
  })
})

describe('the cached state of energy devices, on a real node', () => {
  const cached = (cluster: string) => accessories.get('test-uuid')?.clusters?.[cluster]

  it('holds the discharging attributes of a two-way ev charger after its commands', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.EnergyEvse,
      clusters: {
        energyEvse: {
          state: 0,
          supplyState: 0,
          faultState: 0,
          chargingEnabledUntil: null,
          dischargingEnabledUntil: null,
          circuitCapacity: 32000,
          minimumChargeCurrent: 6000,
          maximumChargeCurrent: 32000,
          maximumDischargeCurrent: 0,
          sessionId: null,
          sessionDuration: null,
          sessionEnergyCharged: null,
          sessionEnergyDischarged: null,
        },
        energyEvseMode: {
          supportedModes: [
            {
              label: 'Manual',
              mode: 0,
              modeTags: [
                { value: 16384 },
              ],
            },
            {
              label: 'Auto',
              mode: 1,
              modeTags: [
                { value: 16385 },
              ],
            },
          ],
          currentMode: 0,
        },
      },
      handlers: {
        energyEvse: {
          enableDischarging: async () => {},
        },
      },
    })

    await invoke(endpoint, 'energyEvse', 'enableDischarging', { dischargingEnabledUntil: null, maximumDischargeCurrent: 10000 })
    expect(stateOf(endpoint, 'energyEvse')).toMatchObject({ supplyState: 2, maximumDischargeCurrent: 10000 })
    expect(cached('energyEvse')).toMatchObject({ supplyState: 2, dischargingEnabledUntil: null, maximumDischargeCurrent: 10000 })

    await invoke(endpoint, 'energyEvse', 'disable')
    expect(cached('energyEvse')).toMatchObject({
      supplyState: 0,
      maximumDischargeCurrent: 0,
      dischargingEnabledUntil: stateOf(endpoint, 'energyEvse').dischargingEnabledUntil,
    })
    expect(cached('energyEvse')?.dischargingEnabledUntil).toBeGreaterThan(0)
  })

  it('holds the reason of a power adjustment', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.DeviceEnergyManagement,
      clusters: {
        deviceEnergyManagement: {
          esaType: 13,
          esaCanGenerate: false,
          esaState: 1,
          absMinPower: 0,
          absMaxPower: 5000000,
          powerAdjustmentCapability: {
            powerAdjustCapability: [
              {
                minPower: 0,
                maxPower: 5000000,
                minDuration: 60,
                maxDuration: 3600,
              },
            ],
            cause: 0,
          },
          optOutState: 0,
        },
        deviceEnergyManagementMode: {
          supportedModes: [
            {
              label: 'No optimisation',
              mode: 0,
              modeTags: [
                { value: 16384 },
              ],
            },
            {
              label: 'Local',
              mode: 1,
              modeTags: [
                { value: 16386 },
              ],
            },
            {
              label: 'Grid',
              mode: 2,
              modeTags: [
                { value: 16387 },
              ],
            },
          ],
          currentMode: 0,
        },
      },
      handlers: {
        deviceEnergyManagement: {
          powerAdjustRequest: async () => {},
          cancelPowerAdjustRequest: async () => {},
        },
      },
    })

    // cause 1 = grid optimization, which is adjust reason 2
    await invoke(endpoint, 'deviceEnergyManagement', 'powerAdjustRequest', { power: 1000000, duration: 600, cause: 1 })
    expect(cached('deviceEnergyManagement')).toMatchObject({
      esaState: 3,
      powerAdjustmentCapability: { cause: 2 },
    })

    await invoke(endpoint, 'deviceEnergyManagement', 'cancelPowerAdjustRequest')
    expect(cached('deviceEnergyManagement')).toMatchObject({
      esaState: 1,
      powerAdjustmentCapability: { cause: 0 },
    })
    // the cache is written to disk as JSON, so what is in it must survive that
    expect(JSON.parse(JSON.stringify(cached('deviceEnergyManagement')?.powerAdjustmentCapability))).toEqual({
      powerAdjustCapability: [
        {
          minPower: 0,
          maxPower: 5000000,
          minDuration: 60,
          maxDuration: 3600,
        },
      ],
      cause: 0,
    })
  })
})

describe('a thermostat with unoccupied setpoints, on a real node', () => {
  /** A heating thermostat with the Occupancy feature, so it has a setpoint for an empty room. */
  function thermostat(handler: (request: unknown) => Promise<void>) {
    return register({
      deviceType: deviceTypes.Thermostat.with(
        deviceRequirements.Thermostat.ThermostatServer.with('Heating', 'Occupancy'),
      ),
      clusters: {
        thermostat: {
          localTemperature: 2000,
          occupiedHeatingSetpoint: 2000,
          unoccupiedHeatingSetpoint: 1600,
          occupancy: { occupied: true },
          systemMode: 4,
          controlSequenceOfOperation: 2,
        },
      },
      handlers: {
        thermostat: {
          unoccupiedHeatingSetpointChange: handler,
        },
      },
    })
  }

  it('tells the plugin when a controller changes the unoccupied setpoint, not when the plugin reports it', async () => {
    const calls: unknown[] = []
    const endpoint = await thermostat(async (request) => {
      calls.push(request)
    })

    await write(endpoint, {
      thermostat: { unoccupiedHeatingSetpoint: 1700 },
    })
    await settle()
    expect(calls).toEqual([
      { unoccupiedHeatingSetpoint: 1700, oldUnoccupiedHeatingSetpoint: 1600 },
    ])
    expect(accessories.get('test-uuid')?.clusters?.thermostat).toMatchObject({ unoccupiedHeatingSetpoint: 1700 })

    await stateManager.updateAccessoryState('test-uuid', 'thermostat', { unoccupiedHeatingSetpoint: 1800 })
    await settle()
    expect(calls).toHaveLength(1)
  })

  it('puts the unoccupied setpoint back when the handler fails', async () => {
    const endpoint = await thermostat(async () => {
      throw new Error('device offline')
    })

    await write(endpoint, {
      thermostat: { unoccupiedHeatingSetpoint: 1700 },
    })
    await settle()

    expect(stateOf(endpoint, 'thermostat').unoccupiedHeatingSetpoint).toBe(1600)
  })
})

describe('an attribute the cluster does not have, on a real node', () => {
  // The typed clusters refuse these names at compile time, so the accessories
  // are cast: a JavaScript plugin, or state built as a plain record, gets no such help.
  let warn: MockInstance<(...args: unknown[]) => void>
  const warnings = () => warn.mock.calls.map(call => String(call[0]))

  beforeEach(() => {
    warn = vi.spyOn(Logger.withPrefix('Matter/Server'), 'warn').mockImplementation(() => {})
  })

  it('warns for a misspelled attribute, and still registers the accessory', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.DimmableLight,
      clusters: {
        onOff: { onOff: true, bogus: 5 },
        levelControl: { currentLevel: 100, curentLevel: 50 },
      },
    } as never)

    expect(stateOf(endpoint, 'onOff').onOff).toBe(true)
    expect(warnings()).toEqual([
      'Matter accessory "Test": the onOff cluster has no attribute named "bogus". It was left out. Please check the spelling.',
      'Matter accessory "Test": the levelControl cluster has no attribute named "curentLevel". It was left out. Please check the spelling.',
    ])
  })

  it('names the part that has the misspelled attribute', async () => {
    await register({
      deviceType: deviceTypes.OnOffOutlet,
      clusters: {
        onOff: { onOff: false },
      },
      parts: [
        {
          id: 'one',
          displayName: 'Socket one',
          deviceType: deviceTypes.OnOffOutlet,
          clusters: {
            onOff: { onOf: true },
          },
        },
      ],
    } as never)

    expect(warnings()).toEqual([
      'Matter accessory "Test" part "Socket one": the onOff cluster has no attribute named "onOf". It was left out. Please check the spelling.',
    ])
  })

  it('does not warn for real attributes or for state matter.js keeps itself', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.DimmableLight,
      clusters: {
        // startUpOnOff belongs to the Lighting feature
        onOff: { onOff: true, startUpOnOff: null },
        // managedTransitionTimeHandling is state matter.js keeps itself
        levelControl: {
          currentLevel: 100,
          minLevel: 1,
          maxLevel: 254,
          managedTransitionTimeHandling: false,
        },
      },
    } as never)

    expect(stateOf(endpoint, 'onOff').onOff).toBe(true)
    expect(warnings()).toEqual([])
  })
})

describe('a cluster the device type does not carry, on a real node', () => {
  let warn: MockInstance<(...args: unknown[]) => void>
  const warnings = () => warn.mock.calls.map(call => String(call[0]))

  beforeEach(() => {
    warn = vi.spyOn(Logger.withPrefix('Matter/Server'), 'warn').mockImplementation(() => {})
  })

  it('warns for it, and still registers the rest of the accessory', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.OnOffLight,
      clusters: {
        onOff: { onOff: true },
        booleanState: { stateValue: true },
      },
    } as never)

    expect(stateOf(endpoint, 'onOff').onOff).toBe(true)
    expect((endpoint.state as Record<string, unknown>).booleanState).toBeUndefined()
    expect(warnings()).toEqual([
      'Matter accessory "Test": the device type has no booleanState cluster, so its state was left out. Use a device type that carries this cluster.',
    ])
  })

  it('names the part that declares it', async () => {
    await register({
      deviceType: deviceTypes.OnOffOutlet,
      clusters: {
        onOff: { onOff: false },
      },
      parts: [
        {
          id: 'one',
          displayName: 'Socket one',
          deviceType: deviceTypes.OnOffOutlet,
          clusters: {
            onOff: { onOff: true },
            levelControl: { currentLevel: 10 },
          },
        },
      ],
    } as never)

    expect(warnings()).toEqual([
      'Matter accessory "Test" part "Socket one": the device type has no levelControl cluster, so its state was left out. Use a device type that carries this cluster.',
    ])
  })

  it('does not warn for a cluster homebridge adds to the device type', async () => {
    await register({
      deviceType: deviceTypes.AirQualitySensor,
      clusters: {
        airQuality: { airQuality: 1 },
        temperatureMeasurement: { measuredValue: 2000 },
      },
    } as never)

    expect(warnings()).toEqual([])
  })
})

describe('a command sent from the UI, on a real node', () => {
  it('gives a command with request fields an empty request, and a command without them no argument', async () => {
    const lockDoor = vi.spyOn(HomebridgeDoorLockServer.prototype, 'lockDoor')
    const on = vi.spyOn(HomebridgeOnOffServer.prototype, 'on')
    const endpoint = await register({
      deviceType: deviceTypes.DoorLock.with(HomebridgeOnOffServer),
      clusters: {
        doorLock: {
          lockState: 2,
          lockType: 0,
          actuatorEnabled: true,
          operatingMode: 0,
        },
        onOff: { onOff: false },
      },
      handlers: {
        doorLock: {
          lockDoor: async () => {},
        },
      },
    })

    await stateManager.triggerCommand('test-uuid', 'doorLock', 'lockDoor')
    await stateManager.triggerCommand('test-uuid', 'doorLock', 'lockDoor', {})
    await stateManager.triggerCommand('test-uuid', 'onOff', 'on')
    await stateManager.triggerCommand('test-uuid', 'onOff', 'on', {})

    const requests = (calls: unknown[][]) => calls.map(call => call[0])
    expect(requests(lockDoor.mock.calls)).toEqual([{}, {}])
    // no request: matter.js passes nothing in its place
    expect(requests(on.mock.calls)).toEqual([undefined, undefined])
    expect(stateOf(endpoint, 'doorLock').lockState).toBe(1)
    expect(stateOf(endpoint, 'onOff').onOff).toBe(true)
  })

  it('fails with a clear error for a cluster or a command the endpoint does not have', async () => {
    await register({
      deviceType: deviceTypes.OnOffLight,
      clusters: {
        onOff: { onOff: false },
      },
    })
    const errorOf = (work: Promise<unknown>): Promise<string> => work.then(() => 'no error', (error: Error) => error.message)

    expect(await errorOf(stateManager.triggerCommand('test-uuid', 'doorLock', 'lockDoor'))).toMatch(/^Failed to trigger command: .*doorLock/)
    expect(await errorOf(stateManager.triggerCommand('test-uuid', 'onOff', 'blink'))).toMatch(/^Failed to trigger command: .*blink/)
  })
})

describe('a thermostat a plugin composed with its own features, on a real node', () => {
  it('keeps a feature outside heating, cooling, occupancy and auto, and still calls the handlers', async () => {
    const calls: unknown[] = []
    const endpoint = await register({
      deviceType: devices.ThermostatDevice.with(
        ThermostatRequirements.ThermostatServer.with('Heating', 'LocalTemperatureNotExposed'),
      ),
      clusters: {
        thermostat: {
          systemMode: 4,
          controlSequenceOfOperation: 2,
          occupiedHeatingSetpoint: 2000,
          minHeatSetpointLimit: 700,
          maxHeatSetpointLimit: 3000,
        },
      },
      handlers: {
        thermostat: {
          occupiedHeatingSetpointChange: async (request) => {
            calls.push(request)
          },
        },
      },
    })

    expect(stateOf(endpoint, 'thermostat').featureMap).toMatchObject({ heating: true, localTemperatureNotExposed: true, cooling: false })

    await write(endpoint, {
      thermostat: { occupiedHeatingSetpoint: 2200 },
    })
    await settle()

    expect(calls).toHaveLength(1)
    expect(stateOf(endpoint, 'thermostat').occupiedHeatingSetpoint).toBe(2200)
  })
})

describe('identify on a real node', () => {
  it('tells the plugin about an identify effect, and still calls the identify handler for the command', async () => {
    const calls: unknown[] = []
    const endpoint = await register({
      deviceType: deviceTypes.OnOffLight,
      clusters: {
        onOff: { onOff: false },
      },
      handlers: {
        identify: {
          identify: async (request) => {
            calls.push(['identify', request])
          },
          triggerEffect: async (request) => {
            calls.push(['triggerEffect', request])
          },
        },
      },
    })

    // 0 = blink, 0 = the default variant
    await invoke(endpoint, 'identify', 'triggerEffect', { effectIdentifier: 0, effectVariant: 0 })
    await settle()
    await invoke(endpoint, 'identify', 'identify', { identifyTime: 3 })
    await settle()

    expect(calls).toEqual([
      [
        'triggerEffect',
        { effectIdentifier: 0, effectVariant: 0 },
      ],
      [
        'identify',
        { identifyTime: 3 },
      ],
    ])
    expect(stateOf(endpoint, 'identify').identifyTime).toBe(3)
    // stop the one-second identify timer
    await invoke(endpoint, 'identify', 'identify', { identifyTime: 0 })
  })

  it('answers the effect command when the plugin handler fails, and logs the failure', async () => {
    const warn = vi.spyOn(Logger.withPrefix('Matter/Identify'), 'warn').mockImplementation(() => {})
    const endpoint = await register({
      deviceType: deviceTypes.OnOffLight,
      clusters: {
        onOff: { onOff: false },
      },
      handlers: {
        identify: {
          triggerEffect: async () => {
            throw new Error('lamp offline')
          },
        },
      },
    })

    await invoke(endpoint, 'identify', 'triggerEffect', { effectIdentifier: 0, effectVariant: 0 })
    await settle()

    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0][0])).toContain('triggerEffect handler')
  })
})

describe('a handler that answers the command itself, on a real node', () => {
  // These handlers are not cast on purpose: a typed handler that returns an
  // answer has to compile, which it did not while the fallback handler type
  // (MatterClusterHandlers in types.ts) said every handler returns nothing.
  it('lets a clean mode handler refuse a mode, and leaves the mode as it was', async () => {
    const answers: Array<{ status: number, statusText: string } | undefined> = []
    const endpoint = await register({
      deviceType: deviceTypes.RoboticVacuumCleaner,
      clusters: {
        rvcRunMode: {
          supportedModes: [
            {
              label: 'Idle',
              mode: 0,
              modeTags: [
                { value: 16384 },
              ],
            },
            {
              label: 'Cleaning',
              mode: 1,
              modeTags: [
                { value: 16385 },
              ],
            },
          ],
          currentMode: 0,
        },
        rvcCleanMode: {
          supportedModes: [
            {
              label: 'Vacuum',
              mode: 0,
              modeTags: [
                { value: 16385 },
              ],
            },
            {
              label: 'Mop',
              mode: 1,
              modeTags: [
                { value: 16386 },
              ],
            },
          ],
          currentMode: 0,
        },
        rvcOperationalState: {
          operationalStateList: [
            { operationalStateId: 0 },
            { operationalStateId: 1 },
            { operationalStateId: 2 },
            { operationalStateId: 3 },
          ],
          // 1 = running, a state pause and resume are allowed in
          operationalState: 1,
        },
      },
      handlers: {
        rvcRunMode: {
          // 65 = stuck (a status of the run mode cluster)
          changeToMode: async () => answers.shift(),
        },
        rvcCleanMode: {
          // 64 = the cleaning pad or tank is missing, say
          changeToMode: async () => answers.shift(),
        },
        rvcOperationalState: {
          // 65 = stuck
          pause: async () => ({
            commandResponseState: { errorStateId: 65 },
          }),
          resume: async () => {},
        },
      },
    })

    answers.push({ status: 64, statusText: 'No mop pad' })
    expect(await invoke(endpoint, 'rvcCleanMode', 'changeToMode', { newMode: 1 })).toEqual({ status: 64, statusText: 'No mop pad' })
    expect(stateOf(endpoint, 'rvcCleanMode').currentMode).toBe(0)

    // a handler that returns nothing means "done"
    answers.push(undefined)
    expect(await invoke(endpoint, 'rvcCleanMode', 'changeToMode', { newMode: 1 })).toMatchObject({ status: 0 })
    expect(stateOf(endpoint, 'rvcCleanMode').currentMode).toBe(1)

    answers.push({ status: 65, statusText: 'Stuck' })
    expect(await invoke(endpoint, 'rvcRunMode', 'changeToMode', { newMode: 1 })).toEqual({ status: 65, statusText: 'Stuck' })
    expect(stateOf(endpoint, 'rvcRunMode').currentMode).toBe(0)

    expect(await invoke(endpoint, 'rvcOperationalState', 'pause')).toEqual({
      commandResponseState: { errorStateId: 65 },
    })
    expect(await invoke(endpoint, 'rvcOperationalState', 'resume')).toEqual({
      commandResponseState: { errorStateId: 0 },
    })
  })

  it('lets a play handler and a key handler answer with their own status', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.MediaPlayer,
      clusters: {
        onOff: { onOff: true },
        mediaPlayback: { currentState: 2 },
      },
      handlers: {
        mediaPlayback: {
          // 2 = not allowed
          play: async () => ({ status: 2 }),
          pause: async () => {},
        },
        keypadInput: {
          // 2 = invalid key in the current state
          sendKey: async () => ({ status: 2 }),
        },
      },
    })

    expect(await invoke(endpoint, 'mediaPlayback', 'play')).toEqual({ status: 2 })
    expect(stateOf(endpoint, 'mediaPlayback').currentState).toBe(2)

    expect(await invoke(endpoint, 'mediaPlayback', 'pause')).toMatchObject({ status: 0 })
    expect(stateOf(endpoint, 'mediaPlayback').currentState).toBe(1)

    expect(await invoke(endpoint, 'keypadInput', 'sendKey', { keyCode: 0 })).toEqual({ status: 2 })
  })
})

describe('a vacuum command in a state Matter does not allow it in, on a real node', () => {
  it('refuses to pause or send home a vacuum that is on its dock, and does not call the plugin', async () => {
    const calls: string[] = []
    const modes = [
      {
        label: 'Idle',
        mode: 0,
        modeTags: [
          { value: 16384 },
        ],
      },
      {
        label: 'Cleaning',
        mode: 1,
        modeTags: [
          { value: 16385 },
        ],
      },
    ]
    const endpoint = await register({
      deviceType: deviceTypes.RoboticVacuumCleaner,
      clusters: {
        rvcRunMode: { supportedModes: modes, currentMode: 0 },
        rvcOperationalState: {
          operationalStateList: [
            { operationalStateId: 0 },
            { operationalStateId: 1 },
            { operationalStateId: 2 },
            { operationalStateId: 3 },
            { operationalStateId: 64 },
            { operationalStateId: 65 },
            { operationalStateId: 66 },
          ],
          // 66 = docked
          operationalState: 66,
        },
      },
      handlers: {
        rvcOperationalState: {
          pause: async () => {
            calls.push('pause')
          },
          resume: async () => {
            calls.push('resume')
          },
          goHome: async () => {
            calls.push('goHome')
          },
        },
      },
    })
    // 3 = the command is not valid in this state
    const invalidInState = {
      commandResponseState: { errorStateId: 3 },
    }

    expect(await invoke(endpoint, 'rvcOperationalState', 'pause')).toEqual(invalidInState)
    expect(await invoke(endpoint, 'rvcOperationalState', 'goHome')).toEqual(invalidInState)
    expect(calls).toEqual([])

    // resume is allowed on the dock (it goes back to the paused clean)
    expect(await invoke(endpoint, 'rvcOperationalState', 'resume')).toEqual({
      commandResponseState: { errorStateId: 0 },
    })
    expect(calls).toEqual(['resume'])
  })
})
