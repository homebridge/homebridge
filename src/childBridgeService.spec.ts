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

  return {
    service,
    api,
    ipcService,
    pluginManager,
    externalPortService,
    plugin,
  }
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
      const { service } = buildService({
        bridgeConfig: makeBridgeConfig({ debugModeEnabled: true }),
      })
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      expect((service as any).args).toContain('-D')
    })

    it('does NOT pass -D when bridgeConfig.debugModeEnabled is undefined', () => {
      const { service } = buildService({
        bridgeConfig: makeBridgeConfig(),
      })
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      expect((service as any).args).not.toContain('-D')
    })

    it('passes -K when keepOrphanedCachedAccessories is true', () => {
      const { service } = buildService({
        homebridgeOptions: makeHomebridgeOptions({ keepOrphanedCachedAccessories: true }),
      })
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

    it('on ONLINE, re-sends startMatterMonitoring when monitoring is active', () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.isMatterMonitoringActive = () => true
      service.start()
      const child = childProcesses.list[0]

      child.emit('message', { id: ChildProcessMessageEventType.ONLINE })

      const monitorMessage = child.sentMessages.find(m => m.id === ChildProcessMessageEventType.START_MATTER_MONITORING)
      expect(monitorMessage).toBeDefined()
    })

    it('on ONLINE, does NOT send startMatterMonitoring when monitoring is inactive', () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.isMatterMonitoringActive = () => false
      service.start()
      const child = childProcesses.list[0]

      child.emit('message', { id: ChildProcessMessageEventType.ONLINE })

      const monitorMessage = child.sentMessages.find(m => m.id === ChildProcessMessageEventType.START_MATTER_MONITORING)
      expect(monitorMessage).toBeUndefined()
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
            commissioned: true,
            fabricCount: 1,
            fabrics: [
              {
                fabricIndex: 1,
                fabricId: '1',
                nodeId: '10',
                rootVendorId: 0x1349,
                label: 'My Home',
              },
            ],
          },
        },
      })

      expect((service as any).pairedStatus).toBe(true)
      expect((service as any).setupUri).toBe('X-HM://abc')
      expect((service as any).matterCommissioningInfo).toMatchObject({
        qrCode: 'MT:ABCD',
        commissioned: true,
        fabricCount: 1,
        fabrics: [
          { fabricIndex: 1, rootVendorId: 0x1349, label: 'My Home' },
        ],
      })
      // sendStatusUpdate called as part of handler
      expect(ipcService.sendMessage).toHaveBeenCalled()

      // The fabric list flows on into the metadata the UI consumes
      const metadata = service.getMetadata()
      expect(metadata.matterFabricCount).toBe(1)
      expect(metadata.matterFabrics).toEqual([
        {
          fabricIndex: 1,
          fabricId: '1',
          nodeId: '10',
          rootVendorId: 0x1349,
          label: 'My Home',
        },
      ])
    })

    it('on STATUS_UPDATE with a failed Matter start, says so in the metadata', () => {
      const { service } = buildService({
        bridgeConfig: makeBridgeConfig({
          matter: { port: 5540 },
        }),
      })
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]

      expect(service.getMetadata().matterStartFailed).toBeUndefined()

      child.emit('message', {
        id: ChildProcessMessageEventType.STATUS_UPDATE,
        data: {
          paired: false,
          setupUri: 'X-HM://abc',
          matter: {
            commissioned: false,
            deviceCount: 0,
            fabricCount: 0,
            fabrics: [],
            startFailed: true,
          },
        },
      })

      const metadata = service.getMetadata()
      expect(metadata.matterStartFailed).toBe(true)
      expect(metadata.matterCommissioned).toBe(false)
      expect(metadata.matterSetupUri).toBeUndefined()
    })

    describe('matter pairing details of an earlier process', () => {
      const matter = {
        qrCode: 'MT:OLD',
        manualPairingCode: '1234',
        serialNumber: 'SN',
        commissioned: true,
        deviceCount: 2,
        fabricCount: 1,
        fabrics: [],
      }

      function startedWithMatterStatus() {
        const built = buildService({
          bridgeConfig: makeBridgeConfig({
            matter: { port: 5540 },
          }),
        })
        built.service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
        built.service.start()
        childProcesses.list[0].emit('message', {
          id: ChildProcessMessageEventType.STATUS_UPDATE,
          data: { paired: true, setupUri: 'X-HM://old', matter },
        })
        expect(built.service.getMetadata()).toMatchObject({
          matterSetupUri: 'MT:OLD',
          matterPin: '1234',
          matterCommissioned: true,
          paired: true,
          setupUri: 'X-HM://old',
        })
        return built
      }

      it('are gone once a new process is started', () => {
        const { service } = startedWithMatterStatus()

        // the user takes the matter block out and restarts the child bridge
        service.restartChildBridge()
        childProcesses.list[0].emit('close', 143, null)
        expect(childProcesses.list).toHaveLength(2)

        const metadata = service.getMetadata()
        expect(metadata.matterSetupUri).toBeUndefined()
        expect(metadata.matterPin).toBeUndefined()
        expect(metadata.matterCommissioned).toBeUndefined()
        expect(metadata.paired).toBeNull()
        expect(metadata.setupUri).toBeNull()
      })

      it('are gone when the child reports a status with no Matter part', () => {
        const { service } = startedWithMatterStatus()

        childProcesses.list[0].emit('message', {
          id: ChildProcessMessageEventType.STATUS_UPDATE,
          data: { paired: true, setupUri: 'X-HM://old' },
        })

        const metadata = service.getMetadata()
        expect(metadata.matterSetupUri).toBeUndefined()
        expect(metadata.matterCommissioned).toBeUndefined()
        expect(metadata.setupUri).toBe('X-HM://old')
      })
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

    it('on MATTER_EVENT externalBridgeUnregistration, calls onExternalBridgeUnregistered and does not pass it to the UI', () => {
      const { service, ipcService } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.onExternalBridgeUnregistered = vi.fn()
      service.start()
      const child = childProcesses.list[0]
      ipcService.sendMessage.mockClear()

      child.emit('message', {
        id: ChildProcessMessageEventType.MATTER_EVENT,
        data: {
          type: 'externalBridgeUnregistration',
          data: { externalBridgeUsername: 'EE:EE:EE:EE:EE:EE' },
        },
      })

      expect(service.onExternalBridgeUnregistered).toHaveBeenCalledWith('EE:EE:EE:EE:EE:EE')
      expect(ipcService.sendMessage).not.toHaveBeenCalled()
    })

    // The outbound half of the same round trip. The Server spec asserts this
    // was called, but against a MOCK child bridge - so nothing exercised the
    // real method, and the correlationId could have been dropped on its way to
    // the child without a single test noticing.
    it('controlMatterAccessory forwards the whole request, correlationId included', () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]

      service.controlMatterAccessory({
        uuid: 'ctrl-uuid',
        cluster: 'onOff',
        attributes: { onOff: true },
        partId: 'part-1',
        correlationId: 'corr-out',
      })

      const sent = child.sentMessages.find(m => m.id === ChildProcessMessageEventType.MATTER_ACCESSORY_CONTROL)
      expect(sent).toBeDefined()
      expect(sent.data).toEqual({
        uuid: 'ctrl-uuid',
        cluster: 'onOff',
        attributes: { onOff: true },
        partId: 'part-1',
        correlationId: 'corr-out',
      })
    })

    // ⚠️ This wiring is what cancels the parent's "no child claimed it"
    // fallback. Without it the fallback still fires 2s after a SUCCESSFUL
    // control and sends a bogus "Accessory not found" carrying the same
    // correlationId - a worse failure than the silence it was added to fix.
    // The Server spec calls cancelPendingMatterControlRequest directly, so it
    // cannot catch a break here; only driving a real child message can.
    it('controlMatterAccessory says whether the request reached the child', () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]
      const request = {
        uuid: 'u',
        cluster: 'onOff',
        attributes: { onOff: true },
      }

      expect(service.controlMatterAccessory(request)).toBe(true)

      // Stopped, restarting, or waiting to be restarted after a crash.
      child.connected = false
      expect(service.controlMatterAccessory(request)).toBe(false)
    })

    it('getMatterAccessoryInfo sends the correlationId to the child, and hands the one on its reply back', () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]
      service.onAccessoryInfoResponse = vi.fn()

      service.getMatterAccessoryInfo('info-uuid', 'corr-info')

      const sent = child.sentMessages.find(m => m.id === ChildProcessMessageEventType.GET_MATTER_ACCESSORY_INFO)
      expect(sent.data).toEqual({ uuid: 'info-uuid', correlationId: 'corr-info' })

      child.emit('message', {
        id: ChildProcessMessageEventType.MATTER_EVENT,
        data: {
          type: 'accessoryInfoData',
          correlationId: 'corr-info',
          data: { uuid: 'info-uuid' },
        },
      })
      expect(service.onAccessoryInfoResponse).toHaveBeenCalledWith('info-uuid', 'corr-info')
    })

    it('on MATTER_EVENT accessoryControlResponse, calls onAccessoryControlResponse if set', () => {
      const { service, ipcService } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.onAccessoryControlResponse = vi.fn()
      service.start()
      const child = childProcesses.list[0]
      ipcService.sendMessage.mockClear()

      child.emit('message', {
        id: ChildProcessMessageEventType.MATTER_EVENT,
        data: {
          type: 'accessoryControlResponse',
          correlationId: 'corr-child',
          data: { success: true, uuid: 'abc' },
        },
      })

      expect(service.onAccessoryControlResponse).toHaveBeenCalledWith('corr-child')
      // and it is still forwarded to the UI
      expect(ipcService.sendMessage).toHaveBeenCalled()
    })

    it('on MATTER_EVENT accessoryControlResponse without a correlationId, forwards but cancels nothing', () => {
      const { service, ipcService } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.onAccessoryControlResponse = vi.fn()
      service.start()
      const child = childProcesses.list[0]
      ipcService.sendMessage.mockClear()

      child.emit('message', {
        id: ChildProcessMessageEventType.MATTER_EVENT,
        data: {
          type: 'accessoryControlResponse',
          data: { success: true, uuid: 'abc' },
        },
      })

      expect(service.onAccessoryControlResponse).not.toHaveBeenCalled()
      expect(ipcService.sendMessage).toHaveBeenCalled()
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
          data: {
            uuid: 'abc',
            cluster: 'onOff',
            state: { onOff: true },
          },
        },
      })

      expect(ipcService.sendMessage).toHaveBeenCalled()
    })

    // typeof null is 'object', so a null message used to throw in the listener
    it.each([null, undefined, 'text', 42])('ignores a message that is not an object (%s)', (message) => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]

      expect(() => child.emit('message', message)).not.toThrow()

      expect(child.sentMessages).toEqual([])
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

    it('caps signal-based exits at maxRestarts (no unbounded SIGSEGV loop)', () => {
      vi.useFakeTimers()
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
      service.start()

      // Repeatedly emit signal-based exits. Previously each iteration reset
      // restartCount = 0 and immediately re-forked, so a reproducibly-crashing
      // plugin produced an infinite loop.
      for (let i = 0; i < 4; i++) {
        const child = childProcesses.list[childProcesses.list.length - 1]
        child.emit('close', null, 'SIGSEGV')
      }

      const lastChild = childProcesses.list[childProcesses.list.length - 1]
      lastChild.emit('close', null, 'SIGSEGV')

      // 5th close trips the cap and parks the bridge as manually-stopped,
      // matching the existing plugin-crash branch.
      expect((service as any).manuallyStopped).toBe(true)
      expect((service as any).lastBridgeStatus).toBe(ChildBridgeStatus.DOWN)
    })

    it('resets the restart cap after a stable run (ONLINE for >= 5 minutes)', () => {
      vi.useFakeTimers()
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      service.start()

      // Three quick signal crashes (no ONLINE in between) climb the counter to 3.
      for (let i = 0; i < 3; i++) {
        const child = childProcesses.list[childProcesses.list.length - 1]
        child.emit('close', null, 'SIGSEGV')
      }
      expect((service as any).restartCount).toBe(3)

      // The next child comes up and stays online past the reset threshold.
      const stableChild = childProcesses.list[childProcesses.list.length - 1]
      stableChild.emit('message', { id: ChildProcessMessageEventType.ONLINE })
      vi.advanceTimersByTime(5 * 60 * 1000 + 1)
      stableChild.emit('close', null, 'SIGSEGV')

      // The stable run wiped the prior accumulation, so this exit is counted
      // as the first of a fresh run (reset to 0, then incremented to 1) and the
      // bridge restarts rather than being capped.
      expect((service as any).restartCount).toBe(1)
      expect((service as any).manuallyStopped).toBe(false)
    })

    it('does not reset the cap for a short-lived ONLINE run (still gives up)', () => {
      vi.useFakeTimers()
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
      service.start()

      // Each child reaches ONLINE but only stays up a minute — below the 5 min
      // threshold — so reaching ONLINE alone must not reset the counter.
      for (let i = 0; i < 4; i++) {
        const child = childProcesses.list[childProcesses.list.length - 1]
        child.emit('message', { id: ChildProcessMessageEventType.ONLINE })
        vi.advanceTimersByTime(60_000)
        child.emit('close', null, 'SIGSEGV')
      }

      const lastChild = childProcesses.list[childProcesses.list.length - 1]
      lastChild.emit('message', { id: ChildProcessMessageEventType.ONLINE })
      vi.advanceTimersByTime(60_000)
      lastChild.emit('close', null, 'SIGSEGV')

      // 5th close still trips the cap — brief uptime does not earn a reset.
      expect((service as any).manuallyStopped).toBe(true)
      expect((service as any).lastBridgeStatus).toBe(ChildBridgeStatus.DOWN)
    })
  })

  describe('restartChildBridge — a requested restart is not a crash', () => {
    it('keeps restarting however often the user asks, and leaves the crash count at zero', () => {
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
      service.start()

      for (let restart = 1; restart <= 6; restart++) {
        const child = childProcesses.list[childProcesses.list.length - 1]
        service.restartChildBridge()
        expect(child.killCalls).toEqual(['SIGTERM'])
        // The child exits with 128 + 15 after it handled the SIGTERM.
        child.emit('close', 143, null)
        expect(forkMock).toHaveBeenCalledTimes(restart + 1)
      }

      expect((service as any).restartCount).toBe(0)
      expect((service as any).manuallyStopped).toBe(false)
    })

    it('still counts a crash that follows a requested restart', () => {
      vi.useFakeTimers()
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      service.start()

      service.restartChildBridge()
      childProcesses.list[0].emit('close', 143, null)
      childProcesses.list[1].emit('close', 1, null)

      expect((service as any).restartCount).toBe(1)
    })
  })

  describe('homebridge shutdown while waiting to restart after a crash', () => {
    it('drops the pending restart', () => {
      vi.useFakeTimers()
      const { service, api } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      childProcesses.list[0].connected = false
      childProcesses.list[0].emit('close', 1, null)
      expect(vi.getTimerCount()).toBe(1)

      api.emit('shutdown')

      expect(vi.getTimerCount()).toBe(0)
      vi.advanceTimersByTime(60_000)
      expect(childProcesses.list).toHaveLength(1)
    })
  })

  describe('restartChildBridge — while waiting to restart after a crash', () => {
    it('starts the child now instead of waiting out the back-off, and only once', () => {
      vi.useFakeTimers()
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      vi.mocked(fs.readJson).mockResolvedValue({ platforms: [] } as any)
      service.start()

      // a plugin crash: the next start is 10 seconds away
      childProcesses.list[0].connected = false
      childProcesses.list[0].emit('close', 1, null)
      expect(childProcesses.list).toHaveLength(1)

      service.restartChildBridge()
      expect(childProcesses.list).toHaveLength(2)
      expect(service.getMetadata().status).toBe(ChildBridgeStatus.PENDING)
      // a restart the user asked for does not count as a failed attempt
      expect((service as any).restartCount).toBe(0)

      // the back-off timer is gone: no second process when it would have fired
      vi.advanceTimersByTime(60_000)
      expect(childProcesses.list).toHaveLength(2)
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

  describe('teardown — restart vs. stop semantics', () => {
    it('keeps the api shutdown listener attached when teardown is part of a restart', () => {
      const { service, api } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()

      const before = api.listenerCount('shutdown')
      // restartChildBridge -> teardown(), but neither shuttingDown nor
      // manuallyStopped are set. The listener must survive so a later
      // api shutdown still tears the new child down.
      service.restartChildBridge()

      expect(api.listenerCount('shutdown')).toBe(before)
    })

    it('removes the api shutdown listener when the service is manually stopped', () => {
      const { service, api } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()

      const before = api.listenerCount('shutdown')
      service.stopChildBridge()

      expect(api.listenerCount('shutdown')).toBe(before - 1)
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

  describe('startChildBridge after a manual stop', () => {
    it('tells the new child to stop when homebridge shuts down', () => {
      const { service, api } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      service.start()

      service.stopChildBridge()
      service.startChildBridge()
      const child = childProcesses.list[childProcesses.list.length - 1]

      expect(api.listenerCount('shutdown')).toBe(1)
      api.emit('shutdown')
      expect(child.killCalls).toEqual(['SIGTERM'])
    })

    it('leaves the api listener limit where it was after several stop and start cycles', () => {
      const { service, api } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      service.start()
      const limit = api.getMaxListeners()

      for (let cycle = 0; cycle < 3; cycle++) {
        service.stopChildBridge()
        service.startChildBridge()
      }

      expect(api.getMaxListeners()).toBe(limit)
      expect(api.listenerCount('shutdown')).toBe(1)
    })
  })

  describe('refreshConfig', () => {
    // Homebridge upper-cases the username in memory; the file keeps the user's spelling.
    it.each([
      {
        type: PluginType.PLATFORM,
        key: 'platforms',
        entry: { platform: 'TestPlatform' },
      },
      {
        type: PluginType.ACCESSORY,
        key: 'accessories',
        entry: { accessory: 'TestPlatform' },
      },
    ])('finds its $key entry when the username in config.json is lower case', async ({ type, key, entry }) => {
      const { service } = buildService({
        type,
        identifier: 'TestPlatform',
        bridgeConfig: makeBridgeConfig({ username: '0E:DC:5D:BE:D6:75' }),
      })
      const updated = {
        ...entry,
        name: 'Renamed',
        _bridge: { username: '0e:dc:5d:be:d6:75' },
      }
      vi.mocked(fs.readJson).mockResolvedValue({
        [key]: [updated],
      } as any)

      await service.refreshConfig()

      expect((service as any).pluginConfig[0].name).toBe('Renamed')
      // the bridge keeps its identity: the username it started with
      expect((service as any).bridgeConfig.username).toBe('0E:DC:5D:BE:D6:75')
    })

    // A restart reads config.json again. The `_bridge` block it finds used to be
    // taken as it was, without the checks a full start gives it.
    describe('checks the _bridge block it reads', () => {
      const username = '0E:DC:5D:BE:D6:75'

      function refreshWith(bridge: Record<string, unknown>, rest: Record<string, unknown> = {}) {
        const built = buildService({
          identifier: 'TestPlatform',
          bridgeConfig: makeBridgeConfig({
            username,
            hap: { enabled: true },
          }),
        })
        built.externalPortService.reserveMatterPort = vi.fn()
        vi.mocked(fs.readJson).mockResolvedValue({
          bridge: { username: 'CC:22:3D:E3:CE:30', pin: '031-45-154' },
          platforms: [
            {
              platform: 'TestPlatform',
              name: 'Renamed',
              _bridge: { username, ...bridge },
            },
          ],
          ...rest,
        } as any)
        return built
      }

      it('keeps the bridge settings in use when the new hap block is not valid', async () => {
        const { service } = refreshWith({ hap: 'yes' })

        await service.refreshConfig()

        // the plugin config is still refreshed; only the bridge block is refused
        expect((service as any).pluginConfig[0].name).toBe('Renamed')
        expect((service as any).bridgeConfig.hap).toEqual({ enabled: true })
      })

      it('turns a legacy boolean hap into the object form', async () => {
        const { service } = refreshWith({ hap: false })

        await service.refreshConfig()

        expect((service as any).bridgeConfig.hap).toEqual({ enabled: false })
      })

      it('drops a matter block whose port is not valid', async () => {
        const { service, externalPortService } = refreshWith({
          matter: { port: 80 },
        })

        await service.refreshConfig()

        expect((service as any).bridgeConfig.matter).toBeUndefined()
        expect(externalPortService.reserveMatterPort).not.toHaveBeenCalled()
      })

      it('says what is wrong with the matter block it drops', async () => {
        const { service } = refreshWith({
          matter: { port: 80 },
        })
        const error = vi.spyOn((service as any).log, 'error').mockImplementation(() => {})

        await service.refreshConfig()

        expect(error.mock.calls.map(call => String(call[0]))).toEqual([
          expect.stringContaining('Port must be between 1025 and 65534 (got: 80)'),
          'The Matter configuration of this child bridge is invalid. Matter will not be enabled for it.',
        ])
      })

      it('warns about a matter port next to the hap port of the bridge', async () => {
        const { service } = refreshWith({
          port: 51830,
          matter: { port: 51831 },
        })
        const warn = vi.spyOn((service as any).log, 'warn').mockImplementation(() => {})

        await service.refreshConfig()

        expect(warn.mock.calls.map(call => String(call[0]))).toEqual([
          expect.stringContaining('HAP port 51830 and Matter port 51831 are very close'),
        ])
        expect((service as any).bridgeConfig.matter).toEqual({ port: 51831 })
      })

      it.each([
        [
          'the main bridge',
          {
            bridge: {
              username: 'CC:22:3D:E3:CE:30',
              pin: '031-45-154',
              matter: { port: 5560 },
            },
          },
        ],
        [
          'another child bridge',
          {
            accessories: [
              {
                accessory: 'Other',
                name: 'O',
                _bridge: {
                  username: '0E:00:00:00:00:01',
                  matter: { port: 5560 },
                },
              },
            ],
          },
        ],
      ])('drops a matter block whose port belongs to %s', async (_owner, rest) => {
        const { service, externalPortService } = refreshWith({
          matter: { port: 5560 },
        }, rest)

        await service.refreshConfig()

        expect((service as any).bridgeConfig.matter).toBeUndefined()
        expect(externalPortService.reserveMatterPort).not.toHaveBeenCalled()
      })

      it('takes a valid matter block, and keeps its port away from every other bridge', async () => {
        const { service, externalPortService } = refreshWith({
          matter: { port: 5560 },
        }, {
          // a bridge that starts no Matter server does not hold its port
          accessories: [
            {
              accessory: 'Other',
              name: 'O',
              _bridge: {
                username: '0E:00:00:00:00:01',
                matter: { port: 5560, enabled: false },
              },
            },
          ],
        })

        await service.refreshConfig()

        expect((service as any).bridgeConfig.matter).toEqual({ port: 5560 })
        expect(externalPortService.reserveMatterPort).toHaveBeenCalledWith(5560)
      })

      it('reads externalsOnly without enabled: false as externalsOnly mode, as a full start does', async () => {
        const { service } = refreshWith({
          matter: { externalsOnly: true },
        })

        await service.refreshConfig()

        expect((service as any).bridgeConfig.matter).toEqual({ externalsOnly: true, enabled: false })
      })
    })

    it('updates pluginConfig from the on-disk config when entries match', async () => {
      const { service } = buildService({
        identifier: 'TestPlatform',
        bridgeConfig: makeBridgeConfig({ username: '0E:DC:5D:BE:D6:75' }),
      })
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
      const mockLog = {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        success: vi.fn(),
        log: vi.fn(),
      }
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
      const mockLog = {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        success: vi.fn(),
        log: vi.fn(),
      }
      ;(service as any).log = Object.assign(vi.fn(), mockLog)
      ;(fs.readJson as any).mockRejectedValueOnce(new Error('Disk full'))

      await service.refreshConfig()

      expect(mockLog.error).toHaveBeenCalled()
    })

    it('tolerates a config file with no platforms key (PLATFORM type)', async () => {
      const { service } = buildService({ identifier: 'TestPlatform' })
      service.addConfig({ platform: 'TestPlatform', name: 'Original' } as any)
      const mockLog = {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        success: vi.fn(),
        log: vi.fn(),
      }
      ;(service as any).log = Object.assign(vi.fn(), mockLog)
      // Minimal config with no platforms or accessories at all — used to throw
      // "Cannot read properties of undefined (reading 'length')" via the
      // optional-chained filter.
      ;(fs.readJson as any).mockResolvedValueOnce({
        bridge: { username: '00:00:00:00:00:00' },
      })

      await service.refreshConfig()

      // Falls back to existing config + warns, not the unhelpful TypeError.
      expect(mockLog.warn).toHaveBeenCalled()
      expect(mockLog.error).not.toHaveBeenCalled()
    })

    it('tolerates a config file with no accessories key (ACCESSORY type)', async () => {
      const { service } = buildService({ type: PluginType.ACCESSORY, identifier: 'TestAccessory' })
      service.addConfig({ accessory: 'TestAccessory', name: 'Original' } as any)
      const mockLog = {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        success: vi.fn(),
        log: vi.fn(),
      }
      ;(service as any).log = Object.assign(vi.fn(), mockLog)
      ;(fs.readJson as any).mockResolvedValueOnce({
        bridge: { username: '00:00:00:00:00:00' },
      })

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
          data: {
            accessories: [
              { uuid: 'abc' },
            ],
            bridgeUsername: 'X',
          },
        },
      })

      await expect(promise).resolves.toMatchObject({
        accessories: [
          { uuid: 'abc' },
        ],
      })
    })

    it('resolves with undefined at once when the child process is not running', async () => {
      vi.useFakeTimers()
      const { service } = buildService()
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]
      // stopped, restarting, or waiting to be restarted after a crash
      child.connected = false

      // No timer is advanced: before, this waited out the full timeout.
      await expect(service.requestMatterAccessories(500)).resolves.toBeUndefined()
      expect(vi.getTimerCount()).toBe(0)
      expect(child.sentMessages.some(m => m.id === ChildProcessMessageEventType.GET_MATTER_ACCESSORIES)).toBe(false)
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
          data: {
            accessories: [
              { uuid: 'abc' },
            ],
            bridgeUsername: 'X',
          },
        },
      })

      const [firstResult, secondResult] = await Promise.all([first, second])
      // Both callers now get the same data on a single response.
      expect(firstResult).toMatchObject({
        accessories: [
          { uuid: 'abc' },
        ],
      })
      expect(secondResult).toMatchObject({
        accessories: [
          { uuid: 'abc' },
        ],
      })
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
          data: {
            accessories: [
              { uuid: 'one' },
            ],
            bridgeUsername: 'X',
          },
        },
      })
      await expect(first).resolves.toMatchObject({
        accessories: [
          { uuid: 'one' },
        ],
      })

      // Second call, AFTER the first settled, must send a fresh IPC and
      // be able to receive a different response. Coalescing must not stick.
      const second = service.requestMatterAccessories(500)
      child.emit('message', {
        id: ChildProcessMessageEventType.MATTER_EVENT,
        data: {
          type: 'accessoriesData',
          data: {
            accessories: [
              { uuid: 'two' },
            ],
            bridgeUsername: 'X',
          },
        },
      })
      await expect(second).resolves.toMatchObject({
        accessories: [
          { uuid: 'two' },
        ],
      })

      const matterAccessoryRequests = sendSpy.mock.calls.filter(
        ([id]) => id === ChildProcessMessageEventType.GET_MATTER_ACCESSORIES,
      )
      expect(matterAccessoryRequests).toHaveLength(2)
    })
  })

  describe('getMetadata', () => {
    it('includes Matter fields when bridgeConfig.matter is configured', () => {
      const { service } = buildService({
        bridgeConfig: makeBridgeConfig({
          matter: { port: 5540, name: 'TestMatter' },
        }),
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
        bridgeConfig: makeBridgeConfig({
          hap: { enabled: false },
          matter: { port: 5540 },
        }),
      })
      const metadata = service.getMetadata()
      expect(metadata.hap).toEqual({ enabled: false })
    })

    it('reflects hap.enabled:true in metadata when HAP is explicitly enabled', () => {
      const { service } = buildService({
        bridgeConfig: makeBridgeConfig({
          hap: { enabled: true },
        }),
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
        bridgeConfig: makeBridgeConfig({
          hap: { enabled: false },
          matter: { port: 5540 },
        }),
      })
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]

      child.emit('message', { id: ChildProcessMessageEventType.READY })

      const loadMessage = child.sentMessages.find(m => m.id === ChildProcessMessageEventType.LOAD)
      expect(loadMessage).toBeDefined()
      expect(loadMessage.data.bridgeConfig.hap).toEqual({ enabled: false })
    })

    it('includes hap.disableIdentifyingMaterial in LOAD bridgeConfig', () => {
      const { service } = buildService({
        bridgeConfig: makeBridgeConfig({
          hap: { disableIdentifyingMaterial: true },
        }),
      })
      service.addConfig({ platform: 'TestPlatform', name: 'X' } as any)
      service.start()
      const child = childProcesses.list[0]

      child.emit('message', { id: ChildProcessMessageEventType.READY })

      const loadMessage = child.sentMessages.find(m => m.id === ChildProcessMessageEventType.LOAD)
      expect(loadMessage.data.bridgeConfig.hap).toEqual({ disableIdentifyingMaterial: true })
    })

    it('includes hap.enabled:false alongside matter config in LOAD bridgeConfig', () => {
      const { service } = buildService({
        bridgeConfig: makeBridgeConfig({
          hap: { enabled: false },
          matter: { port: 5540 },
        }),
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
