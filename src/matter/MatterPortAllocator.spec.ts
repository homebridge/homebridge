import { beforeEach, describe, expect, it } from 'vitest'

import { MatterPortAllocator } from './MatterPortAllocator.js'

describe('matterPortAllocator', () => {
  describe('with default range (5530-5541)', () => {
    let allocator: MatterPortAllocator

    beforeEach(() => {
      allocator = new MatterPortAllocator()
    })

    it('should allocate ports starting from 5530', async () => {
      const port1 = await allocator.requestPort('uuid-1')
      expect(port1).toBe(5530)
    })

    it('should allocate sequential ports', async () => {
      const port1 = await allocator.requestPort('uuid-1')
      const port2 = await allocator.requestPort('uuid-2')
      const port3 = await allocator.requestPort('uuid-3')

      expect(port1).toBe(5530)
      expect(port2).toBe(5531)
      expect(port3).toBe(5532)
    })

    it('should return same port for same UUID', async () => {
      const port1 = await allocator.requestPort('uuid-1')
      const port2 = await allocator.requestPort('uuid-1')

      expect(port1).toBe(port2)
      expect(port1).toBe(5530)
    })

    it('should fall back to extended range when preferred range is exhausted', async () => {
      // Default range is 5530-5541 (12 ports)
      const ports: (number | undefined)[] = []
      for (let i = 0; i < 13; i++) {
        ports.push(await allocator.requestPort(`uuid-${i}`))
      }

      // First 12 should get ports in preferred range
      expect(ports.slice(0, 12).every(p => p !== undefined)).toBe(true)
      // 13th should fall back to extended range (5542)
      expect(ports[12]).toBe(5542)
    })

    it('should provide correct statistics', async () => {
      await allocator.requestPort('uuid-1')
      await allocator.requestPort('uuid-2')
      await allocator.requestPort('uuid-3')

      const stats = allocator.getStats()
      expect(stats.allocatedCount).toBe(3)
      expect(stats.configuredPortsCount).toBe(0)
    })
  })

  describe('with custom range', () => {
    it('should use custom range', async () => {
      const allocator = new MatterPortAllocator({ start: 6000, end: 6005 })

      const port1 = await allocator.requestPort('uuid-1')
      const port2 = await allocator.requestPort('uuid-2')

      expect(port1).toBe(6000)
      expect(port2).toBe(6001)
    })

    it('should fall back to extended range when custom range is exhausted', async () => {
      const allocator = new MatterPortAllocator({ start: 6000, end: 6002 })

      const port1 = await allocator.requestPort('uuid-1')
      const port2 = await allocator.requestPort('uuid-2')
      const port3 = await allocator.requestPort('uuid-3')
      const port4 = await allocator.requestPort('uuid-4')

      expect(port1).toBe(6000)
      expect(port2).toBe(6001)
      expect(port3).toBe(6002)
      expect(port4).toBe(6003) // falls back to extended range
    })
  })

  describe('with configured ports (already in use)', () => {
    it('should skip configured ports', async () => {
      // Ports 5530 and 5531 are already configured/in use
      const allocator = new MatterPortAllocator(undefined, [5530, 5531])

      const port1 = await allocator.requestPort('uuid-1')
      const port2 = await allocator.requestPort('uuid-2')

      expect(port1).toBe(5532) // Skip 5530, 5531
      expect(port2).toBe(5533)
    })

    it('should handle configured ports in middle of range', async () => {
      const allocator = new MatterPortAllocator({ start: 6000, end: 6010 }, [6002, 6005, 6008])

      const ports: number[] = []
      for (let i = 0; i < 8; i++) {
        const port = await allocator.requestPort(`uuid-${i}`)
        if (port !== undefined) {
          ports.push(port)
        }
      }

      // Should get: 6000, 6001, 6003, 6004, 6006, 6007, 6009, 6010 (skipping 6002, 6005, 6008)
      expect(ports).toEqual([6000, 6001, 6003, 6004, 6006, 6007, 6009, 6010])
    })

    it('should update statistics with configured ports', async () => {
      const allocator = new MatterPortAllocator(undefined, [5530, 5531, 5532])

      await allocator.requestPort('uuid-1')

      const stats = allocator.getStats()
      expect(stats.allocatedCount).toBe(1)
      expect(stats.configuredPortsCount).toBe(3)
    })
  })

  describe('edge cases', () => {
    it('should handle single port range and fall back to extended range', async () => {
      const allocator = new MatterPortAllocator({ start: 6000, end: 6000 })

      const port1 = await allocator.requestPort('uuid-1')
      const port2 = await allocator.requestPort('uuid-2')

      expect(port1).toBe(6000)
      expect(port2).toBe(6001) // falls back to extended range
    })

    it('should handle all ports being configured by using extended range', async () => {
      const allocator = new MatterPortAllocator(
        { start: 6000, end: 6002 },
        [6000, 6001, 6002],
      )

      const port = await allocator.requestPort('uuid-1')
      expect(port).toBe(6003) // falls back to extended range, skipping configured ports
    })

    it('should return undefined for inverted port range', async () => {
      const allocator = new MatterPortAllocator({ start: 6005, end: 6000 })

      const port = await allocator.requestPort('uuid-1')
      expect(port).toBeUndefined()
    })

    it('does not record a dead allocation when the range is exhausted', async () => {
      // Inverted range means getNextFreePort() always returns undefined.
      const allocator = new MatterPortAllocator({ start: 6005, end: 6000 })

      const port = await allocator.requestPort('uuid-1')
      expect(port).toBeUndefined()

      // No uuid->undefined entry should linger and skew the stats.
      expect(allocator.getStats().allocatedCount).toBe(0)
      // And there is nothing to release, since nothing was stored.
      expect(allocator.releasePort('uuid-1')).toBe(false)
    })

    it('should recognise an existing allocation and not re-allocate', async () => {
      // Regression: ensure requestPort returns the cached port for the same UUID
      const allocator = new MatterPortAllocator({ start: 7000, end: 7000 })

      const port1 = await allocator.requestPort('uuid-1')
      expect(port1).toBe(7000)

      // Same UUID should return the same port, not re-allocate
      const port2 = await allocator.requestPort('uuid-1')
      expect(port2).toBe(7000)
    })

    it('should handle empty UUID gracefully', async () => {
      const allocator = new MatterPortAllocator()

      const port1 = await allocator.requestPort('')
      const port2 = await allocator.requestPort('')

      expect(port1).toBe(5530)
      expect(port2).toBe(5530) // Same UUID returns same port
    })

    it('should handle very long UUID strings', async () => {
      const allocator = new MatterPortAllocator()
      const longUuid = 'a'.repeat(1000)

      const port = await allocator.requestPort(longUuid)
      expect(port).toBe(5530)
    })
  })

  describe('releasePort', () => {
    it('returns true when an allocation exists, false otherwise', async () => {
      const allocator = new MatterPortAllocator()
      await allocator.requestPort('uuid-1')

      expect(allocator.releasePort('uuid-1')).toBe(true)
      // already released — second call has nothing to drop
      expect(allocator.releasePort('uuid-1')).toBe(false)
      // never-allocated UUID
      expect(allocator.releasePort('never-seen')).toBe(false)
    })

    it('frees the slot so a later allocation can reuse the port', async () => {
      const allocator = new MatterPortAllocator({ start: 7000, end: 7001 })
      const a = await allocator.requestPort('a')
      const b = await allocator.requestPort('b')
      expect(a).toBe(7000)
      expect(b).toBe(7001)

      // Without release, a third allocation would fall into the extended range.
      allocator.releasePort('a')

      const c = await allocator.requestPort('c')
      // 7000 is now free again, so the next request should pick it up before
      // walking past the configured range.
      expect(c).toBe(7000)
    })

    it('updates allocatedCount in stats', async () => {
      const allocator = new MatterPortAllocator()
      await allocator.requestPort('uuid-1')
      await allocator.requestPort('uuid-2')
      expect(allocator.getStats().allocatedCount).toBe(2)

      allocator.releasePort('uuid-1')
      expect(allocator.getStats().allocatedCount).toBe(1)
    })
  })

  describe('concurrent requests', () => {
    it('should handle concurrent requests correctly', async () => {
      const allocator = new MatterPortAllocator()

      const promises = Array.from({ length: 5 }, (_, i) =>
        allocator.requestPort(`uuid-${i}`))

      const ports = await Promise.all(promises)

      // All ports should be unique
      const uniquePorts = new Set(ports)
      expect(uniquePorts.size).toBe(5)

      // All should be in expected range
      ports.forEach((port) => {
        expect(port).toBeGreaterThanOrEqual(5530)
        expect(port).toBeLessThanOrEqual(5534)
      })
    })

    it('should handle duplicate UUID in concurrent requests', async () => {
      const allocator = new MatterPortAllocator()

      // Request same UUID multiple times concurrently
      const promises = Array.from({ length: 3 }).fill(allocator.requestPort('same-uuid'))

      const ports = await Promise.all(promises)

      // All should return the same port
      expect(ports[0]).toBe(ports[1])
      expect(ports[1]).toBe(ports[2])
      expect(ports[0]).toBe(5530)
    })
  })
})
