import type { ServerLifecycleDeps } from './ServerLifecycle.js'

import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Tests for the network.interface env-var handling added in
 *   fix: Matter crash when bridge bind config is set (network.interface env var)
 *
 * Rationale: `Environment.default` is a process-wide singleton. Before the fix,
 *   (a) `environment.vars.set('network.interface', ...)` was called BEFORE
 *       `MatterServerNode.create()`, which caused `Behaviors.defaultsFor('network')`
 *       to see an `interface` key NetworkBehavior.State doesn't declare and the
 *       ValueCaster threw `[unsupported-cast] Property "interface" is unsupported`.
 *   (b) Even after fixing the ordering, a second ServerNode in the same process
 *       (e.g. an external accessory like RoboticVacuumCleaner) would still crash
 *       because the first server's `network.interface` was left in the singleton.
 *
 * The fix in ServerLifecycle.start() is:
 *   1. Before ServerNode creation, `delete` any existing `network.interface` from
 *      the env vars (VariableService.get returns a live reference so this mutates
 *      the backing store).
 *   2. After ServerNode creation, `set('network.interface', ...)` — safe because
 *      ServerNetworkRuntime reads it lazily via a getter at run() time.
 */

// Shared fake Environment.default.vars with matter.js dot-path semantics and
// call-order tracking so the tests can verify "cleared before create, set after create".
interface FakeVarsState {
  store: Record<string, unknown>
  calls: Array<{ op: 'get' | 'set', name: string, value?: unknown }>
}

function makeFakeVars(state: FakeVarsState) {
  return {
    get: vi.fn((name: string) => {
      state.calls.push({ op: 'get', name })
      const segments = name.split('.')
      let cursor: unknown = state.store
      for (const segment of segments) {
        if (cursor === null || typeof cursor !== 'object') {
          return undefined
        }
        cursor = (cursor as Record<string, unknown>)[segment]
      }
      return cursor
    }),
    set: vi.fn((name: string, value: unknown) => {
      state.calls.push({ op: 'set', name, value })
      const segments = name.split('.')
      const key = segments.pop() as string
      let parent: Record<string, unknown> = state.store
      for (const segment of segments) {
        const next = parent[segment]
        if (next === undefined || next === null || typeof next !== 'object') {
          parent[segment] = {}
        }
        parent = parent[segment] as Record<string, unknown>
      }
      parent[key] = value
    }),
  }
}

const sharedVarsState: FakeVarsState = { store: {}, calls: [] }
const sharedVars = makeFakeVars(sharedVarsState)

// Track ServerNode.create invocations so tests can anchor "before/after" assertions
// against the network.interface clear/set operations on sharedVars.
const serverNodeCreateCalls: Array<{ t: number, networkInterfaceAtCreate: unknown }> = []
let serverNodeCreateInvocationIndex = 0

vi.mock('@matter/general', () => ({
  Filesystem: { name: 'Filesystem' },
}))

vi.mock('@matter/main', () => ({
  Endpoint: class MockEndpoint {
    deviceType: unknown
    options: unknown
    constructor(deviceType: unknown, options: unknown) {
      this.deviceType = deviceType
      this.options = options
    }
  },
  Environment: {
    default: {
      vars: sharedVars,
      set: vi.fn(),
      get: vi.fn(),
    },
  },
  ServerNode: {
    create: vi.fn(async () => {
      // Snapshot network.interface at the moment of creation so tests can prove
      // the environment was clean before matter.js's ValueCaster would have run.
      const networkVars = sharedVarsState.store.network as Record<string, unknown> | undefined
      serverNodeCreateCalls.push({
        t: ++serverNodeCreateInvocationIndex,
        networkInterfaceAtCreate: networkVars?.interface,
      })
      return {
        run: vi.fn(() => Promise.resolve()),
        add: vi.fn(),
        close: vi.fn(),
      }
    }),
  },
  VendorId: (id: number) => id,
}))

vi.mock('@matter/main/endpoints', () => ({
  AggregatorEndpoint: { deviceType: 0x000E },
}))

vi.mock('@matter/nodejs', () => ({
  NodeJsFilesystem: class MockNodeJsFilesystem {
    path: string
    constructor(path: string) {
      this.path = path
    }
  },
}))

vi.mock('../../bridgeService.js', () => ({
  DEFAULT_BRIDGE_DEFAULTS: { vendorName: 'Homebridge' },
}))

vi.mock('../../logger.js', () => {
  const mockLogger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  }
  return { Logger: { withPrefix: vi.fn(() => mockLogger) } }
})

vi.mock('../../version.js', () => ({
  default: () => '2.0.0-test',
}))

vi.mock('../errorHandler.js', () => ({
  errorHandler: {
    handleError: vi.fn(),
  },
}))

vi.mock('../types.js', () => {
  class MatterDeviceError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'MatterDeviceError'
    }
  }
  return { MatterDeviceError }
})

vi.mock('./ServerConfig.js', () => ({
  SERVER_INIT_DELAY_MS: 0,
  SERVER_READY_POLL_INTERVAL_MS: 0,
  SERVER_READY_TIMEOUT_MS: 1000,
}))

// Import after mocks are registered so the module under test binds to the mocked symbols.
const { ServerLifecycle } = await import('./ServerLifecycle.js')

function createMockDeps(overrides: Partial<ServerLifecycleDeps> = {}): ServerLifecycleDeps {
  let serverNode: unknown = null
  let aggregator: unknown = null
  let running = false

  const deps: ServerLifecycleDeps = {
    config: {
      port: 5540,
      uniqueId: 'TEST0001',
      serialNumber: 'TEST0001',
      storagePath: '/fake/storage',
      displayName: 'Test Bridge',
    } as ServerLifecycleDeps['config'],
    commissioningManager: {
      passcode: 20202021,
      discriminator: 3840,
      vendorId: 0xFFF1,
      productId: 0x8001,
      loadOrGenerateCredentials: vi.fn(async () => {}),
      setupCommissioningEventListeners: vi.fn(),
      generateCommissioningInfo: vi.fn(async () => {}),
      updateCommissioningFile: vi.fn(async () => {}),
    } as unknown as ServerLifecycleDeps['commissioningManager'],
    fabricManager: {} as ServerLifecycleDeps['fabricManager'],
    getCommissioningDeps: vi.fn(() => ({}) as ReturnType<ServerLifecycleDeps['getCommissioningDeps']>),
    getAccessoryCache: vi.fn(() => ({ load: vi.fn(async () => new Map()) }) as unknown as ReturnType<ServerLifecycleDeps['getAccessoryCache']>),
    setAccessoryCache: vi.fn(),
    setServerNode: vi.fn((n) => {
      serverNode = n
    }),
    getServerNode: vi.fn(() => serverNode as ReturnType<ServerLifecycleDeps['getServerNode']>),
    setAggregator: vi.fn((a) => {
      aggregator = a
    }),
    getAggregator: vi.fn(() => aggregator as ReturnType<ServerLifecycleDeps['getAggregator']>),
    setIsRunning: vi.fn((v) => {
      running = v
    }),
    getIsRunning: vi.fn(() => running),
    cleanupHandlers: [],
    shutdownHandler: null,
    setShutdownHandler: vi.fn(),
    onStop: vi.fn(async () => {}),
    ...overrides,
  }

  return deps
}

describe('serverLifecycle — network.interface env var handling (#3910)', () => {
  let lifecycle: InstanceType<typeof ServerLifecycle>

  beforeEach(() => {
    vi.clearAllMocks()
    sharedVarsState.store = {}
    sharedVarsState.calls = []
    serverNodeCreateCalls.length = 0
    serverNodeCreateInvocationIndex = 0

    // ServerLifecycle.start() registers SIGINT/SIGTERM handlers on the real process.
    // Stub them out so each `start()` call doesn't leak listeners across tests.
    vi.spyOn(process, 'on').mockImplementation(() => process)

    lifecycle = new ServerLifecycle()

    // Bypass storage setup (path validation, mkdir, etc) — not under test here.
    vi.spyOn(lifecycle, 'setupStorage').mockImplementation(async () => {
      lifecycle.matterStoragePath = '/fake/storage/TEST0001'
      return { load: vi.fn(async () => new Map()) } as never
    })

    // startServerNode awaits serverReady and calls run() — out of scope for these tests.
    const proto = Object.getPrototypeOf(lifecycle) as { startServerNode: (...args: unknown[]) => Promise<void> }
    vi.spyOn(proto, 'startServerNode').mockImplementation(async () => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('clearing network.interface before ServerNode creation', () => {
    it('deletes a pre-existing network.interface before MatterServerNode.create is called', async () => {
      // Simulate a prior server having set network.interface on the singleton.
      sharedVarsState.store.network = { interface: { eno1: { type: 2 } } }

      await lifecycle.start(createMockDeps())

      expect(serverNodeCreateCalls).toHaveLength(1)
      expect(serverNodeCreateCalls[0].networkInterfaceAtCreate).toBeUndefined()
    })

    it('leaves the network vars object in place (only removes the interface key)', async () => {
      sharedVarsState.store.network = {
        interface: { eno1: { type: 2 } },
        someOtherKey: 'preserved',
      }

      await lifecycle.start(createMockDeps())

      const networkVars = sharedVarsState.store.network as Record<string, unknown>
      expect(networkVars).toBeDefined()
      expect('interface' in networkVars).toBe(false)
      expect(networkVars.someOtherKey).toBe('preserved')
    })

    it('does not throw or mutate when no network vars exist', async () => {
      await expect(lifecycle.start(createMockDeps())).resolves.not.toThrow()
      // No networkInterfaces configured → nothing should have been set on `network`.
      expect(sharedVarsState.store.network).toBeUndefined()
    })

    it('does not throw when network vars exist but have no interface key', async () => {
      sharedVarsState.store.network = { unrelated: true }

      await expect(lifecycle.start(createMockDeps())).resolves.not.toThrow()
      expect((sharedVarsState.store.network as Record<string, unknown>).unrelated).toBe(true)
    })
  })

  describe('setting network.interface after ServerNode creation', () => {
    it('sets network.interface only after MatterServerNode.create resolves', async () => {
      const deps = createMockDeps({
        config: {
          ...createMockDeps().config,
          networkInterfaces: ['eno1'],
        },
      })

      await lifecycle.start(deps)

      // Find the first 'set' call for 'network.interface' and confirm it came after
      // ServerNode.create was invoked. Call ordering is preserved in sharedVarsState.calls.
      const setCallIndex = sharedVarsState.calls.findIndex(c => c.op === 'set' && c.name === 'network.interface')
      expect(setCallIndex).toBeGreaterThanOrEqual(0)

      // ServerNode.create ran exactly once during this start()
      expect(serverNodeCreateCalls).toHaveLength(1)
      // …and at the moment of creation, interface was not yet set.
      expect(serverNodeCreateCalls[0].networkInterfaceAtCreate).toBeUndefined()

      // After start() completes, interface is present with the expected shape.
      expect((sharedVarsState.store.network as Record<string, unknown>).interface)
        .toEqual({ eno1: { type: 2 } })
    })

    it('encodes each configured interface with type=2', async () => {
      const deps = createMockDeps({
        config: {
          ...createMockDeps().config,
          networkInterfaces: ['eno1', 'wlan0'],
        },
      })

      await lifecycle.start(deps)

      expect((sharedVarsState.store.network as Record<string, unknown>).interface)
        .toEqual({ eno1: { type: 2 }, wlan0: { type: 2 } })
    })

    it('does not set network.interface when no networkInterfaces are configured', async () => {
      await lifecycle.start(createMockDeps())

      const setCalls = sharedVarsState.calls.filter(c => c.op === 'set' && c.name === 'network.interface')
      expect(setCalls).toHaveLength(0)
      expect(sharedVarsState.store.network).toBeUndefined()
    })

    it('does not set network.interface when networkInterfaces is an empty array', async () => {
      const deps = createMockDeps({
        config: {
          ...createMockDeps().config,
          networkInterfaces: [],
        },
      })

      await lifecycle.start(deps)

      const setCalls = sharedVarsState.calls.filter(c => c.op === 'set' && c.name === 'network.interface')
      expect(setCalls).toHaveLength(0)
    })
  })

  describe('sequential starts against the Environment.default singleton', () => {
    it('a second start clears the first start\'s network.interface before creating its ServerNode', async () => {
      // First lifecycle sets network.interface (main bridge).
      const firstDeps = createMockDeps({
        config: {
          ...createMockDeps().config,
          networkInterfaces: ['eno1'],
        },
      })
      await lifecycle.start(firstDeps)
      expect((sharedVarsState.store.network as Record<string, unknown>).interface)
        .toEqual({ eno1: { type: 2 } })

      // Second lifecycle (e.g. external accessory / RoboticVacuumCleaner) starts
      // against the same Environment.default.
      const secondLifecycle = new ServerLifecycle()
      vi.spyOn(secondLifecycle, 'setupStorage').mockImplementation(async () => {
        secondLifecycle.matterStoragePath = '/fake/storage/TEST0002'
        return { load: vi.fn(async () => new Map()) } as never
      })
      const secondProto = Object.getPrototypeOf(secondLifecycle) as { startServerNode: (...args: unknown[]) => Promise<void> }
      vi.spyOn(secondProto, 'startServerNode').mockImplementation(async () => {})

      const secondDeps = createMockDeps({
        config: {
          ...createMockDeps().config,
          uniqueId: 'TEST0002',
          serialNumber: 'TEST0002',
          externalAccessory: true,
          networkInterfaces: ['eno1'],
        },
      })
      await secondLifecycle.start(secondDeps)

      // The second ServerNode.create must have seen a clean environment — this is
      // the exact regression the PR guards against.
      expect(serverNodeCreateCalls).toHaveLength(2)
      expect(serverNodeCreateCalls[1].networkInterfaceAtCreate).toBeUndefined()

      // After the second start completes, interface is reapplied for the runtime.
      expect((sharedVarsState.store.network as Record<string, unknown>).interface)
        .toEqual({ eno1: { type: 2 } })
    })

    it('a second start with no networkInterfaces leaves the first start\'s interface cleared', async () => {
      const firstDeps = createMockDeps({
        config: {
          ...createMockDeps().config,
          networkInterfaces: ['eno1'],
        },
      })
      await lifecycle.start(firstDeps)

      const secondLifecycle = new ServerLifecycle()
      vi.spyOn(secondLifecycle, 'setupStorage').mockImplementation(async () => {
        secondLifecycle.matterStoragePath = '/fake/storage/TEST0002'
        return { load: vi.fn(async () => new Map()) } as never
      })
      const secondProto = Object.getPrototypeOf(secondLifecycle) as { startServerNode: (...args: unknown[]) => Promise<void> }
      vi.spyOn(secondProto, 'startServerNode').mockImplementation(async () => {})

      await secondLifecycle.start(createMockDeps({
        config: {
          ...createMockDeps().config,
          uniqueId: 'TEST0002',
          serialNumber: 'TEST0002',
          externalAccessory: true,
        },
      }))

      expect(serverNodeCreateCalls[1].networkInterfaceAtCreate).toBeUndefined()

      // No networkInterfaces on the second lifecycle → interface remains unset after start too.
      const networkVars = sharedVarsState.store.network as Record<string, unknown> | undefined
      expect(networkVars?.interface).toBeUndefined()
    })
  })
})
