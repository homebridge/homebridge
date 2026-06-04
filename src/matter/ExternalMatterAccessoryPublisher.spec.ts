import type { ExternalAccessoryPublishContext } from './ExternalMatterAccessoryPublisher.js'
import type { InternalMatterAccessory } from './types.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from '../logger.js'
import { User } from '../user.js'
import * as mac from '../util/mac.js'
import { publishExternalMatterAccessory } from './ExternalMatterAccessoryPublisher.js'
import { MatterServer } from './server.js'

// Mock dependencies
vi.mock('../logger.js', () => {
  const mockLogger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  }
  return {
    Logger: {
      internal: mockLogger,
      withPrefix: vi.fn(() => mockLogger),
    },
  }
})
vi.mock('../user.js')
vi.mock('../util/mac.js')
vi.mock('./server.js')

describe('externalMatterAccessoryPublisher', () => {
  let mockAccessory: InternalMatterAccessory
  let mockContext: ExternalAccessoryPublishContext
  let mockPortService: any
  let mockMatterServer: any
  let logErrorSpy: any
  let logInfoSpy: any

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Get logger spies
    logErrorSpy = vi.mocked(Logger).internal.error
    logInfoSpy = vi.mocked(Logger).internal.info

    // Mock User.matterPath()
    vi.mocked(User).matterPath = vi.fn().mockReturnValue('/mock/matter/path')

    // Mock MAC address generation
    vi.mocked(mac.generate).mockReturnValue('AA:BB:CC:DD:EE:FF')

    // Mock MatterServer
    mockMatterServer = {
      start: vi.fn().mockResolvedValue(undefined),
      registerPlatformAccessories: vi.fn().mockResolvedValue(undefined),
      runServer: vi.fn().mockResolvedValue(undefined),
      getCommissioningInfo: vi.fn().mockReturnValue({
        qrCode: 'MT:MOCK-QR-CODE',
        manualPairingCode: '12345678',
        serialNumber: 'MOCK-SERIAL',
        commissioned: false,
      }),
    }
    vi.mocked(MatterServer).mockImplementation(function (this: any) {
      return mockMatterServer
    } as any)

    // Create mock port service
    mockPortService = {
      requestMatterPort: vi.fn().mockResolvedValue(5530),
    }

    // Create mock context
    mockContext = {
      portService: mockPortService,
      networkInterfaces: ['eth0'],
      debugModeEnabled: true,
    }

    // Create mock accessory
    mockAccessory = {
      UUID: 'test-uuid-123',
      displayName: 'Test Vacuum',
      manufacturer: 'Test Mfg',
      model: 'Test Model',
      firmwareRevision: '1.0.0',
      serialNumber: 'SN-123',
      _associatedPlugin: 'homebridge-test-plugin',
    } as InternalMatterAccessory
  })

  describe('publishExternalMatterAccessory', () => {
    describe('validation', () => {
      it('should return null when accessory has no UUID', async () => {
        const invalidAccessory = { ...mockAccessory, UUID: undefined } as any

        const result = await publishExternalMatterAccessory(invalidAccessory, mockContext)

        expect(result).toBeNull()
        expect(logErrorSpy).toHaveBeenCalledWith('External Matter accessory missing UUID - skipping')
      })

      it('should return null when accessory has no displayName', async () => {
        const invalidAccessory = { ...mockAccessory, displayName: undefined } as any

        const result = await publishExternalMatterAccessory(invalidAccessory, mockContext)

        expect(result).toBeNull()
        expect(logErrorSpy).toHaveBeenCalledWith(
          'External Matter accessory test-uuid-123 missing displayName - skipping',
        )
      })

      it('should return null when port allocation fails', async () => {
        mockPortService.requestMatterPort.mockResolvedValue(null)

        const result = await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(result).toBeNull()
        expect(logErrorSpy).toHaveBeenCalledWith(
          'Failed to allocate Matter port for external Matter accessory Test Vacuum',
        )
        expect(logErrorSpy).toHaveBeenCalledWith(
          'Please configure matterPorts in config.json or free up ports in the default range (5530-5541)',
        )
      })

      it('should return null when port allocation returns undefined', async () => {
        mockPortService.requestMatterPort.mockResolvedValue(undefined)

        const result = await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(result).toBeNull()
        expect(logErrorSpy).toHaveBeenCalledWith(
          'Failed to allocate Matter port for external Matter accessory Test Vacuum',
        )
      })
    })

    describe('mAC address generation', () => {
      it('should generate deterministic MAC address from UUID', async () => {
        await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(mac.generate).toHaveBeenCalledWith('test-uuid-123')
      })

      it('should use MAC without colons as uniqueId', async () => {
        vi.mocked(mac.generate).mockReturnValue('11:22:33:44:55:66')

        await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(mockPortService.requestMatterPort).toHaveBeenCalledWith('112233445566')
      })
    })

    describe('port allocation', () => {
      it('should request Matter port with uniqueId', async () => {
        await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(mockPortService.requestMatterPort).toHaveBeenCalledWith('AABBCCDDEEFF')
      })

      it('should log port allocation success', async () => {
        mockPortService.requestMatterPort.mockResolvedValue(5535)

        await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(logInfoSpy).toHaveBeenCalledWith('Allocated port 5535 for external Matter accessory: Test Vacuum')
      })
    })

    describe('matterServer creation', () => {
      it('should create MatterServer with correct configuration', async () => {
        await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(MatterServer).toHaveBeenCalledWith({
          port: 5530,
          uniqueId: 'AABBCCDDEEFF',
          storagePath: '/mock/matter/path',
          displayName: 'Test Vacuum',
          manufacturer: 'Test Mfg',
          model: 'Test Model',
          firmwareRevision: '1.0.0',
          serialNumber: 'SN-123',
          debugModeEnabled: true,
          externalAccessory: true,
          networkInterfaces: ['eth0'],
        })
      })

      it('should use uniqueId as fallback serial number', async () => {
        const accessoryNoSerial = { ...mockAccessory, serialNumber: undefined } as any

        await publishExternalMatterAccessory(accessoryNoSerial, mockContext)

        expect(MatterServer).toHaveBeenCalledWith(
          expect.objectContaining({
            serialNumber: 'AABBCCDDEEFF',
          }),
        )
      })

      it('should pass through debugModeEnabled setting', async () => {
        const contextNoDebug = { ...mockContext, debugModeEnabled: false }

        await publishExternalMatterAccessory(mockAccessory, contextNoDebug)

        expect(MatterServer).toHaveBeenCalledWith(
          expect.objectContaining({
            debugModeEnabled: false,
          }),
        )
      })

      it('should pass through networkInterfaces setting', async () => {
        const contextMultipleInterfaces = {
          ...mockContext,
          networkInterfaces: ['eth0', 'eth1', 'wlan0'],
        }

        await publishExternalMatterAccessory(mockAccessory, contextMultipleInterfaces)

        expect(MatterServer).toHaveBeenCalledWith(
          expect.objectContaining({
            networkInterfaces: ['eth0', 'eth1', 'wlan0'],
          }),
        )
      })

      it('should handle undefined networkInterfaces', async () => {
        const contextNoInterfaces = { ...mockContext, networkInterfaces: undefined }

        await publishExternalMatterAccessory(mockAccessory, contextNoInterfaces)

        expect(MatterServer).toHaveBeenCalledWith(
          expect.objectContaining({
            networkInterfaces: undefined,
          }),
        )
      })
    })

    describe('server lifecycle', () => {
      it('should start server before registering accessory', async () => {
        const callOrder: string[] = []
        mockMatterServer.start.mockImplementation(() => {
          callOrder.push('start')
          return Promise.resolve()
        })
        mockMatterServer.registerPlatformAccessories.mockImplementation(() => {
          callOrder.push('register')
          return Promise.resolve()
        })

        await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(callOrder).toEqual(['start', 'register'])
      })

      it('should register accessory with plugin identifier', async () => {
        await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(mockMatterServer.registerPlatformAccessories).toHaveBeenCalledWith(
          'homebridge-test-plugin',
          'ExternalMatter',
          [mockAccessory],
        )
      })

      it('should use "unknown" plugin identifier when not set', async () => {
        const accessoryNoPlugin = { ...mockAccessory, _associatedPlugin: undefined }

        await publishExternalMatterAccessory(accessoryNoPlugin, mockContext)

        expect(mockMatterServer.registerPlatformAccessories).toHaveBeenCalledWith('unknown', 'ExternalMatter', [
          accessoryNoPlugin,
        ])
      })

      it('should run server after registering accessory', async () => {
        const callOrder: string[] = []
        mockMatterServer.registerPlatformAccessories.mockImplementation(() => {
          callOrder.push('register')
          return Promise.resolve()
        })
        mockMatterServer.runServer.mockImplementation(() => {
          callOrder.push('runServer')
          return Promise.resolve()
        })

        await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(callOrder).toEqual(['register', 'runServer'])
      })

      it('should call all server lifecycle methods', async () => {
        await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(mockMatterServer.start).toHaveBeenCalledOnce()
        expect(mockMatterServer.registerPlatformAccessories).toHaveBeenCalledOnce()
        expect(mockMatterServer.runServer).toHaveBeenCalledOnce()
      })

      it('stops the half-started server when registerPlatformAccessories rejects', async () => {
        mockMatterServer.stop = vi.fn().mockResolvedValue(undefined)
        mockMatterServer.registerPlatformAccessories.mockRejectedValueOnce(new Error('register failed'))

        await expect(publishExternalMatterAccessory(mockAccessory, mockContext)).rejects.toThrow('register failed')

        // Started → must be stopped to release SIGINT/SIGTERM handlers and the
        // mDNS responder. runServer was never reached.
        expect(mockMatterServer.start).toHaveBeenCalledOnce()
        expect(mockMatterServer.stop).toHaveBeenCalledOnce()
        expect(mockMatterServer.runServer).not.toHaveBeenCalled()
      })

      it('stops the half-started server when runServer rejects', async () => {
        mockMatterServer.stop = vi.fn().mockResolvedValue(undefined)
        mockMatterServer.runServer.mockRejectedValueOnce(new Error('run failed'))

        await expect(publishExternalMatterAccessory(mockAccessory, mockContext)).rejects.toThrow('run failed')

        expect(mockMatterServer.stop).toHaveBeenCalledOnce()
      })

      it('does not call stop when start itself fails (nothing to tear down)', async () => {
        mockMatterServer.stop = vi.fn().mockResolvedValue(undefined)
        mockMatterServer.start.mockRejectedValueOnce(new Error('start failed'))

        await expect(publishExternalMatterAccessory(mockAccessory, mockContext)).rejects.toThrow('start failed')

        expect(mockMatterServer.stop).not.toHaveBeenCalled()
      })

      it('releases the allocated Matter port back to the allocator on failure', async () => {
        mockMatterServer.stop = vi.fn().mockResolvedValue(undefined)
        mockMatterServer.runServer.mockRejectedValueOnce(new Error('run failed'))
        mockPortService.releaseMatterPort = vi.fn().mockReturnValue(true)

        await expect(publishExternalMatterAccessory(mockAccessory, mockContext)).rejects.toThrow('run failed')

        // Same uniqueId as the publisher computed: MAC without colons.
        expect(mockPortService.releaseMatterPort).toHaveBeenCalledWith('AABBCCDDEEFF')
      })

      it('still throws cleanly when releaseMatterPort is not available on the port service', async () => {
        // Older / minimal port-service shapes may not implement release.
        // The optional chaining must keep the throw clean.
        mockMatterServer.stop = vi.fn().mockResolvedValue(undefined)
        mockMatterServer.runServer.mockRejectedValueOnce(new Error('run failed'))
        mockPortService.releaseMatterPort = undefined

        await expect(publishExternalMatterAccessory(mockAccessory, mockContext)).rejects.toThrow('run failed')
      })

      it('releases the port when start fails before any binding could occur', async () => {
        // start() never completed → matter.js never bound the port, so the
        // allocator can safely hand it out again.
        mockMatterServer.start.mockRejectedValueOnce(new Error('start failed'))
        mockPortService.releaseMatterPort = vi.fn().mockReturnValue(true)

        await expect(publishExternalMatterAccessory(mockAccessory, mockContext)).rejects.toThrow('start failed')

        expect(mockPortService.releaseMatterPort).toHaveBeenCalledWith('AABBCCDDEEFF')
      })

      it('keeps the port reserved when start fails but flags that the node may still be bound', async () => {
        // ServerLifecycle annotates the error with portMayStillBeBound when its
        // internal close() of the half-built node failed — so the port may still
        // be bound even though start() rejected. The publisher must NOT release it.
        const err = new Error('start failed') as Error & { portMayStillBeBound?: boolean }
        err.portMayStillBeBound = true
        mockMatterServer.start.mockRejectedValueOnce(err)
        mockPortService.releaseMatterPort = vi.fn().mockReturnValue(true)

        await expect(publishExternalMatterAccessory(mockAccessory, mockContext)).rejects.toThrow('start failed')

        expect(mockPortService.releaseMatterPort).not.toHaveBeenCalled()
        // The lost slot must be surfaced at warn (not debug) so operators can
        // see the pool shrank until restart (#3944).
        expect(vi.mocked(Logger).internal.warn).toHaveBeenCalledWith(expect.stringMatching(/reserved.*may still be bound/i))
      })

      it('keeps the port reserved when stop() fails after a successful start', async () => {
        // A failed stop may leave the matter.js server still bound to the
        // port. Handing it back to the allocator would let a later publish
        // attempt take the same port and hit EADDRINUSE — keep it reserved.
        mockMatterServer.runServer.mockRejectedValueOnce(new Error('run failed'))
        mockMatterServer.stop = vi.fn().mockRejectedValue(new Error('stop failed'))
        mockPortService.releaseMatterPort = vi.fn().mockReturnValue(true)

        await expect(publishExternalMatterAccessory(mockAccessory, mockContext)).rejects.toThrow('run failed')

        expect(mockPortService.releaseMatterPort).not.toHaveBeenCalled()
        expect(vi.mocked(Logger).internal.warn).toHaveBeenCalledWith(expect.stringMatching(/reserved.*may still be bound/i))
      })
    })

    describe('success path', () => {
      it('should return PublishedExternalAccessory on success', async () => {
        const result = await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(result).toEqual({
          server: mockMatterServer,
          port: 5530,
          username: 'AA:BB:CC:DD:EE:FF',
          commissioningInfo: {
            qrCode: 'MT:MOCK-QR-CODE',
            manualPairingCode: '12345678',
            serialNumber: 'MOCK-SERIAL',
            commissioned: false,
          },
        })
      })

      it('should log success message', async () => {
        await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(logInfoSpy).toHaveBeenCalledWith('✓ External Matter accessory published: Test Vacuum on port 5530 (bridge AA:BB:CC:DD:EE:FF)')
      })

      it('should retrieve commissioning info from server', async () => {
        await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(mockMatterServer.getCommissioningInfo).toHaveBeenCalledOnce()
      })

      it('should return commissioning info with commissioned status', async () => {
        mockMatterServer.getCommissioningInfo.mockReturnValue({
          qrCode: undefined,
          manualPairingCode: undefined,
          serialNumber: 'SN-123',
          commissioned: true,
        })

        const result = await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(result?.commissioningInfo).toEqual({
          qrCode: undefined,
          manualPairingCode: undefined,
          serialNumber: 'SN-123',
          commissioned: true,
        })
      })
    })

    describe('edge cases', () => {
      it('should handle empty string UUID', async () => {
        const invalidAccessory = { ...mockAccessory, UUID: '' }

        const result = await publishExternalMatterAccessory(invalidAccessory, mockContext)

        expect(result).toBeNull()
        expect(logErrorSpy).toHaveBeenCalledWith('External Matter accessory missing UUID - skipping')
      })

      it('should handle empty string displayName', async () => {
        const invalidAccessory = { ...mockAccessory, displayName: '' }

        const result = await publishExternalMatterAccessory(invalidAccessory, mockContext)

        expect(result).toBeNull()
      })

      it('should handle MAC address with different format', async () => {
        vi.mocked(mac.generate).mockReturnValue('00:11:22:33:44:55')

        await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(mockPortService.requestMatterPort).toHaveBeenCalledWith('001122334455')
      })

      it('should handle port allocation returning 0', async () => {
        mockPortService.requestMatterPort.mockResolvedValue(0)

        const result = await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(result).toBeNull()
      })

      it('should handle very high port numbers', async () => {
        mockPortService.requestMatterPort.mockResolvedValue(65535)

        const result = await publishExternalMatterAccessory(mockAccessory, mockContext)

        expect(result?.port).toBe(65535)
        expect(MatterServer).toHaveBeenCalledWith(
          expect.objectContaining({
            port: 65535,
          }),
        )
      })
    })
  })
})
