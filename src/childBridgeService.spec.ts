/* global NodeJS */

import { fork as forkMock } from 'node:child_process'
import { EventEmitter } from 'node:events'

import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeAPI, PluginType } from './api.js'
import { ChildBridgeService, ChildBridgeStatus, ChildProcessMessageEventType } from './childBridgeService.js'
import { Logger } from './logger.js'

// Fake ChildProcess used by the mocked node:child_process.fork below.
// Tests drive these by emit('message', ...) / emit('close', ...) and inspect
// killCalls / sentMessages.
class FakeChildProcess extends EventEmitter {
  public stdout = new EventEmitter()
  public stderr = new EventEmitter()
  public connected = true
  public pid = 99999
  public killCalls: NodeJS.Signals[] = []
  public sentMessages: any[] = []

  send(message: any): boolean {
    this.sentMessages.push(message)
    return true
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.killCalls.push(signal)
    if (signal === 'SIGTERM' || signal === 'SIGKILL') {
      // Simulate the child exiting in response.
      this.connected = false
    }
    return true
  }
}

// Track every fake child process the mock creates so tests can grab the
// most recent one without plumbing through.
const childProcesses = vi.hoisted(() => ({ list: [] as FakeChildProcess[] }))

vi.mock('node:child_process', () => ({
  fork: vi.fn(() => {
    const fake = new FakeChildProcess()
    childProcesses.list.push(fake)
    return fake
  }),
}))

vi.mock('fs-extra', async () => {
  const actual = await vi.importActual<any>('fs-extra')
  return {
    ...actual,
    default: {
      ...(actual.default ?? {}),
      readJson: vi.fn(),
    },
    readJson: vi.fn(),
  }
})

function makeBridgeConfig(overrides: any = {}): any {
  return {
    name: 'TestChildBridge',
    username: '0E:DC:5D:BE:D6:75',
    pin: '031-45-154',
    ...overrides,
  }
}

function makeHomebridgeConfig(overrides: any = {}): any {
  return {
    bridge: {
      name: 'MainBridge',
      username: 'CC:22:3D:E3:CE:30',
      pin: '031-45-154',
    },
    accessories: [],
    platforms: [],
    ...overrides,
  }
}

function makeHomebridgeOptions(overrides: any = {}): any {
  return {
    debugModeEnabled: false,
    forceColourLogging: false,
    insecureAccess: false,
    noLogTimestamps: false,
    keepOrphanedCachedAccessories: false,
    ...overrides,
  }
}

function makePlugin(): any {
  return {
    getPluginIdentifier: () => 'homebridge-test',
    getPluginPath: () => '/fake/path/homebridge-test',
    version: '1.0.0',
  }
}

function makeIpcService(): any {
  return {
    sendMessage: vi.fn(),
  }
}

function makeExternalPortService(): any {
  return {
    requestPort: vi.fn().mockResolvedValue(50000),
    requestMatterPort: vi.fn().mockResolvedValue(undefined),
  }
}

function makePluginManager(): any {
  return {
    getPlugin: vi.fn(),
  }
}

function buildService(overrides: { type?: PluginType, identifier?: string, bridgeConfig?: any, homebridgeOptions?: any } = {}) {
  const api = new HomebridgeAPI()
  const ipcService = makeIpcService()
  const pluginManager = makePluginManager()
  const externalPortService = makeExternalPortService()
  const plugin = makePlugin()

  const service = new ChildBridgeService(
    overrides.type ?? PluginType.PLATFORM,
    overrides.identifier ?? 'TestPlatform',
    plugin,
    overrides.bridgeConfig ?? makeBridgeConfig(),
    makeHomebridgeConfig(),
    overrides.homebridgeOptions ?? makeHomebridgeOptions(),
    api,
    ipcService,
    externalPortService,
  )

  return { service, api, ipcService, pluginManager, externalPortService, plugin }
}

describe('childBridgeService', () => {
  beforeEach(() => {
    childProcesses.list.length = 0
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('constructor (M3 listener-cleanup pattern)', () => {
    it('registers a shutdown listener on the api', () => {
      const { api } = buildService()
      expect(api.listenerCount('shutdown')).toBe(1)
    })

    it('bumps the api maxListeners by one', () => {
      const api = new HomebridgeAPI()
      const before = api.getMaxListeners()
      // eslint-disable-next-line no-new
      new ChildBridgeService(
        PluginType.PLATFORM,
        'TestPlatform',
        makePlugin(),
        makeBridgeConfig(),
        makeHomebridgeConfig(),
        makeHomebridgeOptions(),
        api,
        makeIpcService(),
        makeExternalPortService(),
      )
      expect(api.getMaxListeners()).toBe(before + 1)
    })
  })

  describe('addConfig', () => {
    it('appends to the internal pluginConfig array', () => {
      const { service } = buildService()
      const cfg1 = { platform: 'TestPlatform', name: 'Foo' } as any
      const cfg2 = { platform: 'TestPlatform', name: 'Bar' } as any
      service.addConfig(cfg1)
      service.addConfig(cfg2)
      expect((service as any).pluginConfig).toEqual([cfg1, cfg2])
    })
  })

  describe('start (process flag derivation)', () => {
    it('passes -D when bridgeConfig.debugModeEnabled is true', () => {
      const { service } = buildService({ bridgeConfig: makeBridgeConfig({ debugModeEnabled: true }) })
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      expect((service as any).args).toContain('-D')
    })

    it('does NOT pass -D when bridgeConfig.debugModeEnabled is undefined', () => {
      const { service } = buildService({ bridgeConfig: makeBridgeConfig() })
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      expect((service as any).args).not.toContain('-D')
    })

    it('passes -K when keepOrphanedCachedAccessories is true', () => {
      const { service } = buildService({ homebridgeOptions: makeHomebridgeOptions({ keepOrphanedCachedAccessories: true }) })
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      expect((service as any).args).toContain('-K')
    })

    it('forks a child process', () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      expect(forkMock).toHaveBeenCalledTimes(1)
      expect(childProcesses.list).toHaveLength(1)
    })

    it('uses the plugin identifier as displayName when more than one config is queued', () => {
      const { service, plugin } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'A' } as any)
      service.addConfig({ platform: 'TestPlatform', name: 'B' } as any)
      service.start()
      expect((service as any).displayName).toBe(plugin.getPluginIdentifier())
    })

    it('uses the single config name as displayName when exactly one config', () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'OnlyOne' } as any)
      service.start()
      expect((service as any).displayName).toBe('OnlyOne')
    })
  })

  describe('child process IPC message handling', () => {
    it('on READY, sends LOAD message back to the child', () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]

      child.emit('message', { id: ChildProcessMessageEventType.READY })

      const loadMessage = child.sentMessages.find(m => m.id === ChildProcessMessageEventType.LOAD)
      expect(loadMessage).toBeDefined()
    })

    it('on LOADED, sends START message back to the child', () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]

      child.emit('message', {
        id: ChildProcessMessageEventType.LOADED,
        data: { version: '1.2.3' },
      })

      const startMessage = child.sentMessages.find(m => m.id === ChildProcessMessageEventType.START)
      expect(startMessage).toBeDefined()
    })

    it('on ONLINE, updates bridge status to OK', () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]

      child.emit('message', { id: ChildProcessMessageEventType.ONLINE })

      expect((service as any).lastBridgeStatus).toBe(ChildBridgeStatus.OK)
    })

    it('on STATUS_UPDATE, records HAP and Matter status fields', () => {
      const { service, ipcService } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]

      child.emit('message', {
        id: ChildProcessMessageEventType.STATUS_UPDATE,
        data: {
          paired: true,
          setupUri: 'X-HM://abc',
          matter: {
            qrCode: 'MT:ABCD',
            manualPairingCode: '12345-67890',
            serialNumber: 'SN-1',
            commissioned: false,
          },
        },
      })

      expect((service as any).pairedStatus).toBe(true)
      expect((service as any).setupUri).toBe('X-HM://abc')
      expect((service as any).matterCommissioningInfo).toMatchObject({
        qrCode: 'MT:ABCD',
        commissioned: false,
      })
      // sendStatusUpdate called as part of handler
      expect(ipcService.sendMessage).toHaveBeenCalled()
    })

    it('on PORT_REQUEST, forwards to externalPortService and replies with PORT_ALLOCATED', async () => {
      const { service, externalPortService } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]
      externalPortService.requestPort.mockResolvedValueOnce(50001)

      child.emit('message', {
        id: ChildProcessMessageEventType.PORT_REQUEST,
        data: { username: 'AA:BB:CC:DD:EE:FF' },
      })

      // Wait a microtask for the async handler to finish
      await new Promise(r => setImmediate(r))

      const reply = child.sentMessages.find(m => m.id === ChildProcessMessageEventType.PORT_ALLOCATED)
      expect(reply).toBeDefined()
      expect(reply.data.port).toBe(50001)
      expect(externalPortService.requestPort).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF')
    })

    it('on PORT_REQUEST with portType=matter, routes to requestMatterPort', async () => {
      const { service, externalPortService } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]
      externalPortService.requestMatterPort.mockResolvedValueOnce(5550)

      child.emit('message', {
        id: ChildProcessMessageEventType.PORT_REQUEST,
        data: { username: 'AA:BB:CC:DD:EE:FF', portType: 'matter' },
      })

      await new Promise(r => setImmediate(r))
      expect(externalPortService.requestMatterPort).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF')
    })

    it('on MATTER_EVENT externalBridgeRegistration, calls onExternalBridgeRegistered if set', () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.onExternalBridgeRegistered = vi.fn()
      service.start()
      const child = childProcesses.list[0]

      child.emit('message', {
        id: ChildProcessMessageEventType.MATTER_EVENT,
        data: {
          type: 'externalBridgeRegistration',
          data: { externalBridgeUsername: 'EE:EE:EE:EE:EE:EE' },
        },
      })

      expect(service.onExternalBridgeRegistered).toHaveBeenCalledWith(
        'EE:EE:EE:EE:EE:EE',
        '0E:DC:5D:BE:D6:75', // child bridge's own username
      )
    })

    it('mATTER_EVENT (other types) → forwards via ipcService.sendMessage', () => {
      const { service, ipcService } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]

      // Reset ipcService.sendMessage so we only catch the forwarded event
      ipcService.sendMessage.mockClear()

      child.emit('message', {
        id: ChildProcessMessageEventType.MATTER_EVENT,
        data: {
          type: 'accessoryUpdate',
          data: { uuid: 'abc', cluster: 'onOff', state: { onOff: true } },
        },
      })

      expect(ipcService.sendMessage).toHaveBeenCalled()
    })

    it('ignores messages without an id field', () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]

      // The handler checks `typeof message !== 'object' || !message.id`.
      // String messages and id-less objects are filtered out cleanly.
      // (null is intentionally not tested — the source's typeof===object
      // check matches null, and accessing .id on null would throw. In
      // practice IPC messages from child processes are never null.)
      child.emit('message', 'not-an-object')
      child.emit('message', { data: 'no id' })

      // No state changes — bridge stays in PENDING.
      expect((service as any).lastBridgeStatus).toBe(ChildBridgeStatus.PENDING)
    })
  })

  describe('handleProcessClose — restart-loop accounting', () => {
    it('schedules a restart with backoff after a likely plugin crash (code=1)', () => {
      vi.useFakeTimers()
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      service.start()
      const child = childProcesses.list[0]

      // Simulate plugin crash
      child.emit('close', 1, null)

      // restartCount goes from 0 to 1, backoff = 1*10s
      expect((service as any).restartCount).toBe(1)
      expect((service as any).scheduledRestartTimeout).toBeDefined()
      expect((service as any).lastBridgeStatus).toBe(ChildBridgeStatus.PENDING)

      // Advance timers; expect a new fork
      vi.advanceTimersByTime(10_000)
      expect(forkMock).toHaveBeenCalledTimes(2)
    })

    it('gives up after maxRestarts (4) consecutive failures', () => {
      vi.useFakeTimers()
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
      service.start()

      for (let attempt = 1; attempt <= 4; attempt++) {
        const child = childProcesses.list[childProcesses.list.length - 1]
        child.emit('close', 1, null)
        // Backoff for attempt is attempt * 10s; advance enough to trigger the next fork.
        vi.advanceTimersByTime(attempt * 10_000)
      }

      // 5th attempt: should hit the cap and not schedule another restart.
      const lastChild = childProcesses.list[childProcesses.list.length - 1]
      lastChild.emit('close', 1, null)

      // restartCount is 4 (incremented up to maxRestarts on the 4th failure);
      // 5th close hits the >= maxRestarts branch, sets manuallyStopped + DOWN.
      expect((service as any).manuallyStopped).toBe(true)
      expect((service as any).lastBridgeStatus).toBe(ChildBridgeStatus.DOWN)
    })

    it('restarts immediately when close is not a plugin crash and not shutting down', () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      service.start()
      const child = childProcesses.list[0]

      child.emit('close', null, 'SIGKILL')

      expect(forkMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('teardown — listener cleanup (M3) and SIGKILL fallback (M4)', () => {
    it('removes the shutdown listener on teardown', async () => {
      const { service, api } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const before = api.listenerCount('shutdown')
      expect(before).toBe(1)

      // Trigger teardown via the api shutdown event (the registered listener
      // calls teardown internally).
      api.emit('shutdown')

      expect(api.listenerCount('shutdown')).toBe(before - 1)
    })

    it('decrements maxListeners on teardown', async () => {
      const { service, api } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const before = api.getMaxListeners()

      api.emit('shutdown')

      expect(api.getMaxListeners()).toBe(before - 1)
    })

    it('sends SIGTERM to the child on teardown', () => {
      const { service, api } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]

      api.emit('shutdown')

      expect(child.killCalls).toContain('SIGTERM')
    })

    it('escalates to SIGKILL after 10s if the child is still connected', () => {
      vi.useFakeTimers()
      // Replace kill so it does NOT auto-disconnect (simulating a stuck child).
      const stuck = new FakeChildProcess()
      stuck.kill = vi.fn((signal: NodeJS.Signals) => {
        stuck.killCalls.push(signal)
        // Crucially: do NOT set stuck.connected = false on SIGTERM.
        if (signal === 'SIGKILL') {
          stuck.connected = false
        }
        return true
      }) as any

      const { service, api } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()

      // Replace the auto-created fake child with our stuck one.
      ;(service as any).child = stuck

      api.emit('shutdown')

      // SIGTERM fires immediately
      expect(stuck.killCalls).toContain('SIGTERM')
      expect(stuck.killCalls).not.toContain('SIGKILL')

      // After 10s: SIGKILL escalation
      vi.advanceTimersByTime(10_000)
      expect(stuck.killCalls).toContain('SIGKILL')
    })
  })

  describe('stopChildBridge', () => {
    it('clears any scheduled restart and marks manuallyStopped', () => {
      vi.useFakeTimers()
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      service.start()

      // Schedule a restart by simulating a crash
      childProcesses.list[0].emit('close', 1, null)
      expect((service as any).scheduledRestartTimeout).toBeDefined()

      service.stopChildBridge()

      expect((service as any).scheduledRestartTimeout).toBeUndefined()
      expect((service as any).manuallyStopped).toBe(true)
      expect((service as any).shuttingDown).toBe(true)

      // Advance timers — no new fork should occur because restart was cancelled.
      const forkCallsBefore = (forkMock as any).mock.calls.length
      vi.advanceTimersByTime(60_000)
      expect((forkMock as any).mock.calls.length).toBe(forkCallsBefore)
    })
  })

  describe('startChildBridge', () => {
    it('only restarts when manuallyStopped, DOWN, and child not connected', () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      service.start()

      // Try without prior stop — should warn and not fork again
      const before = (forkMock as any).mock.calls.length
      service.startChildBridge()
      expect((forkMock as any).mock.calls.length).toBe(before)

      // Now stop, then start should fork
      service.stopChildBridge()
      service.startChildBridge()
      expect((forkMock as any).mock.calls.length).toBeGreaterThan(before)
    })
  })

  describe('refreshConfig', () => {
    it('updates pluginConfig from the on-disk config when entries match', async () => {
      const { service } = buildService({ identifier: 'TestPlatform', bridgeConfig: makeBridgeConfig({ username: '0E:DC:5D:BE:D6:75' }) })
      const updated = {
        platform: 'TestPlatform',
        name: 'Updated',
        _bridge: { username: '0E:DC:5D:BE:D6:75' },
      }
      ;(fs.readJson as any).mockResolvedValueOnce({
        platforms: [updated],
        accessories: [],
      })

      await service.refreshConfig()

      expect((service as any).pluginConfig).toEqual([updated])
    })

    it('keeps existing config and warns when the on-disk entry is missing', async () => {
      const { service } = buildService({ identifier: 'TestPlatform' })
      service.addConfig({ platform: 'TestPlatform', name: 'Original' } as any)
      // Replace the prefixed logger with a captured mock — the service uses
      // `this.log.warn`, not `Logger.internal.warn`.
      const mockLog = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), success: vi.fn(), log: vi.fn() }
      ;(service as any).log = Object.assign(vi.fn(), mockLog)
      ;(fs.readJson as any).mockResolvedValueOnce({
        platforms: [],
        accessories: [],
      })

      await service.refreshConfig()

      expect(mockLog.warn).toHaveBeenCalled()
      expect((service as any).pluginConfig).toHaveLength(1)
    })

    it('logs and recovers when readJson rejects', async () => {
      const { service } = buildService()
      const mockLog = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), success: vi.fn(), log: vi.fn() }
      ;(service as any).log = Object.assign(vi.fn(), mockLog)
      ;(fs.readJson as any).mockRejectedValueOnce(new Error('Disk full'))

      await service.refreshConfig()

      expect(mockLog.error).toHaveBeenCalled()
    })

    it('tolerates a config file with no platforms key (PLATFORM type)', async () => {
      const { service } = buildService({ identifier: 'TestPlatform' })
      service.addConfig({ platform: 'TestPlatform', name: 'Original' } as any)
      const mockLog = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), success: vi.fn(), log: vi.fn() }
      ;(service as any).log = Object.assign(vi.fn(), mockLog)
      // Minimal config with no platforms or accessories at all — used to throw
      // "Cannot read properties of undefined (reading 'length')" via the
      // optional-chained filter.
      ;(fs.readJson as any).mockResolvedValueOnce({ bridge: { username: '00:00:00:00:00:00' } })

      await service.refreshConfig()

      // Falls back to existing config + warns, not the unhelpful TypeError.
      expect(mockLog.warn).toHaveBeenCalled()
      expect(mockLog.error).not.toHaveBeenCalled()
    })

    it('tolerates a config file with no accessories key (ACCESSORY type)', async () => {
      const { service } = buildService({ type: PluginType.ACCESSORY, identifier: 'TestAccessory' })
      service.addConfig({ accessory: 'TestAccessory', name: 'Original' } as any)
      const mockLog = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), success: vi.fn(), log: vi.fn() }
      ;(service as any).log = Object.assign(vi.fn(), mockLog)
      ;(fs.readJson as any).mockResolvedValueOnce({ bridge: { username: '00:00:00:00:00:00' } })

      await service.refreshConfig()

      expect(mockLog.warn).toHaveBeenCalled()
      expect(mockLog.error).not.toHaveBeenCalled()
    })
  })

  describe('requestMatterAccessories', () => {
    it('resolves with data when MATTER_EVENT/accessoriesData arrives', async () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]

      const promise = service.requestMatterAccessories(500)

      // Simulate child responding with accessoriesData
      child.emit('message', {
        id: ChildProcessMessageEventType.MATTER_EVENT,
        data: {
          type: 'accessoriesData',
          data: { accessories: [{ uuid: 'abc' }], bridgeUsername: 'X' },
        },
      })

      await expect(promise).resolves.toMatchObject({
        accessories: [{ uuid: 'abc' }],
      })
    })

    it('resolves with undefined on timeout', async () => {
      vi.useFakeTimers()
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()

      const promise = service.requestMatterAccessories(500)
      vi.advanceTimersByTime(600)

      await expect(promise).resolves.toBeUndefined()
    })

    it('coalesces concurrent callers onto a single in-flight request', async () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]
      const sendSpy = vi.spyOn((service as any), 'sendMessage')

      // Two callers race. Each used to register its own resolver in the
      // single `matterAccessoriesResolve` slot — the second clobbered the
      // first, the child responded once, and only the second caller saw
      // the data. The first either hung until its timer or short-circuited
      // to `undefined`, and its handleGetMatterAccessories emitted an
      // accessoriesData event missing this child's accessories.
      //
      // After coalescing both callers share one promise: a single IPC
      // request is sent, and the single response fans out to both.
      const first = service.requestMatterAccessories(500)
      const second = service.requestMatterAccessories(500)

      // Only one IPC message should have been sent for the two callers.
      const matterAccessoryRequests = sendSpy.mock.calls.filter(
        ([id]) => id === ChildProcessMessageEventType.GET_MATTER_ACCESSORIES,
      )
      expect(matterAccessoryRequests).toHaveLength(1)

      // Drive a single response for the shared in-flight request.
      child.emit('message', {
        id: ChildProcessMessageEventType.MATTER_EVENT,
        data: {
          type: 'accessoriesData',
          data: { accessories: [{ uuid: 'abc' }], bridgeUsername: 'X' },
        },
      })

      const [firstResult, secondResult] = await Promise.all([first, second])
      // Both callers now get the same data on a single response.
      expect(firstResult).toMatchObject({ accessories: [{ uuid: 'abc' }] })
      expect(secondResult).toMatchObject({ accessories: [{ uuid: 'abc' }] })
      // Identity-equal — they really are sharing the same promise resolution.
      expect(firstResult).toBe(secondResult)
    })

    it('returns identical undefined to concurrent callers on timeout', async () => {
      vi.useFakeTimers()
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()

      // Both callers must time out together — neither should be stranded
      // and neither should resolve while the other is still pending.
      const first = service.requestMatterAccessories(500)
      const second = service.requestMatterAccessories(500)

      vi.advanceTimersByTime(600)

      const [firstResult, secondResult] = await Promise.all([first, second])
      expect(firstResult).toBeUndefined()
      expect(secondResult).toBeUndefined()
    })

    it('clears the in-flight slot so a fresh call after settlement re-issues the IPC', async () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]
      const sendSpy = vi.spyOn((service as any), 'sendMessage')

      // First call → IPC #1.
      const first = service.requestMatterAccessories(500)
      child.emit('message', {
        id: ChildProcessMessageEventType.MATTER_EVENT,
        data: {
          type: 'accessoriesData',
          data: { accessories: [{ uuid: 'one' }], bridgeUsername: 'X' },
        },
      })
      await expect(first).resolves.toMatchObject({ accessories: [{ uuid: 'one' }] })

      // Second call, AFTER the first settled, must send a fresh IPC and
      // be able to receive a different response. Coalescing must not stick.
      const second = service.requestMatterAccessories(500)
      child.emit('message', {
        id: ChildProcessMessageEventType.MATTER_EVENT,
        data: {
          type: 'accessoriesData',
          data: { accessories: [{ uuid: 'two' }], bridgeUsername: 'X' },
        },
      })
      await expect(second).resolves.toMatchObject({ accessories: [{ uuid: 'two' }] })

      const matterAccessoryRequests = sendSpy.mock.calls.filter(
        ([id]) => id === ChildProcessMessageEventType.GET_MATTER_ACCESSORIES,
      )
      expect(matterAccessoryRequests).toHaveLength(2)
    })
  })

  describe('getMetadata', () => {
    it('includes Matter fields when bridgeConfig.matter is configured', () => {
      const { service } = buildService({
        bridgeConfig: makeBridgeConfig({ matter: { port: 5540, name: 'TestMatter' } }),
      })
      const metadata = service.getMetadata()
      expect(metadata.matterConfig).toBeDefined()
      expect(metadata.matterIdentifier).toBe('0E:DC:5D:BE:D6:75')
    })

    it('omits Matter fields when bridgeConfig.matter is not configured', () => {
      const { service } = buildService()
      const metadata = service.getMetadata()
      expect(metadata.matterConfig).toBeUndefined()
      expect(metadata.matterIdentifier).toBeUndefined()
    })

    it('reflects hap.enabled:false in metadata when HAP is disabled', () => {
      const { service } = buildService({
        bridgeConfig: makeBridgeConfig({ hap: { enabled: false }, matter: { port: 5540 } }),
      })
      const metadata = service.getMetadata()
      expect(metadata.hap).toEqual({ enabled: false })
    })

    it('reflects hap.enabled:true in metadata when HAP is explicitly enabled', () => {
      const { service } = buildService({
        bridgeConfig: makeBridgeConfig({ hap: { enabled: true } }),
      })
      const metadata = service.getMetadata()
      expect(metadata.hap).toEqual({ enabled: true })
    })

    it('reflects hap as undefined in metadata when not set (defaults enabled)', () => {
      const { service } = buildService()
      const metadata = service.getMetadata()
      expect(metadata.hap).toBeUndefined()
    })

    it('coerces a legacy boolean hap to the object form in metadata', () => {
      // A child whose config still carries the deprecated boolean shorthand
      // must surface the normalized object form to consumers (the config UI),
      // so ChildMetadata.hap stays object-shaped.
      const { service } = buildService({
        bridgeConfig: makeBridgeConfig({ hap: false }),
      })
      const metadata = service.getMetadata()
      expect(metadata.hap).toEqual({ enabled: false })
    })
  })

  describe('loadPlugin — hap property forwarded in LOAD message', () => {
    it('includes hap.enabled:false in LOAD bridgeConfig when HAP is disabled', () => {
      const { service } = buildService({
        bridgeConfig: makeBridgeConfig({ hap: { enabled: false }, matter: { port: 5540 } }),
      })
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]

      child.emit('message', { id: ChildProcessMessageEventType.READY })

      const loadMessage = child.sentMessages.find(m => m.id === ChildProcessMessageEventType.LOAD)
      expect(loadMessage).toBeDefined()
      expect(loadMessage.data.bridgeConfig.hap).toEqual({ enabled: false })
    })

    it('includes hap.enabled:false alongside matter config in LOAD bridgeConfig', () => {
      const { service } = buildService({
        bridgeConfig: makeBridgeConfig({ hap: { enabled: false }, matter: { port: 5540 } }),
      })
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]

      child.emit('message', { id: ChildProcessMessageEventType.READY })

      const loadMessage = child.sentMessages.find(m => m.id === ChildProcessMessageEventType.LOAD)
      expect(loadMessage.data.bridgeConfig.hap).toEqual({ enabled: false })
      expect(loadMessage.data.bridgeConfig.matter).toEqual({ port: 5540 })
    })

    it('does not set hap in LOAD bridgeConfig when not configured (default enabled)', () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]

      child.emit('message', { id: ChildProcessMessageEventType.READY })

      const loadMessage = child.sentMessages.find(m => m.id === ChildProcessMessageEventType.LOAD)
      expect(loadMessage).toBeDefined()
      expect(loadMessage.data.bridgeConfig.hap).toBeUndefined()
    })
  })
})
