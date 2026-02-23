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

    it('should exhaust port pool and return undefined', async () => {
      // Default range is 5530-5541 (12 ports)
      const ports: (number | undefined)[] = []
      for (let i = 0; i < 13; i++) {
        ports.push(await allocator.requestPort(`uuid-${i}`))
      }

      // First 12 should get valid ports
      expect(ports.slice(0, 12).every(p => p !== undefined)).toBe(true)
      // 13th should be undefined (pool exhausted)
      expect(ports[12]).toBeUndefined()
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

    it('should exhaust custom range', async () => {
      const allocator = new MatterPortAllocator({ start: 6000, end: 6002 })

      const port1 = await allocator.requestPort('uuid-1')
      const port2 = await allocator.requestPort('uuid-2')
      const port3 = await allocator.requestPort('uuid-3')
      const port4 = await allocator.requestPort('uuid-4')

      expect(port1).toBe(6000)
      expect(port2).toBe(6001)
      expect(port3).toBe(6002)
      expect(port4).toBeUndefined()
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
    it('should handle single port range', async () => {
      const allocator = new MatterPortAllocator({ start: 6000, end: 6000 })

      const port1 = await allocator.requestPort('uuid-1')
      const port2 = await allocator.requestPort('uuid-2')

      expect(port1).toBe(6000)
      expect(port2).toBeUndefined()
    })

    it('should handle all ports being configured', async () => {
      const allocator = new MatterPortAllocator(
        { start: 6000, end: 6002 },
        [6000, 6001, 6002],
      )

      const port = await allocator.requestPort('uuid-1')
      expect(port).toBeUndefined()
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
