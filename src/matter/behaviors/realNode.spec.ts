import type { AccessoryManagerDeps } from '../server/AccessoryManager.js'
import type { InternalMatterAccessory, MatterAccessory } from '../types.js'

import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Filesystem } from '@matter/general'
import { Endpoint, Environment, ServerNode } from '@matter/main'
import { AggregatorEndpoint } from '@matter/main/endpoints'
import { NodeJsFilesystem } from '@matter/nodejs'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from '../../logger.js'
import { MatterStatus } from '../errors.js'
import { AccessoryManager } from '../server/AccessoryManager.js'
import { StateManager } from '../server/StateManager.js'
import { deviceTypes } from '../types.js'
import { BehaviorRegistry, RegistryManager } from './index.js'

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
