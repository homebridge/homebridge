import type { MockInstance } from 'vitest'

import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { HAPStorage } from '@homebridge/hap-nodejs'
import fs from 'fs-extra'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { PluginType } from './api.js'
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

      it('returns true when bridge.hap is explicitly true', () => {
        expect(Server.isHapEnabled({ ...mockConfig.bridge, hap: true } as any)).toBe(true)
      })

      it('returns false when bridge.hap is explicitly false', () => {
        expect(Server.isHapEnabled({ ...mockConfig.bridge, hap: false } as any)).toBe(false)
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
        bridge: { ...mockConfig.bridge, hap: false },
      })

      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      expect(server).toBeInstanceOf(Server)
    })

    it('accepts hap:false when matter is configured', async () => {
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, hap: false, matter: { port: 5540 } },
      })

      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      expect(server).toBeInstanceOf(Server)
    })

    it('accepts hap:true with no matter (the historical default)', async () => {
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, hap: true },
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
        bridge: { ...mockConfig.bridge, hap: true, matter: { port: 5540 } },
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
      // No `matter` block and `hap: false` means neither protocol is enabled —
      // this is now allowed; the child bridge simply advertises nothing.
      const server = makeServer()
      expect(() => (server as any).validateChildBridgeConfig(PluginType.PLATFORM, 'homebridge-example', {
        username: childUsername,
        hap: false,
      })).not.toThrow()
    })

    it('accepts an accessory child bridge with HAP disabled (no Matter alternative)', () => {
      const server = makeServer()
      expect(() => (server as any).validateChildBridgeConfig(PluginType.ACCESSORY, 'homebridge-example', {
        username: childUsername,
        hap: false,
      })).not.toThrow()
    })

    it('still rejects a child bridge with an invalid username', () => {
      // Surrounding validation must remain intact after dropping the protocol check.
      const server = makeServer()
      expect(() => (server as any).validateChildBridgeConfig(PluginType.PLATFORM, 'homebridge-example', {
        username: 'not-a-mac',
        hap: false,
      })).toThrow(/not a valid username/i)
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
})
