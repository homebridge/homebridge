import type { MockInstance } from 'vitest'

import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { HAPStorage } from '@homebridge/hap-nodejs'
import fs from 'fs-extra'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { PluginType } from './api.js'
import { Logger } from './logger.js'
import { Server } from './server.js'
import { User } from './user.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe('server', () => {
  const homebridgeStorageFolder = path.resolve(__dirname, '../mock')
  const configPath = path.resolve(homebridgeStorageFolder, 'config.json')
  let consoleErrorSpy: MockInstance
  let consoleLogSpy: MockInstance

  const mockConfig = {
    bridge: {
      username: 'CC:22:3D:E3:CE:30',
      pin: '031-45-154',
      name: 'Homebridge',
      advertiser: 'ciao',
    },
    accessories: [],
    platforms: [],
  }

  beforeAll(async () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await fs.ensureDir(homebridgeStorageFolder)
    await fs.writeJson(configPath, mockConfig)
    User.setStoragePath(homebridgeStorageFolder)
    HAPStorage.setCustomStoragePath(User.persistPath())
  })

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterAll(async () => {
    await fs.remove(homebridgeStorageFolder)
    consoleErrorSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })

  it('creates an instance of the server without errors', async () => {
    const server = new Server({
      customStoragePath: homebridgeStorageFolder,
      hideQRCode: true,
    })

    expect(server).toBeInstanceOf(Server)
  })

  it('starts without errors', async () => {
    const server = new Server({
      customStoragePath: homebridgeStorageFolder,
      hideQRCode: true,
    })

    await server.start()

    expect(server).toBeInstanceOf(Server)
  })

  describe('protocol-enablement helpers', () => {
    describe('isHapEnabled', () => {
      it('returns true when bridge.hap is unset (default)', () => {
        expect(Server.isHapEnabled({ ...mockConfig.bridge } as any)).toBe(true)
      })

      it('returns true when bridge.hap is an empty object (default)', () => {
        expect(Server.isHapEnabled({ ...mockConfig.bridge, hap: {} } as any)).toBe(true)
      })

      it('returns true when bridge.hap.enabled is explicitly true', () => {
        expect(Server.isHapEnabled({ ...mockConfig.bridge, hap: { enabled: true } } as any)).toBe(true)
      })

      it('returns false when bridge.hap.enabled is explicitly false', () => {
        expect(Server.isHapEnabled({ ...mockConfig.bridge, hap: { enabled: false } } as any)).toBe(false)
      })

      it('returns false when externalsOnly is set (bridge does not publish itself)', () => {
        expect(Server.isHapEnabled({ ...mockConfig.bridge, hap: { enabled: false, externalsOnly: true } } as any)).toBe(false)
      })
    })

    describe('isMatterEnabledForBridge', () => {
      it('returns false when bridge.matter is unset', () => {
        expect(Server.isMatterEnabledForBridge({ ...mockConfig.bridge } as any)).toBe(false)
      })

      it('returns true when bridge.matter is configured (even with no fields)', () => {
        expect(Server.isMatterEnabledForBridge({ ...mockConfig.bridge, matter: {} } as any)).toBe(true)
      })

      it('returns true when bridge.matter has fields configured', () => {
        expect(Server.isMatterEnabledForBridge({ ...mockConfig.bridge, matter: { port: 5540, name: 'Test' } } as any)).toBe(true)
      })

      it('returns false when bridge.matter is configured but explicitly disabled', () => {
        expect(Server.isMatterEnabledForBridge({ ...mockConfig.bridge, matter: { port: 5540, enabled: false } } as any)).toBe(false)
      })

      it('returns true when bridge.matter.enabled is explicitly true', () => {
        expect(Server.isMatterEnabledForBridge({ ...mockConfig.bridge, matter: { port: 5540, enabled: true } } as any)).toBe(true)
      })
    })
  })

  describe('main bridge protocol validation (loadConfig)', () => {
    // Each test writes a tailored config.json, constructs Server, then restores
    // the canonical mockConfig so subsequent tests are not contaminated.
    afterEach(async () => {
      await fs.writeJson(configPath, mockConfig)
    })

    it('accepts a config where both HAP is disabled AND no matter is configured', async () => {
      // Both protocols off is allowed — the bridge loads and simply advertises nothing.
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, hap: { enabled: false } },
      })

      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      expect(server).toBeInstanceOf(Server)
    })

    it('accepts hap.enabled:false when matter is configured', async () => {
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, hap: { enabled: false }, matter: { port: 5540 } },
      })

      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      expect(server).toBeInstanceOf(Server)
    })

    it('accepts hap.enabled:true with no matter (the historical default)', async () => {
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, hap: { enabled: true } },
      })

      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      expect(server).toBeInstanceOf(Server)
    })

    it('accepts a config with both hap and matter enabled', async () => {
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, hap: { enabled: true }, matter: { port: 5540 } },
      })

      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      expect(server).toBeInstanceOf(Server)
    })

    it('accepts the default config (no hap, no matter) — HAP is on by default', async () => {
      // mockConfig has no hap field and no matter block.
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      expect(server).toBeInstanceOf(Server)
    })

    it('accepts a lowercase main bridge MAC and normalises it to uppercase', async () => {
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, username: 'cc:22:3d:e3:ce:30' },
      })

      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })

      // The constructor should not have thrown. The stored bridge config
      // should have an uppercase username so child-bridge dedup, registry
      // lookups, and `validMacAddress` (which is case-sensitive) all agree.
      expect(server).toBeInstanceOf(Server)
      expect((server as any).config.bridge.username).toBe('CC:22:3D:E3:CE:30')
    })

    it('accepts a mixed-case main bridge MAC and normalises it to uppercase', async () => {
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, username: 'Cc:22:3D:e3:CE:30' },
      })

      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      expect((server as any).config.bridge.username).toBe('CC:22:3D:E3:CE:30')
    })

    it('rejects a non-string main bridge username with the validMacAddress error, not a TypeError', async () => {
      // Truthy non-string values (e.g. a number from a hand-edited JSON config)
      // must hit the existing MAC validation error, not crash on `.toUpperCase`.
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, username: 123456 as unknown as string },
      })

      expect(() => new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })).toThrow(/not a valid username/i)
    })

    it('accepts main bridge with externalsOnly: true + enabled: false (canonical form)', async () => {
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, hap: { enabled: false, externalsOnly: true } },
      })

      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      expect(server).toBeInstanceOf(Server)
    })

    it('honours main bridge with externalsOnly: true alone — warns + normalises, no throw (#3944)', async () => {
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, hap: { externalsOnly: true } },
      })

      // No longer fatal: validateHapConfig warns and normalises enabled to false,
      // so the server constructs successfully (mirrors the Matter behaviour).
      expect(new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })).toBeInstanceOf(Server)
    })

    it('honours main bridge with externalsOnly: true + enabled: true — no throw', async () => {
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, hap: { enabled: true, externalsOnly: true } },
      })

      expect(new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })).toBeInstanceOf(Server)
    })

    it('normalizes a legacy boolean hap: false on the main bridge (back-compat, no throw)', async () => {
      await fs.writeJson(configPath, {
        ...mockConfig,
        // hap: false also needs matter configured, otherwise the bridge advertises
        // nothing — pair it with matter so the config is coherent.
        bridge: { ...mockConfig.bridge, hap: false as unknown as object, matter: { port: 5540 } },
      })

      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })

      // The boolean was normalized to the object shape rather than rejected.
      expect((server as any).config.bridge.hap).toEqual({ enabled: false })
    })
  })

  describe('child bridge protocol validation (validateChildBridgeConfig)', () => {
    // validateChildBridgeConfig is private; call it directly to exercise the
    // protocol rules in isolation (mirrors the `(server as any)` pattern used
    // elsewhere in this file). A fresh server has no registered child bridges,
    // so the duplicate-username branch is not hit.
    const childUsername = '0E:11:22:33:44:55'

    function makeServer(): Server {
      return new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
    }

    it('accepts a platform child bridge with both HAP and Matter disabled', () => {
      // No `matter` block and `hap.enabled: false` means neither protocol is enabled —
      // this is now allowed; the child bridge simply advertises nothing.
      const server = makeServer()
      expect(() => (server as any).validateChildBridgeConfig(PluginType.PLATFORM, 'homebridge-example', {
        username: childUsername,
        hap: { enabled: false },
      })).not.toThrow()
    })

    it('accepts an accessory child bridge with HAP disabled (no Matter alternative)', () => {
      const server = makeServer()
      expect(() => (server as any).validateChildBridgeConfig(PluginType.ACCESSORY, 'homebridge-example', {
        username: childUsername,
        hap: { enabled: false },
      })).not.toThrow()
    })

    it('still rejects a child bridge with an invalid username', () => {
      // Surrounding validation must remain intact after dropping the protocol check.
      const server = makeServer()
      expect(() => (server as any).validateChildBridgeConfig(PluginType.PLATFORM, 'homebridge-example', {
        username: 'not-a-mac',
        hap: { enabled: false },
      })).toThrow(/not a valid username/i)
    })

    it('accepts a lowercase child bridge MAC and normalises it to uppercase (matches main bridge) (#3944)', () => {
      // Previously a lowercase _bridge.username was rejected here even though the
      // identical value is accepted on the main bridge — fix the asymmetry.
      const server = makeServer()
      const bridgeConfig: any = { username: '0e:11:22:33:44:55', hap: { enabled: false } }
      expect(() => (server as any).validateChildBridgeConfig(PluginType.PLATFORM, 'homebridge-example', bridgeConfig)).not.toThrow()
      expect(bridgeConfig.username).toBe('0E:11:22:33:44:55') // normalised in place
    })

    it('rejects a non-string child username with the validMacAddress error, not a TypeError', () => {
      const server = makeServer()
      expect(() => (server as any).validateChildBridgeConfig(PluginType.PLATFORM, 'homebridge-example', {
        username: 123456,
        hap: { enabled: false },
      })).toThrow(/not a valid username/i)
    })

    it('accepts a platform child bridge with externalsOnly: true + enabled: false (canonical form)', () => {
      const server = makeServer()
      expect(() => (server as any).validateChildBridgeConfig(PluginType.PLATFORM, 'homebridge-example', {
        username: childUsername,
        hap: { enabled: false, externalsOnly: true },
      })).not.toThrow()
    })

    it('honours a platform child bridge with externalsOnly: true alone — warns + normalises, no throw (#3944)', () => {
      const server = makeServer()
      const cfg: any = { username: childUsername, hap: { externalsOnly: true } }
      expect(() => (server as any).validateChildBridgeConfig(PluginType.PLATFORM, 'homebridge-example', cfg)).not.toThrow()
      expect(cfg.hap.enabled).toBe(false) // normalised to canonical form
    })

    it('honours a platform child bridge with externalsOnly: true + enabled: true — flips enabled to false', () => {
      const server = makeServer()
      const cfg: any = { username: childUsername, hap: { enabled: true, externalsOnly: true } }
      expect(() => (server as any).validateChildBridgeConfig(PluginType.PLATFORM, 'homebridge-example', cfg)).not.toThrow()
      expect(cfg.hap.enabled).toBe(false)
    })

    it('normalizes a legacy boolean hap value on a child bridge (back-compat, no throw)', () => {
      const server = makeServer()
      const cfg: any = {
        username: childUsername,
        hap: false,
      }
      expect(() => (server as any).validateChildBridgeConfig(PluginType.PLATFORM, 'homebridge-example', cfg)).not.toThrow()
      expect(cfg.hap).toEqual({ enabled: false })
    })

    it('strips externalsOnly with a warn on accessory child bridges (instead of throwing)', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const server = makeServer()
      const cfg = {
        username: childUsername,
        hap: { enabled: false, externalsOnly: true },
      }

      expect(() => (server as any).validateChildBridgeConfig(PluginType.ACCESSORY, 'homebridge-example', cfg)).not.toThrow()
      expect(cfg.hap.externalsOnly).toBeUndefined()
      expect(cfg.hap.enabled).toBe(false)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/externalsOnly.*not supported.*accessory/))
    })
  })

  describe('handleGetMatterAccessoryInfo (fallback when nothing has the UUID)', () => {
    it('immediately sends an error event when no matter-enabled child bridges exist', () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})

      // No childBridges have matter, no main matterManager. Previously this
      // path simply returned and the UI hung waiting forever.
      ;(server as any).handleGetMatterAccessoryInfo('unknown-uuid')

      const errorEvent = sendSpy.mock.calls.find(([id, payload]) =>
        id === 'matterEvent' && (payload as any)?.type === 'accessoryInfoData' && (payload as any)?.data?.error,
      )
      expect(errorEvent).toBeDefined()
    })

    it('treats a child with matter.enabled=false as no lookup target (immediate not-found, no fallback timer)', () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})

      // A disabled-matter child still carries a matterConfig block, but it never
      // starts a Matter handler — so it must NOT be forwarded to. With it being
      // the only child, the handler should reply "not found" immediately rather
      // than scheduling the 2s fallback.
      const disabledChild = {
        getMetadata: () => ({ matterConfig: { enabled: false } }),
        getMatterAccessoryInfo: vi.fn(),
      }
      ;(server as any).childBridges.set('CC:00:00:00:00:02', disabledChild)

      const uuid = 'disabled-child-uuid'
      ;(server as any).handleGetMatterAccessoryInfo(uuid)

      expect(disabledChild.getMatterAccessoryInfo).not.toHaveBeenCalled()
      expect((server as any).pendingMatterAccessoryInfoLookups.has(uuid)).toBe(false)
      const notFound = sendSpy.mock.calls.find(([id, payload]) =>
        id === 'matterEvent'
        && (payload as any)?.type === 'accessoryInfoData'
        && (payload as any)?.data?.error === `Accessory ${uuid} not found`,
      )
      expect(notFound).toBeDefined()
    })

    it('forwards to a child whose matter is active (externalsOnly counts) and schedules the fallback', () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})

      const externalsOnlyChild = {
        getMetadata: () => ({ matterConfig: { enabled: false, externalsOnly: true } }),
        getMatterAccessoryInfo: vi.fn(),
      }
      ;(server as any).childBridges.set('CC:00:00:00:00:03', externalsOnlyChild)

      const uuid = 'externals-only-uuid'
      ;(server as any).handleGetMatterAccessoryInfo(uuid)

      expect(externalsOnlyChild.getMatterAccessoryInfo).toHaveBeenCalledWith(uuid)
      expect((server as any).pendingMatterAccessoryInfoLookups.has(uuid)).toBe(true)
    })

    it('responds with an error when uuid is missing', () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})

      ;(server as any).handleGetMatterAccessoryInfo(undefined)

      const errorEvent = sendSpy.mock.calls.find(([id, payload]) =>
        id === 'matterEvent' && (payload as any)?.data?.error === 'UUID is required',
      )
      expect(errorEvent).toBeDefined()
    })

    it('cancels the pending fallback timer when a child responds for the same uuid', () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      const uuid = 'abc-uuid-12345'

      // Pretend a matter-enabled child bridge exists; forwarding to it
      // schedules the parent-side fallback timer.
      const stubChild = {
        getMetadata: () => ({ matterConfig: {} }),
        getMatterAccessoryInfo: vi.fn(),
      }
      ;(server as any).childBridges.set('CC:00:00:00:00:01', stubChild)

      ;(server as any).handleGetMatterAccessoryInfo(uuid)
      expect((server as any).pendingMatterAccessoryInfoLookups.has(uuid)).toBe(true)

      // Simulate the child's accessoryInfoData arriving — the Server's
      // ChildBridgeService callback should clear the pending timer.
      ;(server as any).cancelPendingMatterAccessoryInfoLookup(uuid)
      expect((server as any).pendingMatterAccessoryInfoLookups.has(uuid)).toBe(false)
    })

    it('clears any pending fallback timers during teardown', async () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })

      // Schedule a fallback timer the same way handleGetMatterAccessoryInfo
      // would. We don't go through that handler here because we just want
      // a registered timer in the map for teardown to clean up.
      const uuid = 'teardown-uuid-1'
      ;(server as any).pendingMatterAccessoryInfoLookups.set(uuid, setTimeout(() => {}, 60_000))

      // Stub out the collaborators teardown() reaches into — we're only
      // testing the timer cleanup line, not the wider shutdown flow.
      // sendMessage is reached via setServerStatus(ServerStatus.DOWN).
      ;(server as any).bridgeService = { teardown: () => {} }
      ;(server as any).ipcService = { stop: () => {}, sendMessage: () => {} }

      await server.teardown()

      expect((server as any).pendingMatterAccessoryInfoLookups.size).toBe(0)
    })
  })

  describe('handleMatterAccessoryControl (forwarding to active child bridges only)', () => {
    it('does not forward a control request to a child with matter.enabled=false', async () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})

      // Main bridge has no matterManager, so the control attempt throws and falls
      // through to child forwarding. A disabled-matter child has no handler, so it
      // must be skipped — leaving zero targets and an immediate "not found".
      const disabledChild = {
        getMetadata: () => ({ matterConfig: { enabled: false } }),
        controlMatterAccessory: vi.fn(),
      }
      ;(server as any).childBridges.set('CC:00:00:00:00:04', disabledChild)

      await (server as any).handleMatterAccessoryControl({ uuid: 'ctrl-uuid', cluster: 'OnOff', attributes: { on: true } })

      expect(disabledChild.controlMatterAccessory).not.toHaveBeenCalled()
      const notFound = sendSpy.mock.calls.find(([id, payload]) =>
        id === 'matterEvent'
        && (payload as any)?.type === 'accessoryControlResponse'
        && (payload as any)?.data?.error === 'Accessory not found',
      )
      expect(notFound).toBeDefined()
    })

    it('forwards a control request to an active (externalsOnly) child', async () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})

      const activeChild = {
        getMetadata: () => ({ matterConfig: { enabled: false, externalsOnly: true } }),
        controlMatterAccessory: vi.fn(),
      }
      ;(server as any).childBridges.set('CC:00:00:00:00:05', activeChild)

      await (server as any).handleMatterAccessoryControl({ uuid: 'ctrl-uuid', cluster: 'OnOff', attributes: { on: true } })

      expect(activeChild.controlMatterAccessory).toHaveBeenCalledWith(
        expect.objectContaining({ uuid: 'ctrl-uuid' }),
      )
    })
  })

  describe('handleStopMatterMonitoring (no-clients ack)', () => {
    it('acknowledges with monitoringStopped + alreadyStopped when no clients are active', () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})

      // No prior start — counter is 0. Previously this returned silently and
      // the UI sat waiting for a confirmation event forever.
      ;(server as any).handleStopMatterMonitoring()

      const ack = sendSpy.mock.calls.find(([id, payload]) =>
        id === 'matterEvent' && (payload as any)?.type === 'monitoringStopped',
      )
      expect(ack).toBeDefined()
      expect((ack![1] as any).data).toMatchObject({ success: true, alreadyStopped: true })
    })
  })

  describe('matter monitoring lifecycle correlationId echo', () => {
    // The UI parks each start/stopMatterMonitoring request under a
    // correlationId, and its shared matterEvent dispatcher drops any event
    // without one — so the ack has to echo whatever the UI sent.

    it('echoes correlationId on the first-client monitoringStarted ack', () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})

      ;(server as any).handleStartMatterMonitoring({ correlationId: 'start-1' })

      const ack = sendSpy.mock.calls.find(([id, payload]) =>
        id === 'matterEvent' && (payload as any)?.type === 'monitoringStarted',
      )
      expect(ack).toBeDefined()
      expect((ack![1] as any).correlationId).toBe('start-1')
      expect((ack![1] as any).data).toMatchObject({ success: true })
    })

    it('echoes correlationId on the alreadyActive monitoringStarted ack', () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})

      // First start (no correlationId) bumps the counter to 1.
      ;(server as any).handleStartMatterMonitoring()
      sendSpy.mockClear()

      // Second start hits the "already monitoring" branch.
      ;(server as any).handleStartMatterMonitoring({ correlationId: 'start-2' })

      const ack = sendSpy.mock.calls.find(([id, payload]) =>
        id === 'matterEvent' && (payload as any)?.type === 'monitoringStarted',
      )
      expect(ack).toBeDefined()
      expect((ack![1] as any).correlationId).toBe('start-2')
      expect((ack![1] as any).data).toMatchObject({ success: true, alreadyActive: true })
    })

    it('echoes correlationId on the last-client monitoringStopped ack', () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})

      ;(server as any).handleStartMatterMonitoring()
      sendSpy.mockClear()

      ;(server as any).handleStopMatterMonitoring({ correlationId: 'stop-1' })

      const ack = sendSpy.mock.calls.find(([id, payload]) =>
        id === 'matterEvent' && (payload as any)?.type === 'monitoringStopped',
      )
      expect(ack).toBeDefined()
      expect((ack![1] as any).correlationId).toBe('stop-1')
      expect((ack![1] as any).data).toMatchObject({ success: true })
    })

    it('echoes correlationId on the othersActive monitoringStopped ack', () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})

      ;(server as any).handleStartMatterMonitoring()
      ;(server as any).handleStartMatterMonitoring()
      sendSpy.mockClear()

      ;(server as any).handleStopMatterMonitoring({ correlationId: 'stop-2' })

      const ack = sendSpy.mock.calls.find(([id, payload]) =>
        id === 'matterEvent' && (payload as any)?.type === 'monitoringStopped',
      )
      expect(ack).toBeDefined()
      expect((ack![1] as any).correlationId).toBe('stop-2')
      expect((ack![1] as any).data).toMatchObject({ success: true, othersActive: true })
    })

    it('echoes correlationId on the alreadyStopped monitoringStopped ack', () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})

      ;(server as any).handleStopMatterMonitoring({ correlationId: 'stop-3' })

      const ack = sendSpy.mock.calls.find(([id, payload]) =>
        id === 'matterEvent' && (payload as any)?.type === 'monitoringStopped',
      )
      expect(ack).toBeDefined()
      expect((ack![1] as any).correlationId).toBe('stop-3')
      expect((ack![1] as any).data).toMatchObject({ success: true, alreadyStopped: true })
    })
  })
})
