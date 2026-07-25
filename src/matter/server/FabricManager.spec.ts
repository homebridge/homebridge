import type { ServerNode } from '@matter/main'

import { describe, expect, it, vi } from 'vitest'

import { FabricManager } from './FabricManager.js'

vi.mock('../../logger.js', () => {
  const mockLogger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  }
  return { Logger: { withPrefix: vi.fn(() => mockLogger) } }
})

function makeFabricManager(serverNode: unknown, storagePath?: string): FabricManager {
  return new FabricManager(
    () => serverNode as ServerNode | null,
    () => storagePath,
  )
}

function makeServerNode(fabrics: unknown[]): unknown {
  return {
    env: {},
    state: {
      operationalCredentials: { fabrics },
      commissioning: { commissioned: true },
    },
  }
}

describe('fabricManager', () => {
  describe('getFabricInfo', () => {
    it('maps vendorId from cluster-shaped FabricDescriptorStruct entries (#3974)', () => {
      // The operational credentials cluster names the vendor field `vendorId`
      // (per the Matter spec) - there is no `rootVendorId` on this shape
      const manager = makeFabricManager(makeServerNode([
        { fabricIndex: 1, fabricId: 100n, nodeId: 200n, vendorId: 0x1349, label: 'AppleHome' },
        { fabricIndex: 2, fabricId: 101n, nodeId: 201n, vendorId: 0x1384, label: '' },
      ]))

      const fabrics = manager.getFabricInfo()
      expect(fabrics).toEqual([
        { fabricIndex: 1, fabricId: '100', nodeId: '200', rootVendorId: 0x1349, label: 'AppleHome' },
        { fabricIndex: 2, fabricId: '101', nodeId: '201', rootVendorId: 0x1384, label: '' },
      ])
    })

    it('maps rootVendorId from internal matter.js Fabric-shaped entries', () => {
      const manager = makeFabricManager(makeServerNode([
        { fabricIndex: 1, fabricId: 100n, nodeId: 200n, rootVendorId: 0x6006, label: 'Google' },
      ]))

      const fabrics = manager.getFabricInfo()
      expect(fabrics).toEqual([
        { fabricIndex: 1, fabricId: '100', nodeId: '200', rootVendorId: 0x6006, label: 'Google' },
      ])
    })

    it('prefers rootVendorId when both vendor fields are present', () => {
      const manager = makeFabricManager(makeServerNode([
        { fabricIndex: 1, fabricId: 100n, nodeId: 200n, rootVendorId: 0x1217, vendorId: 0x1049, label: '' },
      ]))

      expect(manager.getFabricInfo()[0].rootVendorId).toBe(0x1217)
    })

    it('defaults the vendor to 0 when neither field is present', () => {
      const manager = makeFabricManager(makeServerNode([
        { fabricIndex: 1, fabricId: 100n, nodeId: 200n, label: '' },
      ]))

      expect(manager.getFabricInfo()[0].rootVendorId).toBe(0)
    })

    it('returns an empty list when there is no server node and no storage path', () => {
      const manager = makeFabricManager(null)
      expect(manager.getFabricInfo()).toEqual([])
    })
  })

  describe('getCommissioningSnapshot', () => {
    it('reports commissioned with the mapped fabrics from cluster-shaped entries', () => {
      const manager = makeFabricManager(makeServerNode([
        { fabricIndex: 1, fabricId: 100n, nodeId: 200n, vendorId: 0x1349, label: 'AppleHome' },
      ]))

      const snapshot = manager.getCommissioningSnapshot()
      expect(snapshot.commissioned).toBe(true)
      expect(snapshot.fabricCount).toBe(1)
      expect(snapshot.fabrics[0].rootVendorId).toBe(0x1349)
    })

    it('reports not commissioned when there are no fabrics and no commissioning flag', () => {
      const manager = makeFabricManager({ env: {}, state: {} })
      expect(manager.getCommissioningSnapshot()).toEqual({ commissioned: false, fabricCount: 0, fabrics: [] })
    })
  })
})
