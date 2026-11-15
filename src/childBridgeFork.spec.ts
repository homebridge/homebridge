import type { Plugin } from './plugin.js'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { Bridge, HAPStorage } from '@homebridge/hap-nodejs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeAPI, PluginType } from './api.js'
import { BridgeService } from './bridgeService.js'
import { ChildBridgeFork } from './childBridgeFork.js'
import { ChildProcessMessageEventType } from './childBridgeService.js'
import { Logger } from './logger.js'
import { PluginManager } from './pluginManager.js'

describe('childBridgeFork — parent disconnect handling', () => {
  let onSpy: any
  let setIntervalSpy: any
  let registered: Record<string, any[]>

  beforeEach(() => {
    registered = {}
    onSpy = vi.spyOn(process, 'on').mockImplementation((event: any, handler: any) => {
      registered[event] = registered[event] || []
      registered[event].push(handler)
      return process
    })
    setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(() => 0 as any)
  })

  afterEach(() => {
    onSpy.mockRestore()
    setIntervalSpy.mockRestore()
    vi.resetModules()
  })

  it('registers a process.on("disconnect") listener (instead of polling setInterval)', async () => {
    vi.resetModules()
    // Fresh import so the module-level setup re-runs against our spies.
    await import('./childBridgeFork.js')

    expect(registered.disconnect).toBeDefined()
    expect(registered.disconnect.length).toBeGreaterThan(0)

    // The previous implementation polled \`process.connected\` every 5 seconds.
    // No 5000ms-interval poll should be scheduled now.
    const fiveSecondPolls = setIntervalSpy.mock.calls.filter(([, ms]: any[]) => ms === 5000)
    expect(fiveSecondPolls).toHaveLength(0)
  })
})

describe('childBridgeFork — messages from the parent', () => {
  let onSpy: any
  let registered: Record<string, any[]>

  beforeEach(() => {
    registered = {}
    onSpy = vi.spyOn(process, 'on').mockImplementation((event: any, handler: any) => {
      registered[event] = registered[event] || []
      registered[event].push(handler)
      return process
    })
  })

  afterEach(() => {
    onSpy.mockRestore()
    vi.resetModules()
  })

  // typeof null is 'object', so a null message used to throw in the listener
  it.each([null, undefined, 'text', 42, {}])('ignores a message that is not an object with an id (%s)', async (message) => {
    vi.resetModules()
    await import('./childBridgeFork.js')

    expect(() => registered.message[0](message)).not.toThrow()
  })

  // Each id the parent sends goes to one method of the fork, with its data.
  it.each([
    [
      'load',
      'loadPlugin',
      { type: 'platform' },
    ],
    ['start', 'startBridge', undefined],
    [
      'portAllocated',
      'handleExternalResponse',
      { username: '0E:DC:5D:BE:D6:75', port: 50001 },
    ],
    ['startMatterMonitoring', 'handleStartMatterMonitoring', undefined],
    ['stopMatterMonitoring', 'handleStopMatterMonitoring', undefined],
    ['getMatterAccessories', 'handleGetMatterAccessories', undefined],
    [
      'getMatterAccessoryInfo',
      'handleGetMatterAccessoryInfo',
      { uuid: 'u', correlationId: 'c' },
    ],
    [
      'matterAccessoryControl',
      'handleMatterAccessoryControl',
      {
        uuid: 'u',
        cluster: 'onOff',
        attributes: { onOff: true },
      },
    ],
  ] as const)('hands a "%s" message to %s', async (id, method, data) => {
    vi.resetModules()
    const fork = await import('./childBridgeFork.js')
    const handler = vi.spyOn(fork.ChildBridgeFork.prototype, method).mockImplementation((() => Promise.resolve()) as never)

    registered.message[0]({ id, data })

    expect(handler.mock.calls).toEqual([
      data === undefined
        ? []
        : [data],
    ])
    handler.mockRestore()
  })

  it('warns about a message with an id it does not know', async () => {
    vi.resetModules()
    await import('./childBridgeFork.js')
    // the logger module the freshly imported fork uses
    const fresh = await import('./logger.js')
    const warn = vi.spyOn(fresh.Logger.internal, 'warn').mockImplementation(() => {})

    registered.message[0]({ id: 'somethingNew' })

    expect(warn).toHaveBeenCalledWith('Received unknown message type from parent process: somethingNew')
    warn.mockRestore()
  })
})

describe('childBridgeFork — ending the process', () => {
  let registered: Record<string, any[]>
  let shutdown: any
  let exit: any
  let timers: Array<{ ms: number, unref: ReturnType<typeof vi.fn> }>
  let channelUnref: ReturnType<typeof vi.fn>
  const originalChannel = Object.getOwnPropertyDescriptor(process, 'channel')

  beforeEach(async () => {
    registered = {}
    vi.spyOn(process, 'on').mockImplementation((event: any, handler: any) => {
      registered[event] = registered[event] || []
      registered[event].push(handler)
      return process
    })
    exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    timers = []
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((_handler: unknown, ms: number) => {
      const timer = {
        ms,
        unref: vi.fn(),
      }
      timers.push(timer)
      return timer
    }) as never)
    channelUnref = vi.fn()
    Object.defineProperty(process, 'channel', {
      value: { unref: channelUnref },
      configurable: true,
    })
    vi.spyOn(Logger.internal, 'info').mockImplementation(() => {})

    vi.resetModules()
    const fork = await import('./childBridgeFork.js')
    shutdown = vi.spyOn(fork.ChildBridgeFork.prototype, 'shutdown').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    process.exitCode = undefined
    if (originalChannel) {
      Object.defineProperty(process, 'channel', originalChannel)
    } else {
      delete (process as { channel?: unknown }).channel
    }
  })

  it('tears down on SIGTERM and lets the process end by itself, with five seconds as the limit', () => {
    registered.SIGTERM[0]()

    expect(shutdown).toHaveBeenCalledTimes(1)
    expect(process.exitCode).toBe(143)
    // the ipc channel no longer keeps the process alive ...
    expect(channelUnref).toHaveBeenCalledTimes(1)
    // ... and the force-exit timer does not either
    expect(timers).toEqual([
      {
        ms: 5000,
        unref: expect.any(Function),
      },
    ])
    expect(timers[0].unref).toHaveBeenCalledTimes(1)
    expect(exit).not.toHaveBeenCalled()
  })

  it('tears down when the parent process has gone, instead of exiting at once', () => {
    registered.disconnect[0]()

    expect(shutdown).toHaveBeenCalledTimes(1)
    expect(process.exitCode).toBe(1)
    expect(exit).not.toHaveBeenCalled()
  })

  // A signal while the plugin was loading used to be followed by the load
  // finishing, the parent sending START, and the bridge being published: five
  // seconds later the process was cut off with no goodbye.
  it('ignores LOAD and START from the parent once the process is ending', async () => {
    const fork = await import('./childBridgeFork.js')
    const loadPlugin = vi.spyOn(fork.ChildBridgeFork.prototype, 'loadPlugin').mockResolvedValue(undefined)
    const startBridge = vi.spyOn(fork.ChildBridgeFork.prototype, 'startBridge').mockResolvedValue(undefined)

    registered.SIGTERM[0]()
    registered.message[0]({ id: 'load', data: {} })
    registered.message[0]({ id: 'start' })

    expect(loadPlugin).not.toHaveBeenCalled()
    expect(startBridge).not.toHaveBeenCalled()
  })

  it('still takes LOAD and START before any signal', async () => {
    const fork = await import('./childBridgeFork.js')
    const loadPlugin = vi.spyOn(fork.ChildBridgeFork.prototype, 'loadPlugin').mockResolvedValue(undefined)
    const startBridge = vi.spyOn(fork.ChildBridgeFork.prototype, 'startBridge').mockResolvedValue(undefined)

    registered.message[0]({ id: 'load', data: {} })
    registered.message[0]({ id: 'start' })

    expect(loadPlugin).toHaveBeenCalledTimes(1)
    expect(startBridge).toHaveBeenCalledTimes(1)
  })

  it('tears down once when a signal and a disconnect both arrive', () => {
    registered.SIGTERM[0]()
    registered.disconnect[0]()
    registered.SIGINT[0]()

    expect(shutdown).toHaveBeenCalledTimes(1)
    expect(process.exitCode).toBe(143)
  })
})

describe('childBridgeFork - public HAP enablement', () => {
  const originalTitle = process.title

  afterEach(() => {
    vi.restoreAllMocks()
    process.title = originalTitle
  })

  it.each([
    { hap: undefined, expected: true, externalsOnly: false },
    { hap: {}, expected: true, externalsOnly: false },
    {
      hap: { enabled: true },
      expected: true,
      externalsOnly: false,
    },
    {
      hap: { enabled: false },
      expected: false,
      externalsOnly: false,
    },
    { hap: false, expected: false, externalsOnly: false },
    // externalsOnly still uses HAP for external accessories, as isMatterEnabled does for Matter
    {
      hap: { externalsOnly: true },
      expected: true,
      externalsOnly: true,
    },
    {
      hap: { enabled: false, externalsOnly: true },
      expected: true,
      externalsOnly: true,
    },
  ])('reports $expected for child bridge hap=$hap before plugins initialize', async ({ hap, expected, externalsOnly }) => {
    const fork = new ChildBridgeFork()
    vi.spyOn(HAPStorage, 'setCustomStoragePath').mockImplementation(() => {})
    const plugin = {
      load: vi.fn().mockResolvedValue(undefined),
      getPluginIdentifier: () => 'homebridge-example',
      version: '1.0.0',
    } as unknown as Plugin
    vi.spyOn(PluginManager.prototype, 'loadPlugin').mockReturnValue(plugin)
    const initialize = vi.spyOn(PluginManager.prototype, 'initializePlugin').mockImplementation(async () => {
      expect((fork as any).api.isHapEnabled()).toBe(expected)
      expect((fork as any).api.isHapExternalsOnly()).toBe(externalsOnly)
    })

    await fork.loadPlugin({
      type: PluginType.PLATFORM,
      identifier: 'homebridge-example',
      pluginPath: '/unused',
      pluginConfig: [],
      bridgeConfig: {
        username: '0E:DC:5D:BE:D6:75',
        name: 'Child',
        pin: '031-45-154',
        hap,
      },
      homebridgeConfig: {
        bridge: {
          username: 'CC:22:3D:E3:CE:30',
          name: 'Main',
          pin: '031-45-154',
          hap: { enabled: expected === false },
        },
        accessories: [],
        platforms: [],
      },
      bridgeOptions: { cachedAccessoriesDir: '/unused', cachedAccessoriesItemName: 'cachedAccessories', externalAccessoriesItemName: 'externalAccessories' },
    })

    expect(initialize).toHaveBeenCalledOnce()
  })
})

describe('childBridgeFork - Matter enablement', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    {
      type: PluginType.PLATFORM,
      matter: undefined,
      expected: false,
      externalsOnly: false,
    },
    {
      type: PluginType.PLATFORM,
      matter: {},
      expected: true,
      externalsOnly: false,
    },
    {
      type: PluginType.PLATFORM,
      matter: { enabled: false },
      expected: false,
      externalsOnly: false,
    },
    {
      type: PluginType.PLATFORM,
      matter: { externalsOnly: true },
      expected: true,
      externalsOnly: true,
    },
    {
      type: PluginType.PLATFORM,
      matter: { enabled: false, externalsOnly: true },
      expected: true,
      externalsOnly: true,
    },
    // Matter is ignored on an accessory child bridge, so externalsOnly is too
    {
      type: PluginType.ACCESSORY,
      matter: { externalsOnly: true },
      expected: false,
      externalsOnly: false,
    },
  ])('reports $expected and externalsOnly $externalsOnly for a $type child bridge with matter=$matter', async ({ type, matter, expected, externalsOnly }) => {
    const fork = new ChildBridgeFork()
    vi.spyOn(HAPStorage, 'setCustomStoragePath').mockImplementation(() => {})
    const plugin = {
      load: vi.fn().mockResolvedValue(undefined),
      getPluginIdentifier: () => 'homebridge-example',
      version: '1.0.0',
    } as unknown as Plugin
    vi.spyOn(PluginManager.prototype, 'loadPlugin').mockReturnValue(plugin)
    const initialize = vi.spyOn(PluginManager.prototype, 'initializePlugin').mockImplementation(async () => {
      expect((fork as any).api.isMatterEnabled()).toBe(expected)
      expect((fork as any).api.isMatterExternalsOnly()).toBe(externalsOnly)
    })

    await fork.loadPlugin({
      type,
      identifier: 'homebridge-example',
      pluginPath: '/unused',
      pluginConfig: [],
      bridgeConfig: {
        username: '0E:DC:5D:BE:D6:75',
        name: 'Child',
        pin: '031-45-154',
        matter,
      },
      homebridgeConfig: {
        bridge: { username: 'CC:22:3D:E3:CE:30', name: 'Main', pin: '031-45-154' },
        accessories: [],
        platforms: [],
      },
      bridgeOptions: { cachedAccessoriesDir: '/unused', cachedAccessoriesItemName: 'cachedAccessories', externalAccessoriesItemName: 'externalAccessories' },
    })

    expect(initialize).toHaveBeenCalledOnce()
  })
})

describe('childBridgeFork - matter.js that can not be loaded', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the plugin and carries on without Matter', async () => {
    const fork = new ChildBridgeFork()
    vi.spyOn(HAPStorage, 'setCustomStoragePath').mockImplementation(() => {})
    vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
    vi.spyOn(HomebridgeAPI.prototype, 'loadMatterAPI').mockRejectedValue(new Error('Cannot find package \'@matter/nodejs\''))
    const plugin = {
      load: vi.fn().mockResolvedValue(undefined),
      getPluginIdentifier: () => 'homebridge-example',
      version: '1.0.0',
    } as unknown as Plugin
    vi.spyOn(PluginManager.prototype, 'loadPlugin').mockReturnValue(plugin)
    const initialize = vi.spyOn(PluginManager.prototype, 'initializePlugin').mockResolvedValue(undefined)

    await expect(fork.loadPlugin({
      type: PluginType.PLATFORM,
      identifier: 'homebridge-example',
      pluginPath: '/unused',
      pluginConfig: [],
      bridgeConfig: {
        username: '0E:DC:5D:BE:D6:75',
        name: 'Child',
        pin: '031-45-154',
        matter: {},
      },
      homebridgeConfig: {
        bridge: { username: 'CC:22:3D:E3:CE:30', name: 'Main', pin: '031-45-154' },
        accessories: [],
        platforms: [],
      },
      bridgeOptions: { cachedAccessoriesDir: '/unused', cachedAccessoriesItemName: 'cachedAccessories', externalAccessoriesItemName: 'externalAccessories' },
    })).resolves.toBeUndefined()

    expect(initialize).toHaveBeenCalledOnce()
    expect((fork as any).matterLoaded).toBe(false)
    expect((fork as any).api.isMatterEnabled()).toBe(false)
  })
})

describe('childBridgeFork - startBridge with accessory plugins', () => {
  let storageDir: string

  beforeEach(() => {
    storageDir = mkdtempSync(join(tmpdir(), 'hb-child-fork-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(storageDir, { recursive: true, force: true })
  })

  // Builds a fork that is ready for startBridge(), with one accessory plugin
  // whose accessories each expose a single Switch service.
  function buildAccessoryFork(pluginConfig: Array<Record<string, unknown>>) {
    const fork = new ChildBridgeFork()
    const sendMessage = vi.spyOn(fork, 'sendMessage').mockImplementation(() => {})
    vi.spyOn(fork, 'publishHapIfEnabled').mockImplementation(() => {})
    vi.spyOn(fork, 'sendPairedStatusEvent').mockImplementation(() => {})
    vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
    vi.spyOn(Logger.internal, 'info').mockImplementation(() => {})

    const api = new HomebridgeAPI()
    class SwitchAccessory {
      getServices() {
        return [
          new api.hap.Service.Switch('Switch'),
        ]
      }
    }
    const plugin = {
      getPluginIdentifier: () => 'homebridge-example',
      getAccessoryConstructor: () => SwitchAccessory,
    } as unknown as Plugin

    Object.assign(fork as any, {
      api,
      type: PluginType.ACCESSORY,
      identifier: 'ExampleAccessory',
      pluginConfig,
      pluginManager: {
        getPluginForAccessory: () => plugin,
      },
      externalPortService: {},
      bridgeConfig: { username: '0E:DC:5D:BE:D6:75', name: 'Child', pin: '031-45-154' },
      bridgeOptions: { cachedAccessoriesDir: storageDir, cachedAccessoriesItemName: 'cachedAccessories', externalAccessoriesItemName: 'externalAccessories' },
    })

    return { fork, sendMessage }
  }

  // Matter is not supported on an accessory child bridge. loadPlugin() never
  // loads the Matter API for one, so startBridge() must warn and go on with
  // HAP only.
  it('warns about a matter block, starts no Matter manager, and comes online', async () => {
    const { fork, sendMessage } = buildAccessoryFork([
      { accessory: 'ExampleAccessory', name: 'Lamp' },
    ])
    ;(fork as any).bridgeConfig.matter = { enabled: true }
    const warn = vi.spyOn(Logger.withPrefix('Matter/ChildManager'), 'warn').mockImplementation(() => {})

    await fork.startBridge()

    expect(warn).toHaveBeenCalledWith('Matter is not supported on accessory child bridges. Ignoring matter configuration.')
    expect((fork as any).matterManager).toBeUndefined()
    expect((fork as any).matterMessageHandler).toBeUndefined()
    expect(sendMessage).toHaveBeenCalledWith(ChildProcessMessageEventType.ONLINE)
  })

  it('skips an accessory with no name and still loads the others and comes online', async () => {
    const { fork, sendMessage } = buildAccessoryFork([
      { accessory: 'ExampleAccessory' },
      { accessory: 'ExampleAccessory', name: 'Lamp' },
    ])

    await fork.startBridge()

    const bridged = (fork as any).bridgeService.bridge.bridgedAccessories
    expect(bridged.map((accessory: { displayName: string }) => accessory.displayName)).toEqual(['Lamp'])
    expect(sendMessage).toHaveBeenCalledWith(ChildProcessMessageEventType.ONLINE)
  })

  it('logs an accessory the bridge refuses and still loads the others and comes online', async () => {
    const { fork, sendMessage } = buildAccessoryFork([
      { accessory: 'ExampleAccessory', name: 'Lamp' },
      { accessory: 'ExampleAccessory', name: 'Fan' },
    ])
    const errors: unknown[][] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args)
    })
    // HAP-NodeJS refuses, for example, a second accessory with the same UUID.
    const add = Bridge.prototype.addBridgedAccessory
    vi.spyOn(Bridge.prototype, 'addBridgedAccessory').mockImplementation(function (this: Bridge, accessory) {
      if (accessory.displayName === 'Lamp') {
        throw new Error('Cannot add a bridged Accessory with the same UUID as another bridged Accessory')
      }
      return add.call(this, accessory)
    })

    await fork.startBridge()

    const bridged = (fork as any).bridgeService.bridge.bridgedAccessories
    expect(bridged.map((accessory: { displayName: string }) => accessory.displayName)).toEqual(['Fan'])
    expect(sendMessage).toHaveBeenCalledWith(ChildProcessMessageEventType.ONLINE)
    expect(errors.flat().join(' ')).toContain('same UUID')
  })
})

describe('childBridgeFork - the port set for the child bridge', () => {
  let storageDir: string

  beforeEach(() => {
    storageDir = mkdtempSync(join(tmpdir(), 'hb-child-fork-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(storageDir, { recursive: true, force: true })
  })

  function buildFork(hap?: Record<string, unknown>) {
    const fork = new ChildBridgeFork()
    const order: string[] = []
    vi.spyOn(fork, 'sendMessage').mockImplementation(() => {})
    vi.spyOn(fork, 'sendPairedStatusEvent').mockImplementation(() => {})
    vi.spyOn(Logger.internal, 'info').mockImplementation(() => {})
    vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
    vi.spyOn(BridgeService.prototype, 'checkBridgePort').mockImplementation(async () => {
      order.push('port checked')
    })
    vi.spyOn(BridgeService.prototype, 'publishBridge').mockImplementation(() => {
      order.push('published')
    })
    Object.assign(fork as any, {
      api: new HomebridgeAPI(),
      type: PluginType.PLATFORM,
      identifier: 'ExamplePlatform',
      pluginConfig: [],
      pluginManager: {},
      externalPortService: {},
      bridgeConfig: {
        username: '0E:DC:5D:BE:D6:75',
        name: 'Child',
        pin: '031-45-154',
        port: 51999,
        hap,
      },
      bridgeOptions: { cachedAccessoriesDir: storageDir, cachedAccessoriesItemName: 'cachedAccessories', externalAccessoriesItemName: 'externalAccessories' },
    })
    return { fork, order }
  }

  it('checks that the port is free before the child bridge is published, as the main bridge does', async () => {
    const { fork, order } = buildFork()

    await fork.startBridge()

    expect(order).toEqual(['port checked', 'published'])
  })

  it('does not check the port of a child bridge that does not publish over HAP', async () => {
    const { fork, order } = buildFork({ enabled: false })

    await fork.startBridge()

    expect(order).toEqual([])
  })

  it('does not publish when the signal came during the port check', async () => {
    const { fork, order } = buildFork()
    vi.mocked(BridgeService.prototype.checkBridgePort).mockImplementation(async () => {
      order.push('port checked')
      fork.shutdown()
    })
    vi.spyOn(BridgeService.prototype, 'teardown').mockResolvedValue(undefined)

    await fork.startBridge()

    expect(order).toEqual(['port checked'])
  })
})

describe('childBridgeFork - a signal that arrives during startup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const loadData = {
    type: PluginType.PLATFORM,
    identifier: 'homebridge-example',
    pluginPath: '/unused',
    pluginConfig: [],
    bridgeConfig: { username: '0E:DC:5D:BE:D6:75', name: 'Child', pin: '031-45-154' },
    homebridgeConfig: {
      bridge: { username: 'CC:22:3D:E3:CE:30', name: 'Main', pin: '031-45-154' },
      accessories: [],
      platforms: [],
    },
    bridgeOptions: { cachedAccessoriesDir: '/unused', cachedAccessoriesItemName: 'cachedAccessories', externalAccessoriesItemName: 'externalAccessories' },
  }

  it('does not report the plugin as loaded when the signal came during the load', async () => {
    const fork = new ChildBridgeFork()
    const sendMessage = vi.spyOn(fork, 'sendMessage').mockImplementation(() => {})
    vi.spyOn(HAPStorage, 'setCustomStoragePath').mockImplementation(() => {})
    const plugin = {
      // the signal arrives while the plugin is being loaded
      load: vi.fn(async () => fork.shutdown()),
      getPluginIdentifier: () => 'homebridge-example',
      version: '1.0.0',
    } as unknown as Plugin
    vi.spyOn(PluginManager.prototype, 'loadPlugin').mockReturnValue(plugin)
    const initialize = vi.spyOn(PluginManager.prototype, 'initializePlugin').mockResolvedValue(undefined)

    await fork.loadPlugin(loadData)

    expect(initialize).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalledWith(ChildProcessMessageEventType.LOADED, expect.anything())
  })

  it('reports the plugin as loaded when no signal came', async () => {
    const fork = new ChildBridgeFork()
    const sendMessage = vi.spyOn(fork, 'sendMessage').mockImplementation(() => {})
    vi.spyOn(HAPStorage, 'setCustomStoragePath').mockImplementation(() => {})
    const plugin = {
      load: vi.fn().mockResolvedValue(undefined),
      getPluginIdentifier: () => 'homebridge-example',
      version: '1.0.0',
    } as unknown as Plugin
    vi.spyOn(PluginManager.prototype, 'loadPlugin').mockReturnValue(plugin)
    vi.spyOn(PluginManager.prototype, 'initializePlugin').mockResolvedValue(undefined)

    await fork.loadPlugin(loadData)

    expect(sendMessage).toHaveBeenCalledWith(ChildProcessMessageEventType.LOADED, { version: '1.0.0' })
  })

  it('does not start the bridge after a shutdown', async () => {
    const fork = new ChildBridgeFork()
    const sendMessage = vi.spyOn(fork, 'sendMessage').mockImplementation(() => {})
    const publish = vi.spyOn(fork, 'publishHapIfEnabled').mockImplementation(() => {})
    Object.assign(fork as any, { type: PluginType.PLATFORM, bridgeConfig: loadData.bridgeConfig, pluginConfig: [] })

    fork.shutdown()
    await fork.startBridge()

    expect((fork as any).bridgeService).toBeUndefined()
    expect(publish).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalledWith(ChildProcessMessageEventType.ONLINE)
  })

  it('does not publish the bridge when the signal came while the accessory cache was read', async () => {
    const storageDir = mkdtempSync(join(tmpdir(), 'hb-child-fork-'))
    try {
      const fork = new ChildBridgeFork()
      const sendMessage = vi.spyOn(fork, 'sendMessage').mockImplementation(() => {})
      const publish = vi.spyOn(fork, 'publishHapIfEnabled').mockImplementation(() => {})
      vi.spyOn(fork, 'sendPairedStatusEvent').mockImplementation(() => {})
      const api = new HomebridgeAPI()
      const signalFinished = vi.spyOn(api, 'signalFinished')
      Object.assign(fork as any, {
        api,
        type: PluginType.PLATFORM,
        identifier: 'ExamplePlatform',
        pluginConfig: [],
        pluginManager: {},
        externalPortService: {},
        bridgeConfig: loadData.bridgeConfig,
        bridgeOptions: { cachedAccessoriesDir: storageDir, cachedAccessoriesItemName: 'cachedAccessories', externalAccessoriesItemName: 'externalAccessories' },
      })
      // the signal arrives while the cached accessories are read from disk
      vi.spyOn(BridgeService.prototype, 'loadCachedPlatformAccessoriesFromDisk').mockImplementation(async () => {
        fork.shutdown()
      })

      await fork.startBridge()

      expect(publish).not.toHaveBeenCalled()
      expect(signalFinished).not.toHaveBeenCalled()
      expect(sendMessage).not.toHaveBeenCalledWith(ChildProcessMessageEventType.ONLINE)
    } finally {
      rmSync(storageDir, { recursive: true, force: true })
    }
  })

  it('stops the Matter server that came up after the signal, and starts nothing else', async () => {
    const fork = new ChildBridgeFork()
    const sendMessage = vi.spyOn(fork, 'sendMessage').mockImplementation(() => {})
    const publish = vi.spyOn(fork, 'publishHapIfEnabled').mockImplementation(() => {})
    const matter = await import('./matter/index.js')
    const teardown = vi.spyOn(matter.ChildBridgeMatterManager.prototype, 'teardown').mockResolvedValue(undefined)
    // the signal arrives while the Matter server is starting
    vi.spyOn(matter.ChildBridgeMatterManager.prototype, 'initialize').mockImplementation(async () => {
      fork.shutdown()
    })
    Object.assign(fork as any, {
      api: {
        _setMatterManager: vi.fn(),
      },
      type: PluginType.PLATFORM,
      matterLoaded: true,
      pluginConfig: [],
      pluginManager: {},
      externalPortService: {},
      bridgeConfig: { ...loadData.bridgeConfig, matter: {} },
      bridgeOptions: {},
    })
    vi.spyOn(Logger.withPrefix('Matter/ChildManager'), 'info').mockImplementation(() => {})

    await fork.startBridge()

    // once from shutdown(), once for the server that started after it
    expect(teardown).toHaveBeenCalledTimes(2)
    expect((fork as any).bridgeService).toBeUndefined()
    expect(publish).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalledWith(ChildProcessMessageEventType.ONLINE)
  })
})

describe('childBridgeFork - port requests', () => {
  it('coalesces concurrent requests for the same external port', async () => {
    const fork = new ChildBridgeFork()
    const sendMessage = vi.spyOn(fork, 'sendMessage').mockImplementation(() => {})
    const username = 'AA:BB:CC:DD:EE:FF'

    const firstRequest = fork.requestExternalPort(username)
    const secondRequest = fork.requestExternalPort(username)

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(ChildProcessMessageEventType.PORT_REQUEST, { username })

    fork.handleExternalResponse({ username, port: 51000 })

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([51000, 51000])
    expect((fork as any).pendingPortRequests.size).toBe(0)
  })

  it('coalesces concurrent Matter port requests and preserves their type', async () => {
    const fork = new ChildBridgeFork()
    const sendMessage = vi.spyOn(fork, 'sendMessage').mockImplementation(() => {})
    const uniqueId = 'AABBCCDDEEFF'

    const firstRequest = fork.requestMatterPort(uniqueId)
    const secondRequest = fork.requestMatterPort(uniqueId)

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(ChildProcessMessageEventType.PORT_REQUEST, {
      username: uniqueId,
      portType: 'matter',
    })

    fork.handleExternalResponse({ username: uniqueId, port: 5550 })

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([5550, 5550])
  })

  it('resolves every coalesced caller when the parent times out', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
    try {
      const fork = new ChildBridgeFork()
      const sendMessage = vi.spyOn(fork, 'sendMessage').mockImplementation(() => {})
      const username = 'AA:BB:CC:DD:EE:FF'

      const firstRequest = fork.requestExternalPort(username)
      const secondRequest = fork.requestExternalPort(username)
      await vi.advanceTimersByTimeAsync(5000)

      await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([undefined, undefined])
      expect(sendMessage).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledTimes(1)
      expect((fork as any).pendingPortRequests.size).toBe(0)
    } finally {
      warn.mockRestore()
      vi.useRealTimers()
    }
  })
})

describe('childBridgeFork - shutdown', () => {
  it('does not throw when a signal arrives before bridgeService is assigned', () => {
    const fork = new ChildBridgeFork()
    expect(() => fork.shutdown()).not.toThrow()
  })
})

describe('childBridgeFork - Matter Handlers', () => {
  let childBridgeFork: ChildBridgeFork
  let mockMatterManager: any
  let mockMatterMessageHandler: any
  let mockBridgeConfig: any

  beforeEach(() => {
    // Create a new instance
    childBridgeFork = new ChildBridgeFork()

    // Mock the bridge config
    mockBridgeConfig = {
      username: '0E:DC:5D:BE:D6:75',
      name: 'Test Child Bridge',
      port: 51826,
    }

    // Set the bridge config on the instance
    ;(childBridgeFork as any).bridgeConfig = mockBridgeConfig

    // Mock the matter manager
    mockMatterManager = {
      isMatterEnabled: vi.fn(),
      enableStateMonitoring: vi.fn(),
      disableStateMonitoring: vi.fn(),
      collectAllAccessories: vi.fn(),
      getAccessoryInfo: vi.fn(),
      handleTriggerCommand: vi.fn(),
      getMatterStatusInfo: vi.fn(() => undefined),
    }

    // Set the matter manager on the instance
    ;(childBridgeFork as any).matterManager = mockMatterManager

    // Mock the matter message handler (now delegates to it)
    mockMatterMessageHandler = {
      handleStartMatterMonitoring: vi.fn(),
      handleStopMatterMonitoring: vi.fn(),
      handleGetMatterAccessories: vi.fn(),
      handleGetMatterAccessoryInfo: vi.fn(),
      handleMatterAccessoryControl: vi.fn(),
    }

    // Set the matter message handler on the instance
    ;(childBridgeFork as any).matterMessageHandler = mockMatterMessageHandler

    // Mock sendMessage
    ;(childBridgeFork as any).sendMessage = vi.fn()
  })

  describe('handleStartMatterMonitoring', () => {
    it('should delegate to matterMessageHandler', () => {
      childBridgeFork.handleStartMatterMonitoring()

      expect(mockMatterMessageHandler.handleStartMatterMonitoring).toHaveBeenCalled()
    })

    it('should handle missing matter message handler gracefully', () => {
      ;(childBridgeFork as any).matterMessageHandler = undefined

      expect(() => childBridgeFork.handleStartMatterMonitoring()).not.toThrow()
    })
  })

  describe('handleStopMatterMonitoring', () => {
    it('should delegate to matterMessageHandler', () => {
      childBridgeFork.handleStopMatterMonitoring()

      expect(mockMatterMessageHandler.handleStopMatterMonitoring).toHaveBeenCalled()
    })

    it('should handle missing matter message handler gracefully', () => {
      ;(childBridgeFork as any).matterMessageHandler = undefined

      expect(() => childBridgeFork.handleStopMatterMonitoring()).not.toThrow()
    })
  })

  describe('handleGetMatterAccessories', () => {
    it('should delegate to matterMessageHandler', () => {
      childBridgeFork.handleGetMatterAccessories()

      expect(mockMatterMessageHandler.handleGetMatterAccessories).toHaveBeenCalled()
    })

    it('should handle missing matter message handler gracefully', () => {
      ;(childBridgeFork as any).matterMessageHandler = undefined

      expect(() => childBridgeFork.handleGetMatterAccessories()).not.toThrow()
    })
  })

  describe('handleGetMatterAccessoryInfo', () => {
    it('should delegate to matterMessageHandler', () => {
      const data = { uuid: 'test-uuid' }

      childBridgeFork.handleGetMatterAccessoryInfo(data)

      expect(mockMatterMessageHandler.handleGetMatterAccessoryInfo).toHaveBeenCalledWith(data)
    })

    it('should handle missing matter message handler gracefully', () => {
      ;(childBridgeFork as any).matterMessageHandler = undefined

      expect(() => childBridgeFork.handleGetMatterAccessoryInfo({ uuid: 'unknown-uuid' })).not.toThrow()
    })
  })

  describe('handleMatterAccessoryControl', () => {
    const mockControlData = {
      uuid: 'test-uuid',
      cluster: 'onOff',
      attributes: { onOff: true },
    }

    it('should delegate to matterMessageHandler', () => {
      childBridgeFork.handleMatterAccessoryControl(mockControlData)

      expect(mockMatterMessageHandler.handleMatterAccessoryControl).toHaveBeenCalledWith(mockControlData)
    })

    it('should handle missing matter message handler gracefully', () => {
      ;(childBridgeFork as any).matterMessageHandler = undefined

      expect(() => childBridgeFork.handleMatterAccessoryControl(mockControlData)).not.toThrow()
    })
  })

  describe('publishHapIfEnabled', () => {
    let publishBridgeSpy: ReturnType<typeof vi.fn>
    let infoSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      publishBridgeSpy = vi.fn()
      ;(childBridgeFork as any).bridgeService = { publishBridge: publishBridgeSpy }
      infoSpy = vi.spyOn(Logger.internal, 'info').mockImplementation(() => {})
    })

    it('publishes the bridge when hap is undefined (default enabled)', () => {
      ;(childBridgeFork as any).bridgeConfig = { username: '0E:DC:5D:BE:D6:75' }

      childBridgeFork.publishHapIfEnabled()

      expect(publishBridgeSpy).toHaveBeenCalledOnce()
      expect(infoSpy).not.toHaveBeenCalled()
    })

    it('publishes the bridge when hap is an empty object', () => {
      ;(childBridgeFork as any).bridgeConfig = { username: '0E:DC:5D:BE:D6:75', hap: {} }

      childBridgeFork.publishHapIfEnabled()

      expect(publishBridgeSpy).toHaveBeenCalledOnce()
    })

    it('publishes the bridge when hap.enabled is explicitly true', () => {
      ;(childBridgeFork as any).bridgeConfig = {
        username: '0E:DC:5D:BE:D6:75',
        hap: { enabled: true },
      }

      childBridgeFork.publishHapIfEnabled()

      expect(publishBridgeSpy).toHaveBeenCalledOnce()
    })

    it('does NOT publish, and logs the externalsOnly notice, when externalsOnly: true', () => {
      ;(childBridgeFork as any).bridgeConfig = {
        username: '0E:DC:5D:BE:D6:75',
        hap: { enabled: false, externalsOnly: true },
      }

      childBridgeFork.publishHapIfEnabled()

      expect(publishBridgeSpy).not.toHaveBeenCalled()
      expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/externalsOnly mode/))
    })

    it('does NOT publish, and logs the disabled notice, when hap.enabled: false (no externalsOnly) but Matter is active', () => {
      // matterManager is set by the outer beforeEach, so Matter is active here —
      // a quiet info line is correct (the bridge still advertises via Matter).
      ;(childBridgeFork as any).bridgeConfig = {
        username: '0E:DC:5D:BE:D6:75',
        hap: { enabled: false },
      }

      childBridgeFork.publishHapIfEnabled()

      expect(publishBridgeSpy).not.toHaveBeenCalled()
      expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/HAP is disabled/))
    })

    it('warns when both HAP and Matter are disabled (child bridge advertises nothing) (#3944)', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      ;(childBridgeFork as any).bridgeConfig = {
        username: '0E:DC:5D:BE:D6:75',
        hap: { enabled: false },
      }
      // No active Matter on this child ⇒ matterManager is never constructed.
      ;(childBridgeFork as any).matterManager = undefined
      // infoSpy is shared across tests in this describe; clear it so the
      // "no info line" assertion below reflects only this invocation.
      infoSpy.mockClear()

      childBridgeFork.publishHapIfEnabled()

      expect(publishBridgeSpy).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/Both HAP and Matter are disabled/))
      // It must NOT fall through to the quiet info line.
      expect(infoSpy).not.toHaveBeenCalledWith(expect.stringMatching(/HAP is disabled/))
      warnSpy.mockRestore()
    })
  })

  describe('sendPairedStatusEvent', () => {
    it('does not call setupURI when bridge is not published', () => {
      const sendMessageSpy = vi.fn()
      const setupURISpy = vi.fn(() => {
        throw new Error('should not be called')
      })

      ;(childBridgeFork as any).sendMessage = sendMessageSpy
      ;(childBridgeFork as any).bridgeService = {
        bridge: {
          setupURI: setupURISpy,
          _accessoryInfo: undefined,
        },
      }

      childBridgeFork.sendPairedStatusEvent()

      expect(setupURISpy).not.toHaveBeenCalled()
      expect(sendMessageSpy).toHaveBeenCalledWith(ChildProcessMessageEventType.STATUS_UPDATE, {
        paired: null,
        setupUri: null,
      })
    })

    it('includes paired and setupUri when bridge is published', () => {
      const sendMessageSpy = vi.fn()

      ;(childBridgeFork as any).sendMessage = sendMessageSpy
      ;(childBridgeFork as any).bridgeService = {
        bridge: {
          setupURI: vi.fn(() => 'X-HM://abc'),
          _accessoryInfo: {
            paired: vi.fn(() => true),
          },
        },
      }

      childBridgeFork.sendPairedStatusEvent()

      expect(sendMessageSpy).toHaveBeenCalledWith(ChildProcessMessageEventType.STATUS_UPDATE, {
        paired: true,
        setupUri: 'X-HM://abc',
      })
    })

    it('includes matter status even when HAP is unpublished', () => {
      const sendMessageSpy = vi.fn()

      ;(childBridgeFork as any).sendMessage = sendMessageSpy
      ;(childBridgeFork as any).bridgeService = {
        bridge: {
          setupURI: vi.fn(() => 'X-HM://abc'),
          _accessoryInfo: undefined,
        },
      }
      ;(childBridgeFork as any).matterManager = {
        getMatterStatusInfo: vi.fn(() => ({
          qrCode: 'MT:ABCD',
          manualPairingCode: '12345-67890',
          serialNumber: 'SN-1',
          commissioned: false,
          fabricCount: 0,
          fabrics: [],
        })),
      }

      childBridgeFork.sendPairedStatusEvent()

      expect(sendMessageSpy).toHaveBeenCalledWith(ChildProcessMessageEventType.STATUS_UPDATE, {
        paired: null,
        setupUri: null,
        matter: {
          qrCode: 'MT:ABCD',
          manualPairingCode: '12345-67890',
          serialNumber: 'SN-1',
          commissioned: false,
          fabricCount: 0,
          fabrics: [],
        },
      })
    })
  })
})
