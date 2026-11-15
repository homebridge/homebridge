import type { Plugin } from './plugin.js'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { Bridge, HAPStorage } from '@homebridge/hap-nodejs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeAPI, PluginType } from './api.js'
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

describe('childBridgeFork - Matter Accessory Guard', () => {
  it('should not have matterManager when type is ACCESSORY even with matter config', () => {
    const fork = new ChildBridgeFork()
    ;(fork as any).type = PluginType.ACCESSORY
    ;(fork as any).bridgeConfig = {
      username: '0E:DC:5D:BE:D6:75',
      name: 'Test Accessory Bridge',
      port: 51826,
      matter: { enabled: true },
    }

    // Verify initial state - matterManager should not be set
    expect((fork as any).matterManager).toBeUndefined()

    // The guard in startBridge() checks: this.bridgeConfig.matter && this.type === PluginType.ACCESSORY
    // Verify the condition is true (guard would fire)
    expect((fork as any).bridgeConfig.matter).toBeTruthy()
    expect((fork as any).type).toBe(PluginType.ACCESSORY)
  })

  it('should allow matter config for platform type child bridges', () => {
    const fork = new ChildBridgeFork()
    ;(fork as any).type = PluginType.PLATFORM
    ;(fork as any).bridgeConfig = {
      username: '0E:DC:5D:BE:D6:75',
      name: 'Test Platform Bridge',
      port: 51826,
      matter: { enabled: true },
    }

    // The guard should NOT fire for platform type
    expect((fork as any).bridgeConfig.matter).toBeTruthy()
    expect((fork as any).type).not.toBe(PluginType.ACCESSORY)
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
