import type { AccessoryManagerDeps } from '../server/AccessoryManager.js'
import type { InternalMatterAccessory, MatterAccessory } from '../types.js'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Filesystem } from '@matter/general'
import { Endpoint, Environment, ServerNode } from '@matter/main'
import { AggregatorEndpoint } from '@matter/main/endpoints'
import { NodeJsFilesystem } from '@matter/nodejs'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from '../../logger.js'
import { AccessoryManager } from '../server/AccessoryManager.js'
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

    await expect(invoke(endpoint, 'onOff', 'toggle')).rejects.toThrow('Failed to toggle: device offline')
    expect(stateOf(endpoint, 'onOff').onOff).toBe(false)
  })
})
