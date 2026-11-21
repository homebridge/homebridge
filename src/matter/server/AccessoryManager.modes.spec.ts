import type { MatterAccessoryCache } from '../accessoryCache.js'
import type { InternalMatterAccessory, MatterAccessory } from '../types.js'
import type { AccessoryManagerDeps } from './AccessoryManager.js'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { Filesystem } from '@matter/general'
import { Endpoint, Environment, ServerNode } from '@matter/main'
import { AggregatorEndpoint } from '@matter/main/endpoints'
import { NodeJsFilesystem } from '@matter/nodejs'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BehaviorRegistry, RegistryManager } from '../behaviors/index.js'
import { repairCurrentMode } from '../behaviors/modeRepair.js'
import { deviceTypes } from '../types.js'
import { AccessoryManager } from './AccessoryManager.js'

/**
 * A saved mode that the accessory no longer lists (#4057).
 *
 * matter.js saves the current mode of a mode cluster when it changes, and puts
 * it back at the next start. After a plugin update with fewer modes, the saved
 * mode may be gone from the list, and matter.js then refused to start the
 * cluster: the whole accessory failed to register, at every start.
 *
 * These run on a real matter.js node with its storage on disk, started twice,
 * because the saved value only exists after a real restart.
 */

const storageRoot = mkdtempSync(join(tmpdir(), 'hb-matter-modes-'))
let nodeCount = 0
let nodeId: string
let node: ServerNode | undefined

beforeEach(() => {
  nodeId = `modes-${process.pid}-${nodeCount++}`
})

afterEach(async () => {
  await node?.close()
  node = undefined
})

afterAll(() => {
  rmSync(storageRoot, { recursive: true, force: true })
})

/** `count` clean modes, numbered from 1. */
function cleanModes(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    label: `Mode ${index + 1}`,
    mode: index + 1,
    modeTags: [
      { value: 16385 },
    ],
  }))
}

const RUN_MODES = [
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
  {
    label: 'Mapping',
    mode: 2,
    modeTags: [
      { value: 16386 },
    ],
  },
]

interface Started {
  endpoint: Endpoint | undefined
  error: unknown
}

/**
 * Start the node (again) on the same storage and register the vacuum.
 */
async function start(options: {
  cleanModeCount: number
  cleanMode: number
  runModes?: typeof RUN_MODES
  runMode?: number
  accessoryCache?: MatterAccessoryCache | null
}): Promise<Started> {
  const environment = new Environment(nodeId, Environment.default)
  environment.set(Filesystem, new NodeJsFilesystem(join(storageRoot, nodeId)))
  node = await ServerNode.create({
    id: nodeId,
    environment,
    network: { port: 0 },
  } as any)
  const aggregator = new Endpoint(AggregatorEndpoint, { id: 'aggregator' })
  await node.add(aggregator)

  const accessories = new Map<string, InternalMatterAccessory>()
  const deps: AccessoryManagerDeps = {
    config: {} as AccessoryManagerDeps['config'],
    accessories,
    behaviorRegistry: new BehaviorRegistry(accessories as any),
    registryManager: new RegistryManager(),
    accessoryCache: options.accessoryCache ?? null,
    getServerNode: () => node!,
    getAggregator: () => aggregator as any,
    getIsRunning: () => false,
    getMonitoringEnabled: () => false,
    isCommissioned: () => false,
  }
  const accessory = {
    UUID: 'vacuum-uuid',
    displayName: 'Vacuum',
    serialNumber: 'serial',
    manufacturer: 'maker',
    model: 'model',
    deviceType: deviceTypes.RoboticVacuumCleaner,
    clusters: {
      rvcRunMode: {
        supportedModes: options.runModes ?? RUN_MODES,
        currentMode: options.runMode ?? 0,
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
        supportedModes: cleanModes(options.cleanModeCount),
        currentMode: options.cleanMode,
      },
    },
    handlers: {
      rvcRunMode: {
        changeToMode: async () => {},
      },
      rvcCleanMode: {
        changeToMode: async () => {},
      },
      rvcOperationalState: {
        pause: async () => {},
        resume: async () => {},
        goHome: async () => {},
      },
    },
  } as unknown as MatterAccessory

  let error: unknown
  try {
    await new AccessoryManager().registerAccessory('homebridge-test', 'Test', accessory, deps)
  } catch (caught) {
    error = caught
  }
  return {
    endpoint: accessories.get('vacuum-uuid')?.endpoint as Endpoint | undefined,
    error,
  }
}

async function restart(): Promise<void> {
  await node?.close()
  node = undefined
}

function modeOf(started: Started, cluster: 'rvcCleanMode' | 'rvcRunMode'): number | undefined {
  return (started.endpoint?.state as Record<string, { currentMode?: number }> | undefined)?.[cluster]?.currentMode
}

describe('a saved mode after the list of modes changed (#4057)', () => {
  it('registers with the plugin\'s mode when the saved clean mode is gone from the list', async () => {
    const first = await start({ cleanModeCount: 37, cleanMode: 1 })
    // the mode changes while running, as when someone picks one in the Home app
    await first.endpoint!.set({
      rvcCleanMode: { currentMode: 35 },
    } as any)
    await restart()

    const second = await start({ cleanModeCount: 10, cleanMode: 8 })

    expect(second.error).toBeUndefined()
    expect(modeOf(second, 'rvcCleanMode')).toBe(8)
  }, 30000)

  it('does the same for the run mode', async () => {
    const first = await start({ cleanModeCount: 3, cleanMode: 1 })
    await first.endpoint!.set({
      rvcRunMode: { currentMode: 2 },
    } as any)
    await restart()

    // "Mapping" (mode 2) is no longer offered
    const second = await start({
      cleanModeCount: 3,
      cleanMode: 1,
      runModes: RUN_MODES.slice(0, 2),
      runMode: 0,
    })

    expect(second.error).toBeUndefined()
    expect(modeOf(second, 'rvcRunMode')).toBe(0)
  }, 30000)

  it('still keeps a saved mode which the list has', async () => {
    const first = await start({ cleanModeCount: 37, cleanMode: 1 })
    await first.endpoint!.set({
      rvcCleanMode: { currentMode: 5 },
    } as any)
    await restart()

    // fewer modes, but the one that was in use is still there
    const second = await start({ cleanModeCount: 10, cleanMode: 8 })

    expect(second.error).toBeUndefined()
    expect(modeOf(second, 'rvcCleanMode')).toBe(5)
  }, 30000)

  it('does not put back a cached mode which is gone from the list', async () => {
    // Homebridge's own accessory cache, as accessories.json holds it after mode 35 was in use.
    // The plugin registers with mode 4 both times, so nothing marks its mode as a new setting.
    const cached = {
      clusters: {
        rvcCleanMode: {
          supportedModes: cleanModes(37),
          currentMode: 35,
        },
      },
      declared: {
        clusters: {
          rvcCleanMode: {
            supportedModes: cleanModes(37),
            currentMode: 4,
          },
        },
      },
    }
    const accessoryCache = {
      hasCached: () => true,
      getCached: () => cached,
      release: () => {},
      requestSave: () => {},
    } as unknown as MatterAccessoryCache

    const started = await start({ cleanModeCount: 10, cleanMode: 4, accessoryCache })

    expect(started.error).toBeUndefined()
    expect(modeOf(started, 'rvcCleanMode')).toBe(4)
  }, 30000)
})

describe('repairCurrentMode', () => {
  const modes = cleanModes(3)

  function behavior(currentMode: number, supportedModes: unknown = modes) {
    return {
      state: { supportedModes, currentMode } as { supportedModes?: readonly { mode: number }[], currentMode?: number },
      endpoint: { id: 'vacuum' } as Endpoint,
    }
  }

  it('uses the first mode in the list when the endpoint was registered with none that fits', () => {
    const vacuum = behavior(35)

    repairCurrentMode(vacuum, 'rvcCleanMode')

    expect(vacuum.state.currentMode).toBe(1)
  })

  it('leaves a supported mode alone', () => {
    const vacuum = behavior(2)

    repairCurrentMode(vacuum, 'rvcCleanMode')

    expect(vacuum.state.currentMode).toBe(2)
  })

  it('leaves an empty list to matter.js, which reports it', () => {
    const vacuum = behavior(35, [])

    repairCurrentMode(vacuum, 'rvcCleanMode')

    expect(vacuum.state.currentMode).toBe(35)
  })
})
