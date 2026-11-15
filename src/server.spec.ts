import type { MockInstance } from 'vitest'

import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { HAPStorage } from '@homebridge/hap-nodejs'
import fs from 'fs-extra'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { PluginType } from './api.js'
import { Logger } from './logger.js'
import { PluginManager } from './pluginManager.js'
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

  describe('public HAP enablement during plugin initialization', () => {
    afterEach(async () => {
      vi.restoreAllMocks()
      await fs.writeJson(configPath, mockConfig)
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
    ])('reports $expected for bridge.hap=$hap before plugins initialize', async ({ hap, expected, externalsOnly }) => {
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, hap, disableIpc: true },
      })
      const server = new Server({ hideQRCode: true })
      const stop = new Error('Stop after observing plugin initialization')
      const initialize = vi.spyOn(PluginManager.prototype, 'initializeInstalledPlugins').mockImplementation(async () => {
        expect((server as any).api.isHapEnabled()).toBe(expected)
        expect((server as any).api.isHapExternalsOnly()).toBe(externalsOnly)
        throw stop
      })

      // Stop before publishing so this lifecycle check needs no network sockets.
      await expect(server.start()).rejects.toBe(stop)
      expect(initialize).toHaveBeenCalledOnce()
    })
  })

  describe('public Matter enablement during plugin initialization', () => {
    afterEach(async () => {
      vi.restoreAllMocks()
      await fs.writeJson(configPath, mockConfig)
    })

    const childWithMatter = {
      platform: 'Example',
      _bridge: { username: '0E:DC:5D:BE:D6:75', matter: {} },
    }

    it.each([
      {
        matter: undefined,
        platforms: [],
        expected: false,
        externalsOnly: false,
      },
      {
        matter: {},
        platforms: [],
        expected: true,
        externalsOnly: false,
      },
      {
        matter: { externalsOnly: true },
        platforms: [],
        expected: true,
        externalsOnly: true,
      },
      {
        matter: { enabled: false },
        platforms: [childWithMatter],
        expected: false,
        externalsOnly: false,
      },
      // A child bridge's Matter runs in its own process, so it must not turn
      // Matter on for plugins on the main bridge
      {
        matter: undefined,
        platforms: [childWithMatter],
        expected: false,
        externalsOnly: false,
      },
    ])('reports $expected for bridge.matter=$matter with $platforms.length Matter child bridge(s)', async ({ matter, platforms, expected, externalsOnly }) => {
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, matter, disableIpc: true },
        platforms,
      })
      const server = new Server({ hideQRCode: true })
      const stop = new Error('Stop after observing plugin initialization')
      const initialize = vi.spyOn(PluginManager.prototype, 'initializeInstalledPlugins').mockImplementation(async () => {
        expect((server as any).api.isMatterEnabled()).toBe(expected)
        expect((server as any).api.isMatterExternalsOnly()).toBe(externalsOnly)
        expect((server as any).api.matter !== undefined).toBe(expected)
        throw stop
      })

      await expect(server.start()).rejects.toBe(stop)
      expect(initialize).toHaveBeenCalledOnce()
    })
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
        expect(Server.isHapEnabled({
          ...mockConfig.bridge,
          hap: { enabled: true },
        } as any)).toBe(true)
      })

      it('returns false when bridge.hap.enabled is explicitly false', () => {
        expect(Server.isHapEnabled({
          ...mockConfig.bridge,
          hap: { enabled: false },
        } as any)).toBe(false)
      })

      it('returns false when externalsOnly is set (bridge does not publish itself)', () => {
        expect(Server.isHapEnabled({
          ...mockConfig.bridge,
          hap: { enabled: false, externalsOnly: true },
        } as any)).toBe(false)
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
        expect(Server.isMatterEnabledForBridge({
          ...mockConfig.bridge,
          matter: { port: 5540, name: 'Test' },
        } as any)).toBe(true)
      })

      it('returns false when bridge.matter is configured but explicitly disabled', () => {
        expect(Server.isMatterEnabledForBridge({
          ...mockConfig.bridge,
          matter: { port: 5540, enabled: false },
        } as any)).toBe(false)
      })

      it('returns true when bridge.matter.enabled is explicitly true', () => {
        expect(Server.isMatterEnabledForBridge({
          ...mockConfig.bridge,
          matter: { port: 5540, enabled: true },
        } as any)).toBe(true)
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
        bridge: {
          ...mockConfig.bridge,
          hap: { enabled: false },
        },
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
        bridge: {
          ...mockConfig.bridge,
          hap: { enabled: false },
          matter: { port: 5540 },
        },
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
        bridge: {
          ...mockConfig.bridge,
          hap: { enabled: true },
        },
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
        bridge: {
          ...mockConfig.bridge,
          hap: { enabled: true },
          matter: { port: 5540 },
        },
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

    it('accepts a config.json that starts with a UTF-8 byte order mark', async () => {
      await fs.writeFile(configPath, `\uFEFF${JSON.stringify(mockConfig, null, 2)}`)

      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })

      expect(server).toBeInstanceOf(Server)
      expect((server as any).config.bridge.name).toBe('Homebridge')
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

    it('rejects a main bridge pin that is not a text with an error that names the pin', async () => {
      // a pin written without quotes; this was a TypeError from inside HAP-NodeJS at publish time
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, pin: 3145154 as unknown as string },
      })

      expect(() => new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })).toThrow(/not a valid pin in bridge\.pin/i)
    })

    it.each([
      { pin: '03145154', warning: /not in the form "031-45-154"/ },
      { pin: '031-45-15', warning: /not in the form "031-45-154"/ },
      { pin: '123-45-678', warning: /HomeKit refuses/ },
      { pin: '111-11-111', warning: /HomeKit refuses/ },
    ])('warns about the main bridge pin $pin, and still starts', async ({ pin, warning }) => {
      const warnings = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, pin },
      })

      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })

      expect((server as any).config.bridge.pin).toBe(pin)
      expect(warnings.mock.calls.flat().join(' ')).toMatch(warning)
    })

    it('gives no warning for a good main bridge pin', async () => {
      const warnings = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})

      // eslint-disable-next-line no-new
      new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })

      expect(warnings).not.toHaveBeenCalled()
    })

    it.each([
      {
        ports: { start: '52100', end: '52110' },
        expected: { start: 52100, end: 52110 },
        what: 'numbers written as texts',
      },
      {
        ports: { start: 52100, end: 52110 },
        expected: { start: 52100, end: 52110 },
        what: 'numbers',
      },
      {
        ports: { start: 52100.5, end: 52110 },
        expected: undefined,
        what: 'a number that is not whole',
      },
      {
        ports: { start: -5, end: 52110 },
        expected: undefined,
        what: 'a negative number',
      },
      {
        ports: { start: 52100, end: 70000 },
        expected: undefined,
        what: 'a number above 65535',
      },
      {
        ports: { start: 'abc', end: 'def' },
        expected: undefined,
        what: 'texts that are not numbers',
      },
      {
        ports: { start: 52110, end: 52100 },
        expected: undefined,
        what: 'an end before the start',
      },
      { ports: null, expected: undefined, what: 'null' },
    ])('reads a ports range of $what as $expected', async ({ ports, expected }) => {
      vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
      await fs.writeJson(configPath, { ...mockConfig, ports })

      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })

      expect((server as any).config.ports).toEqual(expected)
    })

    it('hands out numbers, one apart, from a ports range written as texts', async () => {
      await fs.writeJson(configPath, {
        ...mockConfig,
        ports: { start: '52100', end: '52110' },
      })

      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      const portService = (server as any).externalPortService

      expect([
        await portService.requestPort('AA:AA:AA:AA:AA:01'),
        await portService.requestPort('AA:AA:AA:AA:AA:02'),
        await portService.requestPort('AA:AA:AA:AA:AA:03'),
      ]).toEqual([52100, 52101, 52102])
    })

    it.each([
      { port: '51826', expected: 51826 },
      { port: 51826, expected: 51826 },
      { port: 0, expected: 0 },
      { port: 70000, expected: undefined },
      { port: 518.26, expected: undefined },
      { port: 'http', expected: undefined },
    ])('reads a bridge port of $port as $expected', async ({ port, expected }) => {
      const errors = vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, port },
      })

      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })

      expect((server as any).config.bridge.port).toBe(expected)
      expect(errors.mock.calls.flat().join(' ').includes('bridge.port')).toBe(expected === undefined)
    })

    it('accepts main bridge with externalsOnly: true + enabled: false (canonical form)', async () => {
      await fs.writeJson(configPath, {
        ...mockConfig,
        bridge: {
          ...mockConfig.bridge,
          hap: { enabled: false, externalsOnly: true },
        },
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
        bridge: {
          ...mockConfig.bridge,
          hap: { externalsOnly: true },
        },
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
        bridge: {
          ...mockConfig.bridge,
          hap: { enabled: true, externalsOnly: true },
        },
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
        bridge: {
          ...mockConfig.bridge,
          hap: false as unknown as object,
          matter: { port: 5540 },
        },
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

    // The friendly "Missing required field" error lives in the validator, but
    // the loaders used to upper-case the username before calling it, and
    // crashed start-up on a block that had none.
    it.each([
      { _bridge: {}, what: 'no username' },
      {
        _bridge: { username: 123456 },
        what: 'a number as username',
      },
      { _bridge: true, what: 'true instead of an object' },
    ])('skips a plugin block whose _bridge has $what, without throwing', ({ _bridge }) => {
      const server = makeServer() as any
      const errors = vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
      vi.spyOn(Logger.internal, 'info').mockImplementation(() => {})
      const plugin = {
        disabled: false,
        getPluginIdentifier: () => 'homebridge-example',
        getPlatformConstructor: () => class {},
        getAccessoryConstructor: () => class {},
      }
      server.pluginManager.getPluginForPlatform = () => plugin
      server.pluginManager.getPluginForAccessory = () => plugin
      server.config.platforms = [
        { platform: 'Example', _bridge },
      ]
      server.config.accessories = [
        { accessory: 'Example', name: 'Example', _bridge },
      ]

      expect(() => server.loadPlatforms()).not.toThrow()
      expect(() => server.loadAccessories()).not.toThrow()

      expect(server.childBridges.size).toBe(0)
      expect(errors.mock.calls.flat().join(' ')).toMatch(/_bridge\.username/)
    })

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
      const bridgeConfig: any = {
        username: '0e:11:22:33:44:55',
        hap: { enabled: false },
      }
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

    it('rejects a child bridge pin that is not a text with an error that names the pin', () => {
      const server = makeServer()
      expect(() => (server as any).validateChildBridgeConfig(PluginType.PLATFORM, 'homebridge-example', {
        username: childUsername,
        pin: 3145154,
      })).toThrow(/not a valid pin in _bridge\.pin/i)
    })

    it('warns about a child bridge pin in the wrong form, and accepts a child bridge with no pin', () => {
      const server = makeServer()
      const warnings = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})

      ;(server as any).validateChildBridgeConfig(PluginType.PLATFORM, 'homebridge-example', { username: childUsername })
      expect(warnings).not.toHaveBeenCalled()

      ;(server as any).validateChildBridgeConfig(PluginType.PLATFORM, 'homebridge-example', {
        username: childUsername,
        pin: '03145154',
      })
      expect(warnings.mock.calls.flat().join(' ')).toMatch(/_bridge\.pin is not in the form/)
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
      const cfg: any = {
        username: childUsername,
        hap: { externalsOnly: true },
      }
      expect(() => (server as any).validateChildBridgeConfig(PluginType.PLATFORM, 'homebridge-example', cfg)).not.toThrow()
      expect(cfg.hap.enabled).toBe(false) // normalised to canonical form
    })

    it('honours a platform child bridge with externalsOnly: true + enabled: true — flips enabled to false', () => {
      const server = makeServer()
      const cfg: any = {
        username: childUsername,
        hap: { enabled: true, externalsOnly: true },
      }
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
        getMetadata: () => ({
          matterConfig: { enabled: false },
        }),
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
        getMetadata: () => ({
          matterConfig: { enabled: false, externalsOnly: true },
        }),
        getMatterAccessoryInfo: vi.fn(),
      }
      ;(server as any).childBridges.set('CC:00:00:00:00:03', externalsOnlyChild)

      const uuid = 'externals-only-uuid'
      ;(server as any).handleGetMatterAccessoryInfo(uuid)

      expect(externalsOnlyChild.getMatterAccessoryInfo).toHaveBeenCalledWith(uuid, undefined)
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

    // The UI parks each lookup under a correlationId and drops any event that
    // does not carry it. No reply echoed it, so every lookup sat through a 10s
    // wait, a retry, another 10s wait, then an error.
    describe('echoes the request correlationId', () => {
      function infoEvents(sendSpy: ReturnType<typeof vi.spyOn>) {
        return (sendSpy.mock.calls as [string, any][])
          .filter(([id, payload]) => id === 'matterEvent' && payload?.type === 'accessoryInfoData')
          .map(([, payload]) => payload)
      }

      function makeServer() {
        const server = new Server({
          customStoragePath: homebridgeStorageFolder,
          hideQRCode: true,
        })
        const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})
        return { server, sendSpy }
      }

      it('when the uuid is missing', () => {
        const { server, sendSpy } = makeServer()
        ;(server as any).handleGetMatterAccessoryInfo(undefined, 'corr-info-1')
        expect(infoEvents(sendSpy)).toEqual([
          {
            type: 'accessoryInfoData',
            correlationId: 'corr-info-1',
            data: { error: 'UUID is required' },
          },
        ])
      })

      it('when the main bridge has the accessory', () => {
        const { server, sendSpy } = makeServer()
        ;(server as any).matterManager = {
          getAccessoryInfo: () => ({ uuid: 'main-uuid', displayName: 'Lamp' }),
        }
        ;(server as any).handleGetMatterAccessoryInfo('main-uuid', 'corr-info-2')
        expect(infoEvents(sendSpy)).toEqual([
          {
            type: 'accessoryInfoData',
            correlationId: 'corr-info-2',
            data: { uuid: 'main-uuid', displayName: 'Lamp' },
          },
        ])
      })

      it('when the main bridge lookup throws', () => {
        const { server, sendSpy } = makeServer()
        ;(server as any).matterManager = {
          getAccessoryInfo: () => {
            throw new Error('boom')
          },
        }
        ;(server as any).handleGetMatterAccessoryInfo('main-uuid', 'corr-info-3')
        expect(infoEvents(sendSpy)).toEqual([
          {
            type: 'accessoryInfoData',
            correlationId: 'corr-info-3',
            data: { error: 'boom' },
          },
        ])
      })

      it('when no bridge can be asked', () => {
        const { server, sendSpy } = makeServer()
        ;(server as any).handleGetMatterAccessoryInfo('nobody-uuid', 'corr-info-4')
        expect(infoEvents(sendSpy)).toHaveLength(1)
        expect(infoEvents(sendSpy)[0].correlationId).toBe('corr-info-4')
      })

      it('to the child bridges, and on the timed-out reply when none of them answers', () => {
        vi.useFakeTimers()
        try {
          const { server, sendSpy } = makeServer()
          const child = {
            getMetadata: () => ({ matterConfig: {} }),
            getMatterAccessoryInfo: vi.fn(),
          }
          ;(server as any).childBridges.set('CC:00:00:00:00:0A', child)

          ;(server as any).handleGetMatterAccessoryInfo('child-uuid', 'corr-info-5')
          expect(child.getMatterAccessoryInfo).toHaveBeenCalledWith('child-uuid', 'corr-info-5')
          expect(infoEvents(sendSpy)).toHaveLength(0)

          vi.advanceTimersByTime(2000)
          expect(infoEvents(sendSpy)).toHaveLength(1)
          expect(infoEvents(sendSpy)[0]).toMatchObject({
            correlationId: 'corr-info-5',
            data: { uuid: 'child-uuid', timedOut: true },
          })
        } finally {
          vi.useRealTimers()
        }
      })

      it('keeps one fallback per request, so two lookups of one accessory do not cancel each other', () => {
        vi.useFakeTimers()
        try {
          const { server, sendSpy } = makeServer()
          const child = {
            getMetadata: () => ({ matterConfig: {} }),
            getMatterAccessoryInfo: vi.fn(),
          }
          ;(server as any).childBridges.set('CC:00:00:00:00:0B', child)

          ;(server as any).handleGetMatterAccessoryInfo('child-uuid', 'corr-a')
          ;(server as any).handleGetMatterAccessoryInfo('child-uuid', 'corr-b')
          // The child answers request a only.
          ;(server as any).cancelPendingMatterAccessoryInfoLookup('child-uuid', 'corr-a')

          vi.advanceTimersByTime(2000)
          expect(infoEvents(sendSpy).map(event => event.correlationId)).toEqual(['corr-b'])
        } finally {
          vi.useRealTimers()
        }
      })
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
      ;(server as any).bridgeService = {
        teardown: () => {},
      }
      ;(server as any).ipcService = {
        stop: () => {},
        sendMessage: () => {},
      }

      await server.teardown()

      expect((server as any).pendingMatterAccessoryInfoLookups.size).toBe(0)
    })
  })

  describe('handleGetMatterAccessories (which child bridges are asked)', () => {
    const childA = 'CC:00:00:00:00:A1'
    const childB = 'CC:00:00:00:00:B1'

    function serverWithTwoChildren() {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})
      ;(server as any).matterMonitoringActive = true
      const children = [childA, childB].map((username) => {
        const child = {
          getMetadata: () => ({ username }),
          requestMatterAccessories: vi.fn().mockResolvedValue({
            bridgeUsername: username,
            accessories: [
              { uuid: `acc-${username}` },
            ],
          }),
        }
        ;(server as any).childBridges.set(username, child)
        return child
      })
      const listed = () => {
        const event = (sendSpy.mock.calls as [string, any][]).find(([, payload]) => payload?.type === 'accessoriesData')
        return event?.[1].data.accessories.map((accessory: { uuid: string }) => accessory.uuid)
      }
      return { server, children, listed }
    }

    it('asks every child bridge when the request names no bridge', async () => {
      const { server, children, listed } = serverWithTwoChildren()

      await (server as any).handleGetMatterAccessories({ correlationId: 'corr-list' })

      expect(children[0].requestMatterAccessories).toHaveBeenCalledTimes(1)
      expect(children[1].requestMatterAccessories).toHaveBeenCalledTimes(1)
      expect(listed()).toEqual([`acc-${childA}`, `acc-${childB}`])
    })

    // The filter was applied to the main bridge only: every child bridge was
    // still asked, and every answer added to the list.
    it('asks only the child bridge the request names', async () => {
      const { server, children, listed } = serverWithTwoChildren()

      await (server as any).handleGetMatterAccessories({
        bridgeUsername: childB.toLowerCase(),
        correlationId: 'corr-list',
      })

      expect(children[0].requestMatterAccessories).not.toHaveBeenCalled()
      expect(children[1].requestMatterAccessories).toHaveBeenCalledTimes(1)
      expect(listed()).toEqual([`acc-${childB}`])
    })

    it('asks no child bridge when the request names the main bridge', async () => {
      const { server, children, listed } = serverWithTwoChildren()

      await (server as any).handleGetMatterAccessories({ bridgeUsername: (server as any).config.bridge.username, correlationId: 'corr-list' })

      expect(children[0].requestMatterAccessories).not.toHaveBeenCalled()
      expect(children[1].requestMatterAccessories).not.toHaveBeenCalled()
      expect(listed()).toEqual([])
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
        getMetadata: () => ({
          matterConfig: { enabled: false },
        }),
        controlMatterAccessory: vi.fn(),
      }
      ;(server as any).childBridges.set('CC:00:00:00:00:04', disabledChild)

      await (server as any).handleMatterAccessoryControl({
        uuid: 'ctrl-uuid',
        cluster: 'OnOff',
        attributes: { on: true },
      })

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
        getMetadata: () => ({
          matterConfig: { enabled: false, externalsOnly: true },
        }),
        controlMatterAccessory: vi.fn(),
      }
      ;(server as any).childBridges.set('CC:00:00:00:00:05', activeChild)

      await (server as any).handleMatterAccessoryControl({
        uuid: 'ctrl-uuid',
        cluster: 'OnOff',
        attributes: { on: true },
      })

      expect(activeChild.controlMatterAccessory).toHaveBeenCalledWith(
        expect.objectContaining({ uuid: 'ctrl-uuid' }),
      )
    })

    it('echoes the request correlationId on its own control responses', async () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})

      // The UI parks each control request under a correlationId and its
      // dispatcher drops events without one. A response that fails to echo it
      // sat through a 10s timeout, was retried (running the command a second
      // time), and was then reported as failed even when the control worked.
      await (server as any).handleMatterAccessoryControl({
        uuid: 'ctrl-uuid',
        cluster: 'OnOff',
        attributes: { on: true },
        correlationId: 'ctrl-corr-1',
      })

      const response = sendSpy.mock.calls.find(([id, payload]) =>
        id === 'matterEvent' && (payload as any)?.type === 'accessoryControlResponse',
      )
      expect(response).toBeDefined()
      expect((response![1] as any).correlationId).toBe('ctrl-corr-1')
    })

    // handleMatterAccessoryControl answers from ten different places, and the UI
    // drops any response without the correlationId - so pinning only the happy
    // path would leave every failure route free to regress back into a 10s
    // timeout, a retry, and a false "failed" in the UI.
    it.each([
      [
        'the request is missing required parameters',
        {},
        'Missing required parameters',
      ],
      [
        'the named bridge does not exist',
        {
          uuid: 'ctrl-uuid',
          cluster: 'OnOff',
          attributes: { on: true },
          bridgeUsername: 'DD:00:00:00:00:99',
        },
        'Bridge DD:00:00:00:00:99 not found',
      ],
      [
        'no bridge anywhere owns the accessory',
        {
          uuid: 'ctrl-uuid',
          cluster: 'OnOff',
          attributes: { on: true },
        },
        'Accessory not found',
      ],
    ])('echoes the correlationId when %s', async (_reason, request, expectedError) => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})

      await (server as any).handleMatterAccessoryControl({ ...request, correlationId: 'corr-fail' })

      const response = sendSpy.mock.calls.find(([id, payload]) =>
        id === 'matterEvent'
        && (payload as any)?.type === 'accessoryControlResponse'
        && (payload as any)?.data?.error === expectedError,
      )
      expect(response).toBeDefined()
      expect((response![1] as any).correlationId).toBe('corr-fail')
    })

    it.each([
      ['succeeds', true],
      ['fails', false],
    ])('echoes the correlationId when the main bridge %s', async (_outcome, succeeds) => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})
      vi.spyOn(server as any, 'handleTriggerMatterCommand').mockImplementation(() =>
        succeeds
          ? Promise.resolve()
          : Promise.reject(new Error('cluster rejected')),
      )

      await (server as any).handleMatterAccessoryControl({
        uuid: 'ctrl-uuid',
        cluster: 'OnOff',
        attributes: { on: true },
        // routes straight to the main bridge rather than the auto-discovery path
        bridgeUsername: (server as any).config.bridge.username,
        correlationId: 'corr-main',
      })

      const response = sendSpy.mock.calls.find(([id, payload]) =>
        id === 'matterEvent' && (payload as any)?.type === 'accessoryControlResponse',
      )
      expect(response).toBeDefined()
      expect((response![1] as any).correlationId).toBe('corr-main')
      expect((response![1] as any).data.success).toBe(succeeds)
    })

    it('passes the correlationId through to the child bridge it forwards to', async () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})

      const activeChild = {
        getMetadata: () => ({
          matterConfig: { enabled: true },
        }),
        controlMatterAccessory: vi.fn(),
      }
      ;(server as any).childBridges.set('CC:00:00:00:00:06', activeChild)

      // The child's message handler echoes the correlationId on its response,
      // so it has to arrive there in the first place
      await (server as any).handleMatterAccessoryControl({
        uuid: 'ctrl-uuid',
        cluster: 'OnOff',
        attributes: { on: true },
        correlationId: 'ctrl-corr-2',
      })

      expect(activeChild.controlMatterAccessory).toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: 'ctrl-corr-2' }),
      )
    })

    // With no bridge named, the main bridge is tried first. Every error from it
    // used to mean "not mine, ask the child bridges": a handler that threw on
    // the main bridge's own accessory left no log line, and the UI was told
    // "Accessory not found" two seconds later.
    describe('a request that names no bridge', () => {
      function serverWithMainManager(handleTriggerCommand: () => Promise<void>) {
        const server = new Server({
          customStoragePath: homebridgeStorageFolder,
          hideQRCode: true,
        })
        const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})
        ;(server as any).matterManager = {
          handleTriggerCommand: vi.fn(handleTriggerCommand),
        }
        const child = {
          getMetadata: () => ({
            matterConfig: { enabled: true },
          }),
          controlMatterAccessory: vi.fn(() => true),
        }
        ;(server as any).childBridges.set('CC:00:00:00:00:09', child)
        return { server, sendSpy, child }
      }

      const request = {
        uuid: 'main-uuid',
        cluster: 'OnOff',
        attributes: { on: true },
        correlationId: 'corr-broadcast',
      }

      it('reports a real failure on the main bridge, and does not ask the child bridges', async () => {
        const { server, sendSpy, child } = serverWithMainManager(() => Promise.reject(new Error('plugin handler threw')))
        const errorSpy = vi.spyOn(Logger.withPrefix('Matter/MainManager'), 'error')

        await (server as any).handleMatterAccessoryControl(request)

        expect(child.controlMatterAccessory).not.toHaveBeenCalled()
        expect((server as any).pendingMatterControlRequests.size).toBe(0)
        const responses = (sendSpy.mock.calls as [string, any][]).filter(([, payload]) => payload?.type === 'accessoryControlResponse')
        expect(responses.map(([, payload]) => payload)).toEqual([
          {
            type: 'accessoryControlResponse',
            correlationId: 'corr-broadcast',
            data: { success: false, error: 'plugin handler threw', uuid: 'main-uuid' },
          },
        ])
        expect(errorSpy.mock.calls.some(([msg]) => typeof msg === 'string' && msg.includes('plugin handler threw'))).toBe(true)
        errorSpy.mockRestore()
      })

      it('still asks the child bridges when the main bridge does not have the accessory', async () => {
        const { MatterAccessoryNotOnBridgeError } = await import('./matter/MatterError.js')
        const { server, sendSpy, child } = serverWithMainManager(() => Promise.reject(new MatterAccessoryNotOnBridgeError('main-uuid')))

        await (server as any).handleMatterAccessoryControl(request)

        expect(child.controlMatterAccessory).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'main-uuid' }))
        expect((sendSpy.mock.calls as [string, any][]).filter(([, payload]) => payload?.type === 'accessoryControlResponse')).toHaveLength(0)
        clearTimeout((server as any).pendingMatterControlRequests.get('corr-broadcast'))
      })
    })

    // The UI names the bridge whenever it knows the accessory, so this is the
    // normal path. A child that is not running dropped the request, and a child
    // that does not own the accessory stays silent: either way nothing came
    // back, and the UI waited 10s, sent the command again, then showed a failure.
    describe('a request that names one child bridge', () => {
      const childUsername = 'CC:00:00:00:00:08'

      function serverWithNamedChild(sent: boolean) {
        const server = new Server({
          customStoragePath: homebridgeStorageFolder,
          hideQRCode: true,
        })
        const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})
        const child = {
          identifier: 'TestPlatform',
          getMetadata: () => ({
            username: childUsername,
            matterConfig: { enabled: true },
          }),
          controlMatterAccessory: vi.fn(() => sent),
        }
        ;(server as any).childBridges.set(childUsername, child)
        return { server, sendSpy, child }
      }

      function controlResponses(sendSpy: ReturnType<typeof vi.spyOn>) {
        return (sendSpy.mock.calls as [string, any][])
          .filter(([id, payload]) => id === 'matterEvent' && payload?.type === 'accessoryControlResponse')
          .map(([, payload]) => payload)
      }

      const request = {
        uuid: 'named-uuid',
        cluster: 'OnOff',
        attributes: { on: true },
        bridgeUsername: childUsername.toLowerCase(),
        correlationId: 'corr-named',
      }

      it('answers at once when the child process is not running', async () => {
        const { server, sendSpy, child } = serverWithNamedChild(false)

        await (server as any).handleMatterAccessoryControl(request)

        expect(child.controlMatterAccessory).toHaveBeenCalledTimes(1)
        expect(controlResponses(sendSpy)).toEqual([
          {
            type: 'accessoryControlResponse',
            correlationId: 'corr-named',
            data: { success: false, error: 'Child bridge is not running', uuid: 'named-uuid' },
          },
        ])
        expect((server as any).pendingMatterControlRequests.size).toBe(0)
      })

      it('answers after two seconds when the running child stays silent', async () => {
        vi.useFakeTimers()
        try {
          const { server, sendSpy } = serverWithNamedChild(true)

          await (server as any).handleMatterAccessoryControl(request)
          expect(controlResponses(sendSpy)).toHaveLength(0)

          vi.advanceTimersByTime(2000)
          expect(controlResponses(sendSpy)).toEqual([
            {
              type: 'accessoryControlResponse',
              correlationId: 'corr-named',
              data: { success: false, error: 'Accessory not found', uuid: 'named-uuid' },
            },
          ])
        } finally {
          vi.useRealTimers()
        }
      })

      it('stays quiet when the child does answer', async () => {
        vi.useFakeTimers()
        try {
          const { server, sendSpy } = serverWithNamedChild(true)

          await (server as any).handleMatterAccessoryControl(request)
          ;(server as any).cancelPendingMatterControlRequest('corr-named')
          vi.advanceTimersByTime(5000)

          expect(controlResponses(sendSpy)).toHaveLength(0)
        } finally {
          vi.useRealTimers()
        }
      })

      it('answers at once for an external accessory whose owning child is not running', async () => {
        const { server, sendSpy, child } = serverWithNamedChild(false)
        server.registerExternalMatterBridge('EE:00:00:00:00:01', childUsername)

        await (server as any).handleMatterAccessoryControl({ ...request, bridgeUsername: 'EE:00:00:00:00:01' })

        expect(child.controlMatterAccessory).toHaveBeenCalledTimes(1)
        expect(controlResponses(sendSpy)).toHaveLength(1)
        expect(controlResponses(sendSpy)[0].data.error).toBe('Child bridge is not running')
      })
    })

    // The broadcast asks every Matter child and only the owner answers - a child
    // that does not have the accessory returns silently. So when no child owns
    // it nothing came back at all, and the UI sat through its own 10s timeout,
    // retried, then reported a failure. Same fallback shape as accessoryInfoData.
    describe('no child claims the accessory', () => {
      function serverWithMatterChild() {
        const server = new Server({
          customStoragePath: homebridgeStorageFolder,
          hideQRCode: true,
        })
        const sendSpy = vi.spyOn((server as any).ipcService, 'sendMessage').mockImplementation(() => {})
        ;(server as any).childBridges.set('CC:00:00:00:00:07', {
          getMetadata: () => ({
            matterConfig: { enabled: true },
          }),
          controlMatterAccessory: vi.fn(),
        })
        return { server, sendSpy }
      }

      function notFoundResponses(sendSpy: ReturnType<typeof vi.spyOn>) {
        interface MatterEventPayload { type?: string, data?: { error?: string } }
        return (sendSpy.mock.calls as [string, MatterEventPayload][]).filter(([id, payload]) =>
          id === 'matterEvent'
          && payload?.type === 'accessoryControlResponse'
          && payload?.data?.error === 'Accessory not found',
        )
      }

      it('answers the ui instead of leaving it to time out', async () => {
        vi.useFakeTimers()
        try {
          const { server, sendSpy } = serverWithMatterChild()

          await (server as any).handleMatterAccessoryControl({
            uuid: 'orphan-uuid',
            cluster: 'OnOff',
            attributes: { on: true },
            correlationId: 'corr-orphan',
          })

          expect(notFoundResponses(sendSpy)).toHaveLength(0)
          vi.advanceTimersByTime(2000)

          const responses = notFoundResponses(sendSpy)
          expect(responses).toHaveLength(1)
          expect((responses[0][1] as any).correlationId).toBe('corr-orphan')
        } finally {
          vi.useRealTimers()
        }
      })

      it('stays quiet when the owning child does answer', async () => {
        vi.useFakeTimers()
        try {
          const { server, sendSpy } = serverWithMatterChild()

          await (server as any).handleMatterAccessoryControl({
            uuid: 'owned-uuid',
            cluster: 'OnOff',
            attributes: { on: true },
            correlationId: 'corr-owned',
          })

          // what ChildBridgeService.onAccessoryControlResponse does when the
          // owning child forwards its response
          ;(server as any).cancelPendingMatterControlRequest('corr-owned')
          vi.advanceTimersByTime(5000)

          expect(notFoundResponses(sendSpy)).toHaveLength(0)
        } finally {
          vi.useRealTimers()
        }
      })

      it('arms nothing without a correlationId, since the ui would drop the response anyway', async () => {
        vi.useFakeTimers()
        try {
          const { server, sendSpy } = serverWithMatterChild()

          await (server as any).handleMatterAccessoryControl({
            uuid: 'orphan-uuid',
            cluster: 'OnOff',
            attributes: { on: true },
          })
          vi.advanceTimersByTime(5000)

          expect(notFoundResponses(sendSpy)).toHaveLength(0)
        } finally {
          vi.useRealTimers()
        }
      })
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

  describe('publishBridge when the publish failed early', () => {
    it('does not throw for the missing setup payload, and prints no setup code', () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      })
      // publish() rejected before it stored anything on the bridge; the bridge service only logs that
      vi.spyOn((server as any).bridgeService, 'publishBridge').mockImplementation(() => {})
      const errors = vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
      consoleLogSpy.mockClear()

      expect(() => (server as any).publishBridge()).not.toThrow()

      expect(errors.mock.calls.flat().join(' ')).toMatch(/was not published/)
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })
  })

  describe('printSetupInfo (QR error level hoisted to module load)', () => {
    it('does not call qrcode.setErrorLevel from printSetupInfo (already set at module load)', async () => {
      const qrcodeModule = await import('qrcode-terminal')
      const qrcode = (qrcodeModule as any).default ?? qrcodeModule
      const setErrorLevelSpy = vi.spyOn(qrcode, 'setErrorLevel')
      const generateSpy = vi.spyOn(qrcode, 'generate').mockImplementation(() => {})

      try {
        const server = new Server({
          customStoragePath: homebridgeStorageFolder,
          hideQRCode: false, // exercise the QR-code branch
        })
        // The bridge isn't published in this unit test, so stub setupURI to
        // bypass the "not published" guard inside HAP-NodeJS.
        const bridge = (server as any).bridgeService.bridge
        vi.spyOn(bridge, 'setupURI').mockReturnValue('X-HM://0023ABCD-fake-setup-uri')

        // Reach into the private printSetupInfo via cast.
        ;(server as any).printSetupInfo('123-45-678')

        // setErrorLevel should not have been called by printSetupInfo —
        // the hoisted module-load call is what set it.
        expect(setErrorLevelSpy).not.toHaveBeenCalled()
        // But generate should have been invoked once.
        expect(generateSpy).toHaveBeenCalledTimes(1)
      } finally {
        setErrorLevelSpy.mockRestore()
        generateSpy.mockRestore()
      }
    })
  })
})
