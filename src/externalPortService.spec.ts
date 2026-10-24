import type { HomebridgeConfig } from './bridgeService.js'

import { describe, expect, it } from 'vitest'

import { collectConfiguredHapPorts, ExternalPortService } from './externalPortService.js'

describe('externalPortService', () => {
  describe('requestPort', () => {
    it('hands out the ports in the range in order, then nothing', async () => {
      const service = new ExternalPortService({ start: 50000, end: 50001 })

      expect(await service.requestPort('AA:AA:AA:AA:AA:01')).toBe(50000)
      expect(await service.requestPort('AA:AA:AA:AA:AA:02')).toBe(50001)
      expect(await service.requestPort('AA:AA:AA:AA:AA:03')).toBeUndefined()
    })

    it('gives the same accessory the same port again', async () => {
      const service = new ExternalPortService({ start: 50000, end: 50009 })

      expect(await service.requestPort('AA:AA:AA:AA:AA:01')).toBe(50000)
      expect(await service.requestPort('AA:AA:AA:AA:AA:01')).toBe(50000)
    })

    it('skips a port a bridge is configured to use (#4035)', async () => {
      // A child bridge on 50000, inside the range, and another on 50002
      const service = new ExternalPortService({ start: 50000, end: 50003 }, undefined, undefined, [50000, 50002])

      expect(await service.requestPort('AA:AA:AA:AA:AA:01')).toBe(50001)
      expect(await service.requestPort('AA:AA:AA:AA:AA:02')).toBe(50003)
      expect(await service.requestPort('AA:AA:AA:AA:AA:03')).toBeUndefined()
    })

    it('gives nothing when every port in the range belongs to a bridge', async () => {
      const service = new ExternalPortService({ start: 50000, end: 50001 }, undefined, undefined, [50000, 50001])

      expect(await service.requestPort('AA:AA:AA:AA:AA:01')).toBeUndefined()
    })

    it('gives nothing when no range is configured', async () => {
      const service = new ExternalPortService(undefined, undefined, undefined, [50000])

      expect(await service.requestPort('AA:AA:AA:AA:AA:01')).toBeUndefined()
    })
  })

  describe('collectConfiguredHapPorts', () => {
    it('collects the main bridge port and every child bridge port', () => {
      const config = {
        bridge: {
          username: 'CC:22:3D:E3:CE:30',
          pin: '031-45-154',
          name: 'Main',
          port: 51826,
        },
        platforms: [
          {
            platform: 'One',
            _bridge: { username: '0E:00:00:00:00:01', port: 50000 },
          },
          {
            platform: 'Two',
            _bridge: { username: '0E:00:00:00:00:02' },
          },
          { platform: 'Three' },
        ],
        accessories: [
          {
            accessory: 'Four',
            name: 'Four',
            _bridge: { username: '0E:00:00:00:00:04', port: 50005 },
          },
        ],
      } as unknown as HomebridgeConfig

      expect(collectConfiguredHapPorts(config)).toEqual([51826, 50000, 50005])
    })

    it('collects nothing when no bridge sets a port', () => {
      const config = {
        bridge: { username: 'CC:22:3D:E3:CE:30', pin: '031-45-154', name: 'Main' },
        platforms: [],
        accessories: [],
      } as unknown as HomebridgeConfig

      expect(collectConfiguredHapPorts(config)).toEqual([])
    })
  })
})
