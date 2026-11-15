/**
 * Fabric Manager
 *
 * Handles fabric info queries, commissioned status checks,
 * and fabric removal operations.
 */

import type { ServerNode } from '@matter/main'

import { Logger } from '../../logger.js'
import { MatterDeviceError } from '../types.js'

const log = Logger.withPrefix('Matter/Server')

export interface FabricInfo {
  fabricIndex: number
  fabricId: string
  nodeId: string
  rootVendorId: number
  label?: string
}

export interface CommissioningSnapshot {
  commissioned: boolean
  fabricCount: number
  fabrics: FabricInfo[]
}

export class FabricManager {
  constructor(
    private readonly getServerNode: () => ServerNode | null,
  ) {}

  /**
   * The controllers this node is paired with.
   *
   * matter.js loads its fabric list while the node is created, before it goes
   * online, and gives it at `state.commissioning.fabrics`. That is the one
   * source used: it is right for a node that is built and not online yet
   * (#4009), and it changes the moment a controller is added or removed
   * (#3974), which the node's `commissioned` flag and the copy in the
   * operational credentials cluster do not.
   */
  getFabricInfo(): FabricInfo[] {
    const serverNode = this.getServerNode()
    if (!serverNode) {
      return []
    }

    try {
      return Object.values(serverNode.state.commissioning.fabrics).map(fabric => ({
        fabricIndex: fabric.fabricIndex,
        fabricId: fabric.fabricId.toString(),
        nodeId: fabric.nodeId.toString(),
        rootVendorId: fabric.rootVendorId,
        label: fabric.label,
      }))
    } catch (error) {
      // the node is closing
      log.debug('Failed to get fabric info:', error)
      return []
    }
  }

  /**
   * Check if the server is commissioned
   */
  isCommissioned(): boolean {
    return this.getFabricInfo().length > 0
  }

  /**
   * Get the number of commissioned fabrics
   */
  getCommissionedFabricCount(): number {
    return this.getFabricInfo().length
  }

  /**
   * Get commissioned/fabricCount/fabrics in a single pass.
   */
  getCommissioningSnapshot(): CommissioningSnapshot {
    const fabrics = this.getFabricInfo()
    return { commissioned: fabrics.length > 0, fabricCount: fabrics.length, fabrics }
  }

  /**
   * Remove a specific fabric (controller) from the bridge
   */
  async removeFabric(fabricIndex: number): Promise<void> {
    const serverNode = this.getServerNode()
    if (!serverNode) {
      throw new MatterDeviceError('Matter server not started')
    }

    try {
      log.info(`Removing fabric ${fabricIndex}...`)

      interface ServerNodeWithFabrics {
        state?: {
          commissioning?: {
            removeFabric?: (fabricIndex: number) => Promise<void>
          }
        }
      }
      const serverState = serverNode as unknown as ServerNodeWithFabrics
      const removeFabric = serverState?.state?.commissioning?.removeFabric

      if (typeof removeFabric !== 'function') {
        throw new MatterDeviceError('Fabric removal not supported by Matter.js version')
      }

      await removeFabric(fabricIndex)
      log.info(`Fabric ${fabricIndex} removed successfully`)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error)
      log.error(`Failed to remove fabric ${fabricIndex}:`, error)
      throw new MatterDeviceError(`Failed to remove fabric: ${errorMessage}`, {
        originalError: error instanceof Error
          ? error
          : undefined,
      })
    }
  }

  /**
   * Check if a specific fabric exists
   */
  hasFabric(fabricIndex: number): boolean {
    const fabrics = this.getFabricInfo()
    return fabrics.some(f => f.fabricIndex === fabricIndex)
  }
}
