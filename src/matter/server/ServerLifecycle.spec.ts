import type { ServerLifecycleDeps } from './ServerLifecycle.js'

import process from 'node:process'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Tests for what ServerLifecycle.start() puts in the matter.js environment.
 *
 * `Environment.default` is a process-wide singleton. start() sets the mDNS
 * variables on it before the node is created (matter.js reads them at that
 * moment) and clears what an earlier server in the same process left there.
 *
 * It no longer sets `network.interface` (#3910 was about the order it was set
 * in). matter.js only uses that variable to label interfaces in a diagnostics
 * list; it never limited which interfaces the Matter port listens on.
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
// against the clear/set operations on sharedVars.
const serverNodeCreateCalls: Array<{ t: number, networkInterfaceAtCreate: unknown, mdnsIpv4AtCreate: unknown }> = []
let serverNodeCreateInvocationIndex = 0

vi.mock('@matter/main', () => ({
  Filesystem: { name: 'Filesystem' },
  Endpoint: class MockEndpoint {
    deviceType: unknown
    options: unknown
    constructor(deviceType: unknown, options: unknown) {
      this.deviceType = deviceType
      this.options = options
    }
  },
  Environment: class MockEnvironment {
    static default = {
      vars: sharedVars,
      set: vi.fn(),
      get: vi.fn(),
    }

    set = vi.fn()
    get = vi.fn()
  },
  ServerNode: {
    create: vi.fn(async () => {
      // Snapshot network.interface at the moment of creation so tests can prove
      // the environment was clean before matter.js's ValueCaster would have run.
      const networkVars = sharedVarsState.store.network as Record<string, unknown> | undefined
      const mdnsVars = sharedVarsState.store.mdns as Record<string, unknown> | undefined
      serverNodeCreateCalls.push({
        t: ++serverNodeCreateInvocationIndex,
        networkInterfaceAtCreate: networkVars?.interface,
        mdnsIpv4AtCreate: mdnsVars?.ipv4,
      })
      return {
        start: vi.fn(async () => {}),
        construction: {
          closed: new Promise<void>(() => {}),
        },
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

// The machine these tests pretend to run on: eno1 and wlan0, as used in bridge.bind below.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    networkInterfaces: () => ({
      eno1: [
        { address: '192.168.1.10', family: 'IPv4' },
        { address: 'fd00:1234::10', family: 'IPv6', scopeid: 0 },
      ],
      wlan0: [
        { address: '10.0.0.5', family: 'IPv4' },
      ],
    }),
  }
})

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
  return {
    Logger: {
      withPrefix: vi.fn(() => mockLogger),
    },
  }
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
  STORAGE_LOCK_RETRY_ATTEMPTS: 3,
  STORAGE_LOCK_RETRY_DELAY_MS: 0,
}))

// Import after mocks are registered so the module under test binds to the mocked symbols.
const { ServerLifecycle } = await import('./ServerLifecycle.js')
const { ServerNode: MatterServerNode } = await import('@matter/main')

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
    getAccessoryCache: vi.fn(() => ({
      load: vi.fn(async () => new Map()),
      cancelPendingSave: vi.fn(),
      hasPendingSave: vi.fn(() => false),
    }) as unknown as ReturnType<ServerLifecycleDeps['getAccessoryCache']>),
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
    ...overrides,
  }

  return deps
}

describe('serverLifecycle — the matter.js environment at start', () => {
  let lifecycle: InstanceType<typeof ServerLifecycle>

  beforeEach(() => {
    vi.clearAllMocks()
    sharedVarsState.store = {}
    sharedVarsState.calls = []
    serverNodeCreateCalls.length = 0
    serverNodeCreateInvocationIndex = 0

    // Watched so the tests can check start() adds no listener to the real process.
    vi.spyOn(process, 'on').mockImplementation(() => process)

    lifecycle = new ServerLifecycle()

    // Bypass storage setup (path validation, mkdir, etc) — not under test here.
    vi.spyOn(lifecycle, 'setupStorage').mockImplementation(async () => {
      lifecycle.matterStoragePath = '/fake/storage/TEST0001'
      return {
        load: vi.fn(async () => new Map()),
      } as never
    })

    // startServerNode awaits serverReady and calls run() — out of scope for these tests.
    const proto = Object.getPrototypeOf(lifecycle) as { startServerNode: (...args: unknown[]) => Promise<void> }
    vi.spyOn(proto, 'startServerNode').mockImplementation(async () => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('process signals', () => {
    // matter.js trapping SIGTERM raced Homebridge's own shutdown: it closed the
    // shared mDNS service while the nodes were still withdrawing their
    // announcements, logged as "MDNS discovery cache is closed" on 0.18
    it('leaves SIGTERM and SIGINT to homebridge, turning matter.js signal handling off before the node exists', async () => {
      await lifecycle.start(createMockDeps())

      const signalSets = sharedVarsState.calls.filter(c => c.op === 'set' && c.name === 'runtime.signals')
      expect(signalSets.length).toBeGreaterThan(0)
      expect((sharedVarsState.store.runtime as Record<string, unknown>)?.signals).toBe(false)
    })

    // The manager stops every server on shutdown. A listener per server stopped
    // each one twice, and the eleventh server in a process made Node warn.
    it('adds no signal listener of its own', async () => {
      await lifecycle.start(createMockDeps())

      expect(process.on).not.toHaveBeenCalledWith('SIGINT', expect.anything())
      expect(process.on).not.toHaveBeenCalledWith('SIGTERM', expect.anything())
    })
  })

  describe('logging', () => {
    // Logs get shared. The pairing banner (CommissioningManager) is the one
    // place the pairing codes are shown.
    it('does not write the passcode to the log while starting', async () => {
      const { Logger } = await import('../../logger.js')
      const logger = vi.mocked(Logger.withPrefix('test'))

      await lifecycle.start(createMockDeps())

      const logged = [
        logger.info,
        logger.warn,
        logger.error,
        logger.debug,
      ].flatMap(level => level.mock.calls).flat().join('\n')
      expect(logged).toContain('Port=5540')
      // the passcode of the mock commissioning manager
      expect(logged).not.toContain('20202021')
    })
  })

  describe('setting mdns.ipv4 before ServerNode creation', () => {
    it('sets mdns.ipv4 to false before ServerNode.create when disableIpv4 is true', async () => {
      const deps = createMockDeps({
        config: {
          ...createMockDeps().config,
          disableIpv4: true,
        },
      })

      await lifecycle.start(deps)

      expect(serverNodeCreateCalls).toHaveLength(1)
      expect(serverNodeCreateCalls[0].mdnsIpv4AtCreate).toBe(false)
    })

    it('does not set mdns.ipv4 when disableIpv4 is not configured', async () => {
      await lifecycle.start(createMockDeps())

      const setCalls = sharedVarsState.calls.filter(c => c.op === 'set' && c.name === 'mdns.ipv4')
      expect(setCalls).toHaveLength(0)
      expect(serverNodeCreateCalls[0].mdnsIpv4AtCreate).toBeUndefined()
    })

    it('does not set mdns.ipv4 when disableIpv4 is false', async () => {
      const deps = createMockDeps({
        config: {
          ...createMockDeps().config,
          disableIpv4: false,
        },
      })

      await lifecycle.start(deps)

      const setCalls = sharedVarsState.calls.filter(c => c.op === 'set' && c.name === 'mdns.ipv4')
      expect(setCalls).toHaveLength(0)
    })

    it('clears a stale mdns.ipv4 left by a previous server instance', async () => {
      sharedVarsState.store.mdns = { ipv4: false, someOtherKey: 'preserved' }

      await lifecycle.start(createMockDeps())

      const mdnsVars = sharedVarsState.store.mdns as Record<string, unknown>
      expect('ipv4' in mdnsVars).toBe(false)
      expect(mdnsVars.someOtherKey).toBe('preserved')
      expect(serverNodeCreateCalls[0].mdnsIpv4AtCreate).toBeUndefined()
    })
  })

  describe('restoring cached accessories before going online (#3969)', () => {
    it('runs restoreAccessoriesFromCache before startServerNode', async () => {
      const order: string[] = []
      const proto = Object.getPrototypeOf(lifecycle) as { startServerNode: (...args: unknown[]) => Promise<void> }
      vi.spyOn(proto, 'startServerNode').mockImplementation(async () => {
        order.push('startServerNode')
      })
      const restoreAccessoriesFromCache = vi.fn(async () => {
        order.push('restore')
      })

      await lifecycle.start(createMockDeps({ restoreAccessoriesFromCache }))

      expect(restoreAccessoriesFromCache).toHaveBeenCalledTimes(1)
      // The controller prunes bridged devices missing from the parts list the
      // moment the node comes online, so the rebuild must happen first.
      expect(order).toEqual(['restore', 'startServerNode'])
    })

    it('still starts when no restoreAccessoriesFromCache hook is provided', async () => {
      await expect(lifecycle.start(createMockDeps())).resolves.not.toThrow()
    })
  })

  describe('bridge.bind and the matter.js environment', () => {
    const withBind = (networkInterfaces: string[]) => createMockDeps({
      config: {
        ...createMockDeps().config,
        networkInterfaces,
      },
    })
    const touchedNetworkInterface = () => sharedVarsState.calls.filter(call => call.name === 'network.interface' || call.name === 'network')

    it('gives matter.js the interface name for mDNS when bridge.bind holds an address', async () => {
      await lifecycle.start(withBind(['10.0.0.5']))

      expect((sharedVarsState.store.mdns as Record<string, unknown>).networkInterface).toBe('wlan0')
    })

    it('sets no mDNS interface when bridge.bind matches nothing on this machine, so matter.js can still start', async () => {
      await lifecycle.start(withBind(['eth9', '192.168.99.99']))

      expect((sharedVarsState.store.mdns as Record<string, unknown> | undefined)?.networkInterface).toBeUndefined()
    })

    it('matches an IPv6 address in bridge.bind by value, not by spelling', async () => {
      await lifecycle.start(withBind(['FD00:1234:0:0:0:0:0:10']))

      expect((sharedVarsState.store.mdns as Record<string, unknown>).networkInterface).toBe('eno1')
    })

    it('reads an unspecified address as "every interface", as HAP does, and does not call it unknown', async () => {
      const { Logger } = await import('../../logger.js')
      const log = Logger.withPrefix('test')

      await lifecycle.start(withBind(['0.0.0.0']))

      expect((sharedVarsState.store.mdns as Record<string, unknown> | undefined)?.networkInterface).toBeUndefined()
      expect(log.warn).not.toHaveBeenCalledWith(expect.stringContaining('is not the name or an address'))
      expect(log.warn).not.toHaveBeenCalledWith(expect.stringContaining('bridge.bind is not set'))
      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('0.0.0.0'))
    })

    it('still limits mDNS to the named interface when an unspecified address sits beside it', async () => {
      const { Logger } = await import('../../logger.js')
      const log = Logger.withPrefix('test')

      await lifecycle.start(withBind(['eno1', '0.0.0.0']))

      expect((sharedVarsState.store.mdns as Record<string, unknown>).networkInterface).toBe('eno1')
      expect(log.warn).not.toHaveBeenCalled()
    })

    it('does not set network.interface: matter.js only labels a diagnostics list with it, and logs an error for it when the last controller is removed', async () => {
      await lifecycle.start(withBind(['eno1', 'wlan0']))

      expect(sharedVarsState.store.network).toBeUndefined()
      expect(touchedNetworkInterface()).toEqual([])
    })

    it('leaves a network variable that something else set as it is', async () => {
      sharedVarsState.store.network = { unrelated: true }

      await lifecycle.start(withBind(['eno1']))

      expect(sharedVarsState.store.network).toEqual({ unrelated: true })
    })
  })
})

describe('serverLifecycle.stop — initialised-but-not-running cleanup', () => {
  let lifecycle: InstanceType<typeof ServerLifecycle>

  beforeEach(() => {
    lifecycle = new ServerLifecycle()
  })

  it('still runs full cleanup when the serverNode is set but isRunning is false', async () => {
    // Models the external-accessory window between start() and runServer():
    // the ServerNode is created, but isRunning is still false. A naive stop()
    // that returns on !isRunning would leak the node — these assertions pin
    // the behaviour.
    const close = vi.fn(async () => {})
    const setServerNode = vi.fn()
    const cleanupHandler = vi.fn(async () => {})

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
      cleanupHandlers: [cleanupHandler],
    })

    await lifecycle.stop(deps, new Map())

    expect(close).toHaveBeenCalledTimes(1)
    expect(cleanupHandler).toHaveBeenCalledTimes(1)
    // cleanup() nulls out the serverNode reference so the next stop() is a no-op.
    expect(setServerNode).toHaveBeenCalledWith(null)
  })

  it('runs cleanup handlers then rethrows when serverNode.close() throws', async () => {
    // A never-ran ServerNode may throw on close(). Three requirements:
    //   1. cleanupHandlers must still run so process-level state is released.
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
    const setServerNode = vi.fn()
    const setAggregator = vi.fn()

    const deps = createMockDeps({
      getServerNode: vi.fn(() => ({ close }) as never),
      setServerNode,
      setAggregator,
      getIsRunning: vi.fn(() => false),
      cleanupHandlers: [cleanupHandler],
    })

    await expect(lifecycle.stop(deps, new Map())).rejects.toThrow('close failed')

    expect(cleanupHandler).toHaveBeenCalledTimes(1)
    // Reference preservation: we did NOT null out serverNode or aggregator.
    expect(setServerNode).not.toHaveBeenCalledWith(null)
    expect(setAggregator).not.toHaveBeenCalledWith(null)
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
      getAccessoryCache: vi.fn(() => ({
        cancelPendingSave,
        hasPendingSave: () => false,
      }) as never),
    })
    const accessories = new Map<string, any>([
      [
        'uuid-1',
        { UUID: 'uuid-1' },
      ],
    ])

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
    const accessories = new Map<string, any>([
      [
        'uuid-1',
        { UUID: 'uuid-1' },
      ],
    ])

    await expect(lifecycle.stop(deps, accessories as never)).rejects.toThrow('close failed')

    expect(accessories.size).toBe(1) // not cleared while the node may still be alive
  })

  it('clears the accessory map once close() succeeds', async () => {
    const close = vi.fn(async () => {})
    const deps = createMockDeps({
      getServerNode: vi.fn(() => ({ close }) as never),
      getIsRunning: vi.fn(() => false),
    })
    const accessories = new Map<string, any>([
      [
        'uuid-1',
        { UUID: 'uuid-1' },
      ],
    ])

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
    })

    await expect(lifecycle.stop(deps, new Map())).resolves.toBeUndefined()
  })
})

describe('serverLifecycle.start — close half-built ServerNode on failure', () => {
  // When start() throws after ServerNode.create but before completing,
  // cleanup() alone would only null the reference, leaving the matter.js
  // server's storage adapters and observables hanging until process exit.
  // The catch path should close() the partial node first so its resources
  // are torn down.
  let lifecycle: InstanceType<typeof ServerLifecycle>

  beforeEach(() => {
    vi.clearAllMocks()
    sharedVarsState.store = {}
    sharedVarsState.calls = []
    serverNodeCreateCalls.length = 0
    serverNodeCreateInvocationIndex = 0

    vi.spyOn(process, 'on').mockImplementation(() => process)

    lifecycle = new ServerLifecycle()

    vi.spyOn(lifecycle, 'setupStorage').mockImplementation(async () => {
      lifecycle.matterStoragePath = '/fake/storage/TEST0001'
      return {
        load: vi.fn(async () => new Map()),
      } as never
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('closes the partial ServerNode when a post-create step in start() throws', async () => {
    // Drive ServerNode.create to return a node we can observe. start()
    // will then fail at the next step (generateCommissioningInfo) and the
    // catch path should call close() on this node before cleanup runs.
    const close = vi.fn(async () => {})
    const { ServerNode } = await import('@matter/main')
    vi.mocked(ServerNode.create).mockResolvedValueOnce({
      start: vi.fn(async () => {}),
      construction: {
        closed: new Promise<void>(() => {}),
      },
      add: vi.fn(),
      close,
    } as never)

    const deps = createMockDeps({
      commissioningManager: {
        passcode: 20202021,
        discriminator: 3840,
        vendorId: 0xFFF1,
        productId: 0x8001,
        loadOrGenerateCredentials: vi.fn(async () => {}),
        setupCommissioningEventListeners: vi.fn(),
        // Fail after the ServerNode has been created and registered — this
        // is exactly the window the bot flagged: post-create, pre-completion.
        generateCommissioningInfo: vi.fn(async () => {
          throw new Error('boom in commissioning info')
        }),
        updateCommissioningFile: vi.fn(async () => {}),
      } as unknown as ServerLifecycleDeps['commissioningManager'],
    })

    await expect(lifecycle.start(deps)).rejects.toThrow('boom in commissioning info')

    // The half-built node was closed before the error propagated.
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('swallows a close() failure on the half-built node and still rethrows the original error', async () => {
    // The half-built node may itself refuse to close cleanly. The original
    // start error is what the caller cares about — the close failure goes
    // to debug logs and the catch path falls through to cleanup() either way.
    const close = vi.fn(async () => {
      throw new Error('close also failed')
    })
    const { ServerNode } = await import('@matter/main')
    vi.mocked(ServerNode.create).mockResolvedValueOnce({
      start: vi.fn(async () => {}),
      construction: {
        closed: new Promise<void>(() => {}),
      },
      add: vi.fn(),
      close,
    } as never)

    const deps = createMockDeps({
      commissioningManager: {
        passcode: 20202021,
        discriminator: 3840,
        vendorId: 0xFFF1,
        productId: 0x8001,
        loadOrGenerateCredentials: vi.fn(async () => {}),
        setupCommissioningEventListeners: vi.fn(),
        generateCommissioningInfo: vi.fn(async () => {
          throw new Error('boom in commissioning info')
        }),
        updateCommissioningFile: vi.fn(async () => {}),
      } as unknown as ServerLifecycleDeps['commissioningManager'],
    })

    await expect(lifecycle.start(deps)).rejects.toThrow('boom in commissioning info')

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('does not call close() when start() fails before a ServerNode is created', async () => {
    // Early failures (storage setup, credential loading) happen before
    // ServerNode.create. There is no node to close — the catch path must
    // not invent a close call against a null reference.
    const close = vi.fn(async () => {})
    const { ServerNode } = await import('@matter/main')
    // Make sure no node is created — but if it were, close would be observable.
    vi.mocked(ServerNode.create).mockResolvedValueOnce({
      start: vi.fn(async () => {}),
      construction: {
        closed: new Promise<void>(() => {}),
      },
      add: vi.fn(),
      close,
    } as never)

    const deps = createMockDeps({
      commissioningManager: {
        passcode: 20202021,
        discriminator: 3840,
        vendorId: 0xFFF1,
        productId: 0x8001,
        // Fail before ServerNode.create runs.
        loadOrGenerateCredentials: vi.fn(async () => {
          throw new Error('credential load failed')
        }),
        setupCommissioningEventListeners: vi.fn(),
        generateCommissioningInfo: vi.fn(async () => {}),
        updateCommissioningFile: vi.fn(async () => {}),
      } as unknown as ServerLifecycleDeps['commissioningManager'],
    })

    await expect(lifecycle.start(deps)).rejects.toThrow('credential load failed')

    expect(close).not.toHaveBeenCalled()
  })

  it('preserves the node reference when the half-built node fails to close (#3944)', async () => {
    // When start() fails AND closing the half-built node also fails, the node
    // may still be bound to its port (the caller keeps the port reserved via
    // portMayStillBeBound). cleanup() must therefore NOT null the node
    // reference — otherwise the orphaned, still-bound node is left with no
    // retry handle.
    const close = vi.fn(async () => {
      throw new Error('close failed')
    })
    const { ServerNode } = await import('@matter/main')
    // Reset first: an earlier test ("fails before a ServerNode is created")
    // leaves an unconsumed mockResolvedValueOnce in the queue, which would
    // otherwise shift this test's create() result to a node whose close()
    // succeeds — masking the close-failure path under test.
    vi.mocked(ServerNode.create).mockReset()
    vi.mocked(ServerNode.create).mockResolvedValueOnce({
      start: vi.fn(async () => {}),
      construction: {
        closed: new Promise<void>(() => {}),
      },
      add: vi.fn(),
      close,
    } as never)

    const proto = Object.getPrototypeOf(lifecycle) as { startServerNode: (...a: unknown[]) => Promise<void> }
    vi.spyOn(proto, 'startServerNode').mockRejectedValueOnce(new Error('boom in startServerNode'))

    // Keep getServerNode/setServerNode linked so start() can hand the created
    // node back to the catch path (where close() runs), while still spying on
    // setServerNode to assert the reference is never nulled.
    let serverNode: unknown = null
    const setServerNode = vi.fn((n: unknown) => {
      serverNode = n
    })
    const deps = createMockDeps({
      getServerNode: vi.fn(() => serverNode as never),
      setServerNode,
    })

    let thrown: any
    await lifecycle.start(deps).catch(e => (thrown = e))

    // The original error propagates, flagged so the caller reserves the port.
    expect(thrown.message).toBe('boom in startServerNode')
    expect(thrown.portMayStillBeBound).toBe(true)
    expect(close).toHaveBeenCalledTimes(1)

    // Node reference preserved (never nulled) — retry handle survives.
    expect(setServerNode).not.toHaveBeenCalledWith(null)
  })
})

describe('serverLifecycle.start — port-binding signal when the half-built node fails to close (#3944)', () => {
  let lifecycle: InstanceType<typeof ServerLifecycle>

  beforeEach(() => {
    vi.clearAllMocks()
    sharedVarsState.store = {}
    vi.spyOn(process, 'on').mockImplementation(() => process)

    lifecycle = new ServerLifecycle()
    vi.spyOn(lifecycle, 'setupStorage').mockImplementation(async () => {
      lifecycle.matterStoragePath = '/fake/storage/TEST0001'
      return {
        load: vi.fn(async () => new Map()),
      } as never
    })
    const proto = Object.getPrototypeOf(lifecycle) as { startServerNode: (...args: unknown[]) => Promise<void> }
    vi.spyOn(proto, 'startServerNode').mockImplementation(async () => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Build deps whose start() fails after the ServerNode exists, with the
  // half-built node (returned by getServerNode in the catch path) closing as
  // given. Overriding getServerNode keeps the close behaviour fully controlled
  // and avoids leaking a once-mock on the shared ServerNode.create.
  function depsThatFailAfterNodeCreation(close: () => Promise<void>): ServerLifecycleDeps {
    const partialNode = {
      start: vi.fn(async () => {}),
      construction: {
        closed: new Promise<void>(() => {}),
      },
      add: vi.fn(),
      close: vi.fn(close),
    }
    return createMockDeps({
      getServerNode: vi.fn(() => partialNode as never),
      commissioningManager: {
        passcode: 20202021,
        discriminator: 3840,
        vendorId: 0xFFF1,
        productId: 0x8001,
        loadOrGenerateCredentials: vi.fn(async () => {}),
        setupCommissioningEventListeners: vi.fn(),
        // Throws after the ServerNode is created, so the catch path reaches
        // partialNode.close().
        generateCommissioningInfo: vi.fn(async () => {
          throw new Error('commissioning failed')
        }),
        updateCommissioningFile: vi.fn(async () => {}),
      } as unknown as ServerLifecycleDeps['commissioningManager'],
    })
  }

  it('flags the rethrown error portMayStillBeBound when close() rejects', async () => {
    const deps = depsThatFailAfterNodeCreation(() => Promise.reject(new Error('close failed')))

    let thrown: any
    await lifecycle.start(deps).catch(e => (thrown = e))

    expect(thrown.message).toBe('commissioning failed')
    expect(thrown.portMayStillBeBound).toBe(true)
  })

  it('does not flag the error when the half-built node closes cleanly', async () => {
    const deps = depsThatFailAfterNodeCreation(() => Promise.resolve())

    let thrown: any
    await lifecycle.start(deps).catch(e => (thrown = e))

    expect(thrown.message).toBe('commissioning failed')
    expect(thrown.portMayStillBeBound).toBeUndefined()
  })
})

describe('serverLifecycle.createServerNodeWithRecovery — transient storage-lock retry (#3970)', () => {
  let lifecycle: InstanceType<typeof ServerLifecycle>

  beforeEach(() => {
    vi.clearAllMocks()
    lifecycle = new ServerLifecycle()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retries and succeeds once a lock held by another process clears', async () => {
    // A quick restart: the previous instance still holds the storage lock on the
    // first attempt, then releases it.
    vi.mocked(MatterServerNode.create).mockRejectedValueOnce(
      new Error('Storage is locked by another process (pid 1234)'),
    )

    const node = await lifecycle.createServerNodeWithRecovery({} as never, 'TEST0001')

    expect(node).toBeDefined()
    expect(MatterServerNode.create).toHaveBeenCalledTimes(2)
  })

  it('retries when matter.js reports the lock as the cause of another error', async () => {
    // What matter.js 0.18 really throws (#4047): the lock is one level down.
    vi.mocked(MatterServerNode.create).mockRejectedValueOnce(
      new Error('[crashed-dependency] node store unavailable due to initialization error', {
        cause: new Error('[storage-lock] Storage is locked by another process (pid 160)'),
      }),
    )

    const node = await lifecycle.createServerNodeWithRecovery({} as never, 'TEST0001')

    expect(node).toBeDefined()
    expect(MatterServerNode.create).toHaveBeenCalledTimes(2)
  })

  it('gives up after the retry budget when the lock never clears', async () => {
    vi.mocked(MatterServerNode.create).mockRejectedValue(
      new Error('Storage is locked by another process (pid 1234)'),
    )

    await expect(
      lifecycle.createServerNodeWithRecovery({} as never, 'TEST0001'),
    ).rejects.toThrow(/locked by another process/)

    // STORAGE_LOCK_RETRY_ATTEMPTS is mocked to 3.
    expect(MatterServerNode.create).toHaveBeenCalledTimes(3)
  })

  it('does not retry "already locked by this process" — that is a bug, not a race', async () => {
    vi.mocked(MatterServerNode.create).mockRejectedValue(
      new Error('Storage is already locked by this process'),
    )

    await expect(
      lifecycle.createServerNodeWithRecovery({} as never, 'TEST0001'),
    ).rejects.toThrow(/already locked by this process/)

    expect(MatterServerNode.create).toHaveBeenCalledTimes(1)
  })

  it('does not retry an unrelated creation error', async () => {
    vi.mocked(MatterServerNode.create).mockRejectedValue(new Error('boom'))

    await expect(
      lifecycle.createServerNodeWithRecovery({} as never, 'TEST0001'),
    ).rejects.toThrow('boom')

    expect(MatterServerNode.create).toHaveBeenCalledTimes(1)
  })
})

/**
 * Regression cover for #3987: every Matter child bridge on Windows crashed at
 * startup with "Storage path not allowed". The allowlist guessed at three
 * likely storage locations instead of asking `User.storagePath()` - so any
 * custom `-U` path failed outright, and a Windows path that differed from the
 * guess by nothing more than letter case failed the raw `startsWith` check.
 */
describe('setupStorage path validation', () => {
  let storageBase: string

  beforeAll(async () => {
    const { mkdtemp } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { User } = await import('../../user.js')
    // A tmp dir is deliberately OUTSIDE every guessed base (homedir, cwd,
    // /var/lib/homebridge), so only the configured-path entry can admit it
    storageBase = await mkdtemp(join(tmpdir(), 'hb-matter-storage-'))
    User.setStoragePath(storageBase)
  })

  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(storageBase, { recursive: true, force: true })
  })

  it('accepts the matter directory under the configured storage path', async () => {
    const { join } = await import('node:path')
    const lifecycle = new ServerLifecycle()

    const cache = await lifecycle.setupStorage({
      storagePath: join(storageBase, 'matter'),
      uniqueId: 'TEST3987',
    } as never)

    expect(cache).toBeDefined()
    expect(lifecycle.matterStoragePath).toBe(join(storageBase, 'matter', 'TEST3987'))
  })

  it('still rejects a sibling that merely shares the prefix', async () => {
    const { join } = await import('node:path')
    const lifecycle = new ServerLifecycle()

    await expect(lifecycle.setupStorage({
      storagePath: join(`${storageBase}-evil`, 'matter'),
      uniqueId: 'TEST3987',
    } as never)).rejects.toThrow('Storage path not allowed')
  })

  it('rests on relative() comparing windows paths case-insensitively', async () => {
    // Pin the node behaviour the windows fix relies on, since this suite
    // cannot run the win32 path rules natively
    const { win32 } = await import('node:path')
    expect(win32.relative('C:\\Users\\Ben\\.homebridge', 'c:\\users\\ben\\.homebridge\\matter')).toBe('matter')
    expect(win32.relative('C:\\Users\\Ben\\.homebridge', 'C:\\Users\\Ben\\.homebridge-evil\\matter').startsWith('..')).toBe(true)
  })
})

/**
 * #3996: a plugin's `manufacturer` and `model` were collected, validated and
 * truncated to exactly the BasicInformation limits — and then never read, so
 * an external Matter accessory reported "Homebridge" as its manufacturer and
 * its own name as its model.
 *
 * The bridges pass a manufacturer and model into this same config too
 * ("homebridge.io" / "homebridge"), so reading them unconditionally would have
 * rewritten the identity of every commissioned bridge. Hence the split below.
 */
describe('serverLifecycle — BasicInformation identity (#3996)', () => {
  let lifecycle: InstanceType<typeof ServerLifecycle>

  beforeEach(() => {
    vi.clearAllMocks()
    sharedVarsState.store = {}
    // clearAllMocks resets calls, not implementations - an earlier block leaves
    // create() permanently rejecting via mockRejectedValue, so put a working
    // one back rather than inheriting it
    vi.mocked(MatterServerNode.create).mockImplementation(async () => ({
      start: vi.fn(async () => {}),
      construction: {
        closed: new Promise<void>(() => {}),
      },
      add: vi.fn(),
      close: vi.fn(),
    }) as never)
    vi.spyOn(process, 'on').mockImplementation(() => process)
    lifecycle = new ServerLifecycle()
    vi.spyOn(lifecycle, 'setupStorage').mockImplementation(async () => {
      lifecycle.matterStoragePath = '/fake/storage/TEST0001'
      return {
        load: vi.fn(async () => new Map()),
      } as never
    })
    const proto = Object.getPrototypeOf(lifecycle) as { startServerNode: (...args: unknown[]) => Promise<void> }
    vi.spyOn(proto, 'startServerNode').mockImplementation(async () => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function basicInformationFor(config: Record<string, unknown>) {
    const deps = createMockDeps()
    Object.assign(deps.config, config)
    await lifecycle.start(deps)
    const options = vi.mocked(MatterServerNode.create).mock.calls[0][0] as any
    return options.basicInformation
  }

  it('reports the plugin manufacturer and model for an external accessory', async () => {
    const basicInformation = await basicInformationFor({
      externalAccessory: true,
      displayName: 'Roborock S8',
      manufacturer: 'Roborock',
      model: 'S8 Pro Ultra',
    })

    expect(basicInformation.vendorName).toBe('Roborock')
    expect(basicInformation.productName).toBe('S8 Pro Ultra')
    // The node's own name is still the label the user sees
    expect(basicInformation.nodeLabel).toBe('Roborock S8')
    // productLabel SHALL NOT contain the vendor name
    expect(basicInformation.productLabel).toBe('S8')
  })

  it('falls back to the model when stripping the vendor leaves nothing', async () => {
    const basicInformation = await basicInformationFor({
      externalAccessory: true,
      displayName: 'Roborock',
      manufacturer: 'Roborock',
      model: 'S8 Pro Ultra',
    })

    expect(basicInformation.productLabel).toBe('S8 Pro Ultra')
  })

  it('leaves a bridge reporting Homebridge, whatever manufacturer it was given', async () => {
    // The regression this fix must not cause: every bridge passes
    // "homebridge.io" and "homebridge" in, and neither belongs here
    const basicInformation = await basicInformationFor({
      externalAccessory: false,
      displayName: 'Homebridge ABCD',
      manufacturer: 'homebridge.io',
      model: 'homebridge',
    })

    expect(basicInformation.vendorName).toBe('Homebridge')
    expect(basicInformation.productName).toBe('Homebridge ABCD')
    expect(basicInformation.productLabel).toBe('ABCD')
  })

  it('still names itself after the accessory when a plugin gives no model', async () => {
    const basicInformation = await basicInformationFor({
      externalAccessory: true,
      displayName: 'Front Door',
      manufacturer: 'Acme',
      model: undefined,
    })

    expect(basicInformation.vendorName).toBe('Acme')
    expect(basicInformation.productName).toBe('Front Door')
  })

  it('caps the vendor and product names at the 32 characters the cluster allows', async () => {
    const basicInformation = await basicInformationFor({
      externalAccessory: true,
      displayName: 'Device',
      manufacturer: 'Acme',
      model: 'M'.repeat(40),
    })

    expect(basicInformation.productName).toHaveLength(32)
  })
})

/**
 * A node that cannot go online (its port is taken, say) used to be reported as
 * started: run() was not awaited, so its failure was only logged.
 */
describe('serverLifecycle — a node that fails to go online', () => {
  let lifecycle: InstanceType<typeof ServerLifecycle>
  let close: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    sharedVarsState.store = {}
    close = vi.fn(async () => {})
    vi.mocked(MatterServerNode.create).mockImplementation(async () => ({
      start: vi.fn(async () => {
        throw new Error('bind EADDRINUSE 0.0.0.0:5540')
      }),
      construction: {
        closed: new Promise<void>(() => {}),
      },
      add: vi.fn(),
      close,
    }) as never)
    vi.spyOn(process, 'on').mockImplementation(() => process)
    lifecycle = new ServerLifecycle()
    vi.spyOn(lifecycle, 'setupStorage').mockImplementation(async () => {
      lifecycle.matterStoragePath = '/fake/storage/TEST0001'
      return {
        load: vi.fn(async () => new Map()),
        cancelPendingSave: vi.fn(),
        hasPendingSave: vi.fn(() => false),
      } as never
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects start() and is not marked as running', async () => {
    const deps = createMockDeps()

    await expect(lifecycle.start(deps)).rejects.toThrow('EADDRINUSE')

    expect(deps.getIsRunning()).toBe(false)
    expect(deps.setIsRunning).not.toHaveBeenCalledWith(true)
    // the half-built node is closed again
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('rejects runServer() for a deferred server and is not marked as running', async () => {
    const deps = createMockDeps()
    deps.config.deferOnline = true
    await lifecycle.start(deps)

    await expect(lifecycle.runServer(deps)).rejects.toThrow('EADDRINUSE')

    expect(deps.getIsRunning()).toBe(false)
  })
})

/**
 * matter.js can shut a node down by itself: a failed background task of any
 * node stops every node in the process.
 */
describe('serverLifecycle — a node that goes offline without being asked to', () => {
  let lifecycle: InstanceType<typeof ServerLifecycle>
  let offlineListeners: Array<() => void>
  let nodeLifecycle: { shouldBeOnline: boolean, offline: { on: (listener: () => void) => void, off: (listener: () => void) => void } }

  beforeEach(() => {
    vi.clearAllMocks()
    sharedVarsState.store = {}
    offlineListeners = []
    nodeLifecycle = {
      shouldBeOnline: true,
      offline: {
        on: (listener) => {
          offlineListeners.push(listener)
        },
        off: (listener) => {
          offlineListeners = offlineListeners.filter(existing => existing !== listener)
        },
      },
    }
    vi.mocked(MatterServerNode.create).mockImplementation(async () => ({
      start: vi.fn(async () => {}),
      construction: {
        closed: new Promise<void>(() => {}),
      },
      lifecycle: nodeLifecycle,
      add: vi.fn(),
      close: vi.fn(async () => {}),
    }) as never)
    vi.spyOn(process, 'on').mockImplementation(() => process)
    lifecycle = new ServerLifecycle()
    vi.spyOn(lifecycle, 'setupStorage').mockImplementation(async () => {
      lifecycle.matterStoragePath = '/fake/storage/TEST0001'
      return {
        load: vi.fn(async () => new Map()),
        cancelPendingSave: vi.fn(),
        hasPendingSave: vi.fn(() => false),
      } as never
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const goOffline = (): void => offlineListeners.forEach(listener => listener())
  // the logger is mocked in this file: every prefix shares one set of spies
  const mockedLogError = async () => vi.mocked((await import('../../logger.js')).Logger.withPrefix('test')).error

  it('is reported as an error and no longer counts as running', async () => {
    const errorSpy = await mockedLogError()
    const noteStoppedByItself = vi.fn()
    const deps = createMockDeps({ noteStoppedByItself })
    await lifecycle.start(deps)
    expect(deps.getIsRunning()).toBe(true)

    // matter.js closed the node: it no longer wants to be online
    nodeLifecycle.shouldBeOnline = false
    goOffline()

    expect(deps.getIsRunning()).toBe(false)
    expect(noteStoppedByItself).toHaveBeenCalledOnce()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('went offline without being asked to'))
  })

  it('is left alone while matter.js resets the node after the last controller removed it', async () => {
    const errorSpy = await mockedLogError()
    const deps = createMockDeps()
    await lifecycle.start(deps)

    // offline for the reset, and coming straight back
    goOffline()

    expect(deps.getIsRunning()).toBe(true)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('says nothing when homebridge stops the server itself', async () => {
    const errorSpy = await mockedLogError()
    const deps = createMockDeps()
    await lifecycle.start(deps)
    vi.mocked(deps.getServerNode()!.close).mockImplementation(async () => {
      nodeLifecycle.shouldBeOnline = false
      goOffline()
    })

    await lifecycle.stop(deps, new Map())

    expect(errorSpy).not.toHaveBeenCalled()
    // and the listener is taken off the node again
    expect(offlineListeners).toEqual([])
  })
})

/** A SIGTERM while Matter is still starting: stop() runs before start() is done. */
describe('serverLifecycle — a stop that comes while the server is still starting', () => {
  let lifecycle: InstanceType<typeof ServerLifecycle>
  let nodeStart: ReturnType<typeof vi.fn>
  let nodeClose: ReturnType<typeof vi.fn>
  let finishCreate: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    sharedVarsState.store = {}
    nodeStart = vi.fn(async () => {})
    nodeClose = vi.fn(async () => {})
    const created = new Promise<void>((resolve) => {
      finishCreate = resolve
    })
    vi.mocked(MatterServerNode.create).mockImplementation(async () => {
      await created
      return {
        start: nodeStart,
        construction: {
          closed: new Promise<void>(() => {}),
        },
        lifecycle: {
          shouldBeOnline: true,
          offline: {
            on: vi.fn(),
            off: vi.fn(),
          },
        },
        add: vi.fn(),
        close: nodeClose,
      } as never
    })
    vi.spyOn(process, 'on').mockImplementation(() => process)
    lifecycle = new ServerLifecycle()
    vi.spyOn(lifecycle, 'setupStorage').mockImplementation(async () => {
      lifecycle.matterStoragePath = '/fake/storage/TEST0001'
      return {
        load: vi.fn(async () => new Map()),
        cancelPendingSave: vi.fn(),
        hasPendingSave: vi.fn(() => false),
      } as never
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not put the node on the network afterwards, and closes it', async () => {
    const deps = createMockDeps()
    const starting = lifecycle.start(deps)
    const outcome = starting.then(() => 'started', (error: Error) => error.message)
    // let start() get as far as creating the node
    await vi.waitFor(() => expect(MatterServerNode.create).toHaveBeenCalled())

    // the node does not exist yet, so there is nothing for stop() to close
    await lifecycle.stop(deps, new Map())
    finishCreate()

    expect(await outcome).toContain('cancelled because it was asked to stop')
    expect(nodeStart).not.toHaveBeenCalled()
    expect(nodeClose).toHaveBeenCalledTimes(1)
    expect(deps.getIsRunning()).toBe(false)
    expect(deps.getServerNode()).toBeNull()
  })

  it('starts as normal the next time', async () => {
    const deps = createMockDeps()
    const first = lifecycle.start(deps).catch(() => {})
    await vi.waitFor(() => expect(MatterServerNode.create).toHaveBeenCalled())
    await lifecycle.stop(deps, new Map())
    finishCreate()
    await first

    await lifecycle.start(deps)

    expect(nodeStart).toHaveBeenCalledTimes(1)
    expect(deps.getIsRunning()).toBe(true)
  })
})
