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
  return {
    Logger: {
      withPrefix: vi.fn(() => mockLogger),
    },
  }
})

function makeFabricManager(serverNode: unknown): FabricManager {
  return new FabricManager(() => serverNode as ServerNode | null)
}

/** A node as matter.js gives its fabric list: a record by fabric index, with bigint ids. */
function makeServerNode(fabrics: Record<number, unknown>, commissionedFlag = false): unknown {
  return {
    state: {
      commissioning: { fabrics, commissioned: commissionedFlag },
    },
  }
}

const appleHome = {
  fabricIndex: 3,
  fabricId: 100n,
  nodeId: 200n,
  rootNodeId: 1n,
  rootVendorId: 0x1349,
  label: 'AppleHome',
}

describe('fabricManager', () => {
  describe('getFabricInfo', () => {
    it('maps the fabrics matter.js holds, with the ids as text', () => {
      const manager = makeFabricManager(makeServerNode({ 3: appleHome }))

      expect(manager.getFabricInfo()).toEqual([
        {
          fabricIndex: 3,
          fabricId: '100',
          nodeId: '200',
          rootVendorId: 0x1349,
          label: 'AppleHome',
        },
      ])
    })

    it('returns an empty list when there is no server node', () => {
      expect(makeFabricManager(null).getFabricInfo()).toEqual([])
    })

    it('returns an empty list when the node can no longer be read (it is closing)', () => {
      const closing = {
        get state(): never {
          throw new Error('endpoint is closed')
        },
      }

      expect(makeFabricManager(closing).getFabricInfo()).toEqual([])
    })
  })

  describe('getCommissioningSnapshot', () => {
    it('reports commissioned with the mapped fabrics', () => {
      const manager = makeFabricManager(makeServerNode({
        3: appleHome,
        4: { ...appleHome, fabricIndex: 4, label: 'Google' },
      }))

      expect(manager.getCommissioningSnapshot()).toMatchObject({
        commissioned: true,
        fabricCount: 2,
        fabrics: [
          { fabricIndex: 3, label: 'AppleHome' },
          { fabricIndex: 4, label: 'Google' },
        ],
      })
      expect(manager.isCommissioned()).toBe(true)
      expect(manager.getCommissionedFabricCount()).toBe(2)
      expect(manager.hasFabric(4)).toBe(true)
      expect(manager.hasFabric(5)).toBe(false)
    })

    it('reports not commissioned when there are no fabrics', () => {
      const manager = makeFabricManager(makeServerNode({}))

      expect(manager.getCommissioningSnapshot()).toEqual({ commissioned: false, fabricCount: 0, fabrics: [] })
      expect(manager.isCommissioned()).toBe(false)
    })

    // The node's own flag lags behind a controller removing the last fabric.
    // Going by it reported "paired" with nothing paired, which hides the QR
    // code the owner needs to pair again.
    it('reports not commissioned for an empty fabric list even while the flag still says otherwise (#3974)', () => {
      const manager = makeFabricManager(makeServerNode({}, true))

      expect(manager.getCommissioningSnapshot()).toEqual({ commissioned: false, fabricCount: 0, fabrics: [] })
      expect(manager.isCommissioned()).toBe(false)
    })
  })
})
