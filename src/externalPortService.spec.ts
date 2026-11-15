import type { HomebridgeConfig } from './bridgeService.js'
import type { ChildBridgeFork } from './childBridgeFork.js'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChildBridgeExternalPortService, collectConfiguredHapPorts, ExternalPortService } from './externalPortService.js'
import { Logger } from './logger.js'

describe('externalPortService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

    it('answers an accessory that got no port the same way again, with one warning', async () => {
      const warnings = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const service = new ExternalPortService({ start: 50000, end: 50000 })
      await service.requestPort('AA:AA:AA:AA:AA:01')

      for (let request = 0; request < 5; request++) {
        expect(await service.requestPort('AA:AA:AA:AA:AA:02')).toBeUndefined()
      }

      expect(warnings).toHaveBeenCalledTimes(1)
      // the place in the pool does not move on for an accessory that asks again
      expect((service as unknown as { nextExternalPort: number }).nextExternalPort).toBe(50001)
    })

    it('does not count on past the end of the range for every accessory that gets no port', async () => {
      vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const service = new ExternalPortService({ start: 50000, end: 50000 })

      for (let accessory = 0; accessory < 5; accessory++) {
        await service.requestPort(`AA:AA:AA:AA:AA:0${accessory}`)
      }

      expect((service as unknown as { nextExternalPort: number }).nextExternalPort).toBe(50001)
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

  describe('matter ports', () => {
    it('hands out the Matter ports in their own range, and takes one back', async () => {
      const service = new ExternalPortService({ start: 50000, end: 50001 }, { start: 5540, end: 5541 })

      expect(await service.requestMatterPort('one')).toBe(5540)
      expect(await service.requestMatterPort('two')).toBe(5541)
      // the HAP range is not touched
      expect(await service.requestPort('AA:AA:AA:AA:AA:01')).toBe(50000)

      expect(service.releaseMatterPort('one')).toBe(true)
      expect(service.releaseMatterPort('one')).toBe(false)
      expect(await service.requestMatterPort('three')).toBe(5540)
    })

    it('does not hand out a Matter port that was reserved', async () => {
      const service = new ExternalPortService(undefined, { start: 5540, end: 5541 })
      service.reserveMatterPort(5540)

      expect(await service.requestMatterPort('one')).toBe(5541)
    })
  })

  describe('childBridgeExternalPortService', () => {
    function makeChildBridge() {
      return {
        requestExternalPort: vi.fn().mockResolvedValue(50007),
        requestMatterPort: vi.fn().mockResolvedValue(5547),
        releaseMatterPort: vi.fn(),
      }
    }

    it('asks the main bridge for a HAP port', async () => {
      const childBridge = makeChildBridge()
      const service = new ChildBridgeExternalPortService(childBridge as unknown as ChildBridgeFork)

      expect(await service.requestPort('AA:AA:AA:AA:AA:01')).toBe(50007)
      expect(childBridge.requestExternalPort).toHaveBeenCalledExactlyOnceWith('AA:AA:AA:AA:AA:01')
    })

    it('asks the main bridge for a Matter port, and gives it back there', async () => {
      const childBridge = makeChildBridge()
      const service = new ChildBridgeExternalPortService(childBridge as unknown as ChildBridgeFork)

      expect(await service.requestMatterPort('uuid-1')).toBe(5547)
      expect(childBridge.requestMatterPort).toHaveBeenCalledExactlyOnceWith('uuid-1')

      expect(service.releaseMatterPort('uuid-1')).toBe(true)
      expect(childBridge.releaseMatterPort).toHaveBeenCalledExactlyOnceWith('uuid-1')
    })

    it('passes on that the main bridge did not answer', async () => {
      const childBridge = makeChildBridge()
      childBridge.requestExternalPort.mockRejectedValue(new Error('parent did not answer'))
      const service = new ChildBridgeExternalPortService(childBridge as unknown as ChildBridgeFork)

      await expect(service.requestPort('AA:AA:AA:AA:AA:01')).rejects.toThrow('parent did not answer')
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
