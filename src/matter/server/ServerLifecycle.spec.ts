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
    getAccessoryCache: vi.fn(() => ({ load: vi.fn(async () => new Map()), cancelPendingSave: vi.fn() }) as unknown as ReturnType<ServerLifecycleDeps['getAccessoryCache']>),
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

describe('serverLifecycle.stop — initialised-but-not-running cleanup', () => {
  let lifecycle: InstanceType<typeof ServerLifecycle>

  beforeEach(() => {
    lifecycle = new ServerLifecycle()
  })

  it('still runs full cleanup when serverNode + shutdownHandler are set but isRunning is false', async () => {
    // Models the external-accessory window between start() and runServer():
    // matter.js handlers are registered and the ServerNode is created, but
    // isRunning is still false. A naive stop() that returns on !isRunning
    // would leak the handlers — these assertions pin the new behaviour.
    const close = vi.fn(async () => {})
    const setServerNode = vi.fn()
    const setShutdownHandler = vi.fn()
    const cleanupHandler = vi.fn(async () => {})
    const shutdownHandler = vi.fn(async () => {})

    let serverNode: unknown = { close }
    let running = false

    const deps = createMockDeps({
      getServerNode: vi.fn(() => serverNode as never),
      setServerNode: vi.fn((n) => {
        serverNode = n
      }).mockImplementation(setServerNode),
      getIsRunning: vi.fn(() => running),
      setIsRunning: vi.fn((v) => {
        running = v
      }),
      shutdownHandler,
      setShutdownHandler,
      cleanupHandlers: [cleanupHandler],
    })

    await lifecycle.stop(deps, new Map())

    expect(close).toHaveBeenCalledTimes(1)
    expect(cleanupHandler).toHaveBeenCalledTimes(1)
    expect(setShutdownHandler).toHaveBeenCalledWith(null)
    // cleanup() nulls out the serverNode reference so the next stop() is a no-op.
    expect(setServerNode).toHaveBeenCalledWith(null)
  })

  it('runs cleanup handlers then rethrows when serverNode.close() throws', async () => {
    // A never-ran ServerNode may throw on close(). Three requirements:
    //   1. cleanupHandlers must still run so process-level state is released.
    //      The SIGINT/SIGTERM handler is deliberately KEPT (see the dedicated
    //      test below) so the still-bound node retains a shutdown hook.
    //   2. stop() must reject so the caller knows the port may still be
    //      bound — `publishExternalMatterAccessory` gates port release on
    //      stop() resolving cleanly, and a swallowed close error would
    //      silently free a port the matter.js server is still holding.
    //   3. The serverNode reference must be preserved so a caller that
    //      retries stop() has a handle to close again. Nulling it here
    //      would make the retry skip the close branch entirely and leave
    //      the matter.js server stranded with no way to address it.
    const close = vi.fn(async () => {
      throw new Error('close failed')
    })
    const cleanupHandler = vi.fn(async () => {})
    const setShutdownHandler = vi.fn()
    const setServerNode = vi.fn()
    const setAggregator = vi.fn()
    const shutdownHandler = vi.fn(async () => {})

    const deps = createMockDeps({
      getServerNode: vi.fn(() => ({ close }) as never),
      setServerNode,
      setAggregator,
      getIsRunning: vi.fn(() => false),
      shutdownHandler,
      setShutdownHandler,
      cleanupHandlers: [cleanupHandler],
    })

    await expect(lifecycle.stop(deps, new Map())).rejects.toThrow('close failed')

    expect(cleanupHandler).toHaveBeenCalledTimes(1)
    // The shutdown handler is preserved (not nulled) so the orphaned node
    // still tears down on process exit.
    expect(setShutdownHandler).not.toHaveBeenCalledWith(null)
    // Reference preservation: we did NOT null out serverNode or aggregator.
    expect(setServerNode).not.toHaveBeenCalledWith(null)
    expect(setAggregator).not.toHaveBeenCalledWith(null)
  })

  it('keeps the SIGINT/SIGTERM shutdown handler registered when close() fails (#3944)', async () => {
    // When close() fails the node may still be bound to its port. The sole
    // caller (ExternalMatterAccessoryPublisher) never retries stop(), so if
    // cleanup removed the process shutdown handler the orphaned node would be
    // left with no graceful-shutdown hook. cleanup() must therefore leave the
    // SIGINT/SIGTERM handler in place while close() failed.
    const offSpy = vi.spyOn(process, 'off')
    try {
      const close = vi.fn(async () => {
        throw new Error('close failed')
      })
      const setShutdownHandler = vi.fn()
      const shutdownHandler = vi.fn(async () => {})

      const deps = createMockDeps({
        getServerNode: vi.fn(() => ({ close }) as never),
        getIsRunning: vi.fn(() => false),
        shutdownHandler,
        setShutdownHandler,
        cleanupHandlers: [],
      })

      await expect(lifecycle.stop(deps, new Map())).rejects.toThrow('close failed')

      // The handler was neither detached from the process nor cleared.
      expect(offSpy).not.toHaveBeenCalledWith('SIGINT', shutdownHandler)
      expect(offSpy).not.toHaveBeenCalledWith('SIGTERM', shutdownHandler)
      expect(setShutdownHandler).not.toHaveBeenCalledWith(null)
    } finally {
      offSpy.mockRestore()
    }
  })

  it('cancels a pending debounced cache save before clearing the map (#3944)', async () => {
    // A debounced save armed during registration captures the live accessory
    // map by reference. If stop() clears the map without cancelling it first,
    // the timer fires later and persists an empty map — wiping the external
    // accessory's cache. stop() must cancel it regardless of isRunning.
    const close = vi.fn(async () => {})
    const cancelPendingSave = vi.fn(() => true)
    const deps = createMockDeps({
      getServerNode: vi.fn(() => ({ close }) as never),
      getIsRunning: vi.fn(() => false), // init-but-never-ran external server
      getAccessoryCache: vi.fn(() => ({ cancelPendingSave }) as never),
    })
    const accessories = new Map<string, any>([['uuid-1', { UUID: 'uuid-1' }]])

    await lifecycle.stop(deps, accessories as never)

    expect(cancelPendingSave).toHaveBeenCalledTimes(1)
    expect(accessories.size).toBe(0)
  })

  it('preserves the accessory map when close() fails so a retry has its state', async () => {
    // The serverNode is preserved for a retry (above); the accessory state
    // behind it must be preserved too, otherwise the retry's node has nothing.
    const close = vi.fn(async () => {
      throw new Error('close failed')
    })
    const deps = createMockDeps({
      getServerNode: vi.fn(() => ({ close }) as never),
      getIsRunning: vi.fn(() => false),
    })
    const accessories = new Map<string, any>([['uuid-1', { UUID: 'uuid-1' }]])

    await expect(lifecycle.stop(deps, accessories as never)).rejects.toThrow('close failed')

    expect(accessories.size).toBe(1) // not cleared while the node may still be alive
  })

  it('clears the accessory map once close() succeeds', async () => {
    const close = vi.fn(async () => {})
    const deps = createMockDeps({
      getServerNode: vi.fn(() => ({ close }) as never),
      getIsRunning: vi.fn(() => false),
    })
    const accessories = new Map<string, any>([['uuid-1', { UUID: 'uuid-1' }]])

    await lifecycle.stop(deps, accessories as never)

    expect(accessories.size).toBe(0) // cleared after a clean close
  })

  it('lets a retry of stop() try close() again after the first close failed', async () => {
    // End-to-end of the preservation contract: the first stop() rejects
    // and leaves the serverNode reference in place; a follow-up stop()
    // must see that reference and have a second attempt at close().
    let attempt = 0
    const close = vi.fn(async () => {
      attempt += 1
      if (attempt === 1) {
        throw new Error('close failed')
      }
      // second attempt resolves cleanly
    })
    let serverNode: unknown = { close }
    let running = false

    const deps = createMockDeps({
      getServerNode: vi.fn(() => serverNode as never),
      setServerNode: vi.fn((n) => {
        serverNode = n
      }),
      getIsRunning: vi.fn(() => running),
      setIsRunning: vi.fn((v) => {
        running = v
      }),
      shutdownHandler: vi.fn(async () => {}) as never,
      cleanupHandlers: [],
    })

    await expect(lifecycle.stop(deps, new Map())).rejects.toThrow('close failed')
    expect(close).toHaveBeenCalledTimes(1)
    // Reference survived the first stop() — retry can still find it.
    expect(serverNode).not.toBeNull()

    // Second stop() — close succeeds, reference is nulled the normal way.
    await expect(lifecycle.stop(deps, new Map())).resolves.toBeUndefined()
    expect(close).toHaveBeenCalledTimes(2)
    expect(serverNode).toBeNull()
  })

  it('still returns early when neither running nor any resources are set up', async () => {
    // Multiple stop() calls must remain idempotent — once cleanup has run
    // and nulled everything out, a subsequent stop() should be a no-op.
    const deps = createMockDeps({
      getServerNode: vi.fn(() => null),
      getIsRunning: vi.fn(() => false),
      shutdownHandler: null,
    })

    await expect(lifecycle.stop(deps, new Map())).resolves.toBeUndefined()
  })
})
