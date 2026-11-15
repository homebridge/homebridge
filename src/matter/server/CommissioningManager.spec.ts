import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CommissioningManager } from './CommissioningManager.js'

// Mock dependencies
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
}))
vi.mock('@matter/types/schema', () => ({
  ManualPairingCodeCodec: {
    encode: vi.fn(() => '12345678901'),
  },
  QrPairingCodeCodec: {
    encode: vi.fn(() => 'MT:Y.K9042C00KA0648G00'),
  },
  QrCode: {
    get: vi.fn(() => '(QR code)'),
  },
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

const { readFile, rename, writeFile } = await import('node:fs/promises')
const mockedReadFile = vi.mocked(readFile)
const mockedWriteFile = vi.mocked(writeFile)
const mockedRename = vi.mocked(rename)
const { Logger } = await import('../../logger.js')
const mockedLog = vi.mocked(Logger.withPrefix('test'))

/** Everything written to the log at any level, as one text. */
function loggedText(): string {
  return [
    mockedLog.info,
    mockedLog.warn,
    mockedLog.error,
    mockedLog.debug,
  ]
    .flatMap(level => level.mock.calls)
    .flat()
    .join('\n')
}

describe('commissioningManager', () => {
  let manager: CommissioningManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new CommissioningManager()
  })

  describe('constructor', () => {
    it('should initialize with default vendor and product IDs', () => {
      expect(manager.vendorId).toBe(0xFFF1)
      expect(manager.productId).toBe(0x8001)
    })

    it('should initialize with zero passcode and discriminator', () => {
      expect(manager.passcode).toBe(0)
      expect(manager.discriminator).toBe(0)
    })
  })

  describe('isValidPasscode', () => {
    it('should reject passcodes below 1', () => {
      expect(manager.isValidPasscode(0)).toBe(false)
      expect(manager.isValidPasscode(-1)).toBe(false)
    })

    it('should reject passcodes above 99999998', () => {
      expect(manager.isValidPasscode(99999999)).toBe(false)
      expect(manager.isValidPasscode(100000000)).toBe(false)
    })

    it('should accept valid passcodes in range', () => {
      // Note: 1 → "00000001" fails because it has five '0's (>3 repeating)
      expect(manager.isValidPasscode(29384756)).toBe(true)
      expect(manager.isValidPasscode(50213467)).toBe(true)
      expect(manager.isValidPasscode(13579246)).toBe(true)
    })

    it('should reject ascending sequential patterns', () => {
      expect(manager.isValidPasscode(12345678)).toBe(false)
      expect(manager.isValidPasscode(23456789)).toBe(false)
    })

    it('should reject descending sequential patterns', () => {
      expect(manager.isValidPasscode(87654321)).toBe(false)
      expect(manager.isValidPasscode(76543210)).toBe(false)
    })

    it('should reject passcodes with more than 3 repeating digits', () => {
      // 11110000 has four '1's and four '0's
      expect(manager.isValidPasscode(11110000)).toBe(false)
      // 44440001 has four '4's
      expect(manager.isValidPasscode(44440001)).toBe(false)
    })

    it('should accept passcodes with exactly 3 repeating digits', () => {
      // 11123456 has three '1's — should be valid
      expect(manager.isValidPasscode(11123456)).toBe(true)
    })

    it('should accept non-sequential, non-repeating passcodes', () => {
      expect(manager.isValidPasscode(29384756)).toBe(true)
      expect(manager.isValidPasscode(13579246)).toBe(true)
    })
  })

  describe('generateSecurePasscode', () => {
    it('should generate a valid passcode', () => {
      const passcode = manager.generateSecurePasscode()
      expect(passcode).toBeGreaterThanOrEqual(1)
      expect(passcode).toBeLessThanOrEqual(99999998)
      expect(manager.isValidPasscode(passcode)).toBe(true)
    })

    it('should not generate invalid passcodes (all zeros, all same digit, etc.)', () => {
      const invalidPasscodes = [
        0,
        11111111,
        22222222,
        33333333,
        44444444,
        55555555,
        66666666,
        77777777,
        88888888,
        99999999,
      ]

      // Generate many passcodes and verify none are invalid
      for (let i = 0; i < 100; i++) {
        const passcode = manager.generateSecurePasscode()
        expect(invalidPasscodes).not.toContain(passcode)
      }
    })

    it('should generate different passcodes on repeated calls', () => {
      const passcodes = new Set<number>()
      for (let i = 0; i < 20; i++) {
        passcodes.add(manager.generateSecurePasscode())
      }
      // With 20 cryptographically random passcodes, we should get at least 2 unique values
      expect(passcodes.size).toBeGreaterThan(1)
    })
  })

  describe('generateRandomDiscriminator', () => {
    it('should generate a discriminator in the 12-bit range', () => {
      const discriminator = manager.generateRandomDiscriminator()
      expect(discriminator).toBeGreaterThanOrEqual(0)
      expect(discriminator).toBeLessThanOrEqual(4095)
    })

    it('should generate different discriminators on repeated calls', () => {
      const discriminators = new Set<number>()
      for (let i = 0; i < 20; i++) {
        discriminators.add(manager.generateRandomDiscriminator())
      }
      expect(discriminators.size).toBeGreaterThan(1)
    })
  })

  describe('loadOrGenerateCredentials', () => {
    it('should load existing credentials from file', async () => {
      const credentials = { passcode: 29384756, discriminator: 1234 }
      mockedReadFile.mockResolvedValue(JSON.stringify(credentials) as any)

      await manager.loadOrGenerateCredentials('/mock/storage')

      expect(manager.passcode).toBe(29384756)
      expect(manager.discriminator).toBe(1234)
      expect(mockedWriteFile).not.toHaveBeenCalled()
    })

    it('should load a valid zero discriminator', async () => {
      const credentials = { passcode: 29384756, discriminator: 0 }
      mockedReadFile.mockResolvedValue(JSON.stringify(credentials) as any)

      await manager.loadOrGenerateCredentials('/mock/storage')

      expect(manager.passcode).toBe(29384756)
      expect(manager.discriminator).toBe(0)
      expect(mockedWriteFile).not.toHaveBeenCalled()
    })

    it('should generate and save new credentials when file does not exist', async () => {
      mockedReadFile.mockRejectedValue(new Error('ENOENT'))
      mockedWriteFile.mockResolvedValue(undefined)

      await manager.loadOrGenerateCredentials('/mock/storage')

      expect(manager.passcode).toBeGreaterThanOrEqual(1)
      expect(manager.passcode).toBeLessThanOrEqual(99999998)
      expect(manager.discriminator).toBeGreaterThanOrEqual(0)
      expect(manager.discriminator).toBeLessThanOrEqual(4095)
      expect(mockedWriteFile).toHaveBeenCalledWith(
        '/mock/storage/credentials.json.tmp',
        expect.stringContaining('"passcode"'),
        { encoding: 'utf-8', mode: 0o600 },
      )
    })

    it('should generate new credentials when file contains invalid data', async () => {
      mockedReadFile.mockResolvedValue('not valid json' as any)
      mockedWriteFile.mockResolvedValue(undefined)

      await manager.loadOrGenerateCredentials('/mock/storage')

      expect(manager.passcode).toBeGreaterThanOrEqual(1)
      expect(mockedWriteFile).toHaveBeenCalled()
    })

    it('should generate new credentials when file has missing fields', async () => {
      mockedReadFile.mockResolvedValue(JSON.stringify({ passcode: 12345678 }) as any)
      mockedWriteFile.mockResolvedValue(undefined)

      await manager.loadOrGenerateCredentials('/mock/storage')

      // Should generate new because discriminator is missing
      expect(mockedWriteFile).toHaveBeenCalled()
    })

    it.each([
      [
        'an invalid passcode',
        { passcode: 12345678, discriminator: 1234 },
      ],
      [
        'a string passcode',
        { passcode: '29384756', discriminator: 1234 },
      ],
      [
        'a fractional passcode',
        { passcode: 29384756.5, discriminator: 1234 },
      ],
      [
        'a negative discriminator',
        { passcode: 29384756, discriminator: -1 },
      ],
      [
        'an oversized discriminator',
        { passcode: 29384756, discriminator: 4096 },
      ],
      [
        'a fractional discriminator',
        { passcode: 29384756, discriminator: 1.5 },
      ],
      [
        'a string discriminator',
        { passcode: 29384756, discriminator: '1234' },
      ],
    ])('should regenerate credentials containing %s', async (_description, credentials) => {
      mockedReadFile.mockResolvedValue(JSON.stringify(credentials) as any)
      mockedWriteFile.mockResolvedValue(undefined)
      vi.spyOn(manager, 'generateSecurePasscode').mockReturnValue(50213467)
      vi.spyOn(manager, 'generateRandomDiscriminator').mockReturnValue(432)

      await manager.loadOrGenerateCredentials('/mock/storage')

      expect(manager.passcode).toBe(50213467)
      expect(manager.discriminator).toBe(432)
      expect(mockedWriteFile).toHaveBeenCalled()
    })
  })

  describe('generateCommissioningInfo', () => {
    function depsFor(overrides: { commissioned?: boolean, hideQRCode?: boolean } = {}) {
      return {
        config: { hideQRCode: overrides.hideQRCode },
        matterStoragePath: '/mock/storage',
        serialNumber: 'SN-001',
        fabricManager: {
          isCommissioned: vi.fn(() => overrides.commissioned ?? false),
        },
      } as any
    }

    beforeEach(() => {
      manager.passcode = 34567890
      manager.discriminator = 1234
      mockedWriteFile.mockResolvedValue(undefined)
      mockedRename.mockResolvedValue(undefined)
    })

    it('shows the manual code and the qr code once, and never the bare passcode', async () => {
      await manager.generateCommissioningInfo(depsFor())

      const text = loggedText()
      expect(text.match(/1234-567-8901/g)).toHaveLength(1)
      expect(text).toContain('(QR code)')
      expect(text).not.toContain('34567890')
    })

    it('draws no qr code with the -Q flag, but still shows the manual code', async () => {
      await manager.generateCommissioningInfo(depsFor({ hideQRCode: true }))

      const text = loggedText()
      expect(text).toContain('1234-567-8901')
      expect(text).not.toContain('(QR code)')
    })

    it('shows no pairing codes for a bridge that is already paired', async () => {
      await manager.generateCommissioningInfo(depsFor({ commissioned: true }))

      const text = loggedText()
      expect(text).not.toContain('1234-567-8901')
      expect(text).not.toContain('(QR code)')
      expect(text).not.toContain('MT:')
      expect(text).not.toContain('34567890')
      // the codes are still kept for the ui
      expect(manager.commissioningInfo.manualPairingCode).toBe('1234-567-8901')
    })

    it('writes the file with the passcode for the homebridge user only, and swaps it into place', async () => {
      await manager.generateCommissioningInfo(depsFor())

      expect(mockedWriteFile).toHaveBeenCalledExactlyOnceWith('/mock/storage/commissioning.json.tmp', expect.stringContaining('"passcode": 34567890'), { encoding: 'utf-8', mode: 0o600 })
      expect(mockedRename).toHaveBeenCalledExactlyOnceWith('/mock/storage/commissioning.json.tmp', '/mock/storage/commissioning.json')
    })
  })

  describe('updateCommissioningFile', () => {
    it('should skip when matterStoragePath is not set', async () => {
      const deps = {
        matterStoragePath: undefined,
        serialNumber: 'SN-001',
        fabricManager: {
          getCommissioningSnapshot: vi.fn(() => ({ commissioned: false, fabricCount: 0, fabrics: [] })),
        },
      } as any

      await manager.updateCommissioningFile(deps)

      expect(mockedWriteFile).not.toHaveBeenCalled()
    })

    it('should write commissioning data to file', async () => {
      manager.commissioningInfo = { qrCode: 'MT:test', manualPairingCode: '1234-567-8901' }
      manager.passcode = 12345678
      manager.discriminator = 1234

      const deps = {
        matterStoragePath: '/mock/storage',
        serialNumber: 'SN-001',
        fabricManager: {
          getCommissioningSnapshot: vi.fn(() => ({
            commissioned: true,
            fabricCount: 1,
            fabrics: [
              { fabricId: 1 },
            ],
          })),
        },
      } as any

      mockedWriteFile.mockResolvedValue(undefined)

      await manager.updateCommissioningFile(deps)

      expect(mockedWriteFile).toHaveBeenCalledWith(
        '/mock/storage/commissioning.json.tmp',
        expect.stringContaining('"commissioned": true'),
        { encoding: 'utf-8', mode: 0o600 },
      )
    })

    it('should reuse a precomputed snapshot when provided', async () => {
      manager.commissioningInfo = { qrCode: 'MT:test', manualPairingCode: '1234-567-8901' }
      manager.passcode = 12345678
      manager.discriminator = 1234

      const getCommissioningSnapshot = vi.fn(() => ({ commissioned: false, fabricCount: 0, fabrics: [] }))
      const deps = {
        matterStoragePath: '/mock/storage',
        serialNumber: 'SN-001',
        fabricManager: { getCommissioningSnapshot },
      } as any

      mockedWriteFile.mockResolvedValue(undefined)

      const snapshot = {
        commissioned: true,
        fabricCount: 2,
        fabrics: [
          { fabricId: 1 },
          { fabricId: 2 },
        ],
      } as any
      await manager.updateCommissioningFile(deps, snapshot)

      expect(getCommissioningSnapshot).not.toHaveBeenCalled()
      expect(mockedWriteFile).toHaveBeenCalledWith(
        '/mock/storage/commissioning.json.tmp',
        expect.stringContaining('"fabricCount": 2'),
        { encoding: 'utf-8', mode: 0o600 },
      )
    })

    it('should handle write errors gracefully', async () => {
      const deps = {
        matterStoragePath: '/mock/storage',
        serialNumber: 'SN-001',
        fabricManager: {
          getCommissioningSnapshot: vi.fn(() => ({ commissioned: false, fabricCount: 0, fabrics: [] })),
        },
      } as any

      mockedWriteFile.mockRejectedValue(new Error('Permission denied'))

      // Should not throw
      await expect(manager.updateCommissioningFile(deps)).resolves.not.toThrow()
    })
  })

  describe('purgeSubscriptionsForFabric', () => {
    function serverNodeWith(subs: any[]) {
      const subscriptions = {
        state: { subscriptions: subs },
      }
      return {
        node: {
          act: async (cb: any) => cb({
            get: () => subscriptions,
          }),
        },
        subscriptions,
      }
    }

    it('removes only the persisted subscriptions of the deleted fabric', async () => {
      const { node, subscriptions } = serverNodeWith([
        {
          peerAddress: { fabricIndex: 1 },
        },
        {
          peerAddress: { fabricIndex: 2 },
        },
        {
          peerAddress: { fabricIndex: 1 },
        },
      ])
      await (manager as any).purgeSubscriptionsForFabric(node, 1)
      expect(subscriptions.state.subscriptions).toEqual([
        {
          peerAddress: { fabricIndex: 2 },
        },
      ])
    })

    it('leaves subscriptions untouched when none belong to the fabric', async () => {
      const { node, subscriptions } = serverNodeWith([
        {
          peerAddress: { fabricIndex: 2 },
        },
      ])
      await (manager as any).purgeSubscriptionsForFabric(node, 1)
      expect(subscriptions.state.subscriptions).toEqual([
        {
          peerAddress: { fabricIndex: 2 },
        },
      ])
    })

    it('is a no-op when there is no server node', async () => {
      await expect((manager as any).purgeSubscriptionsForFabric(null, 1)).resolves.toBeUndefined()
    })
  })
})
