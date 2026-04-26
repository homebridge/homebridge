/**
 * Fabric Manager
 *
 * Handles fabric info queries, commissioned status checks,
 * and fabric removal operations.
 */

import type { ServerNode } from '@matter/main'

import fs from 'node:fs'
import path from 'node:path'

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
    private readonly getMatterStoragePath: () => string | undefined,
  ) {}

  /**
   * Get fabric information for commissioned controllers
   */
  getFabricInfo(): FabricInfo[] {
    try {
      const serverNode = this.getServerNode()
      if (!serverNode) {
        return []
      }

      // Use the server node's commissioning state to read fabric info
      const env = serverNode.env
      if (!env) {
        return []
      }

      // Try reading from the server node's state
      try {
        const serverState = serverNode as any
        const fabrics = serverState?.state?.operationalCredentials?.fabrics
        if (Array.isArray(fabrics) && fabrics.length > 0) {
          return fabrics.map((fabric: any) => ({
            fabricIndex: fabric.fabricIndex || 0,
            fabricId: fabric.fabricId?.toString() || '',
            nodeId: fabric.nodeId?.toString() || '',
            rootVendorId: fabric.rootVendorId || 0,
            label: fabric.label || '',
          }))
        }
      } catch {
        // Fallback to checking storage
      }

      // Fallback: read from disk storage
      return this.readFabricsFromStorage()
    } catch (error) {
      log.debug('Failed to get fabric info:', error)
      return []
    }
  }

  /**
   * Read fabric information from storage files
   */
  private readFabricsFromStorage(): FabricInfo[] {
    try {
      const storagePath = this.getMatterStoragePath()
      if (!storagePath) {
        return []
      }

      // Try to read the storage file synchronously for backwards compatibility
      // Look for JSON files that might contain fabric data
      const files = fs.readdirSync(storagePath).filter((f: string) => f.endsWith('.json'))

      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(storagePath, file), 'utf-8'))

          // Check for fabrics data in various storage key formats
          const fabricsData = data?.['fabrics.fabrics'] || data?.fabrics?.fabrics
          if (Array.isArray(fabricsData) && fabricsData.length > 0) {
            return fabricsData.map((fabric: any) => ({
              fabricIndex: fabric.fabricIndex || 0,
              fabricId: fabric.fabricId?.value?.toString() || fabric.fabricId?.toString() || '',
              nodeId: fabric.nodeId?.value?.toString() || fabric.nodeId?.toString() || '',
              rootVendorId: fabric.rootVendorId || 0,
              label: fabric.label || '',
            }))
          }
        } catch {
          // Skip files that can't be parsed
        }
      }

      return []
    } catch {
      return []
    }
  }

  /**
   * Check if the server is commissioned
   */
  isCommissioned(): boolean {
    try {
      const serverNode = this.getServerNode()
      if (serverNode) {
        // Try to check commissioned state from the server node
        try {
          const serverState = serverNode as any
          const commissioned = serverState?.state?.commissioning?.commissioned
          if (commissioned === true) {
            return true
          }
        } catch {
          // Fallback
        }
      }

      // Fallback to checking fabric count
      const fabrics = this.getFabricInfo()
      return fabrics.length > 0
    } catch (error) {
      log.debug('Failed to check commissioned status:', error)
      return false
    }
  }

  /**
   * Get the number of commissioned fabrics
   */
  getCommissionedFabricCount(): number {
    return this.getFabricInfo().length
  }

  /**
   * Get commissioned/fabricCount/fabrics in a single pass.
   *
   * Coalesces what would otherwise be three separate getFabricInfo() calls
   * (one each from isCommissioned, getCommissionedFabricCount, getFabricInfo).
   * In the cold path that means one sync filesystem scan instead of three.
   * Preserves the serverNode.state fast-path that isCommissioned() uses.
   */
  getCommissioningSnapshot(): CommissioningSnapshot {
    const fabrics = this.getFabricInfo()
    const fabricCount = fabrics.length
    if (fabricCount > 0) {
      return { commissioned: true, fabricCount, fabrics }
    }

    // Fabric list is empty — fall back to the serverNode commissioning flag in
    // case the state is reachable but fabric enumeration didn't return rows.
    let commissioned = false
    try {
      const serverNode = this.getServerNode()
      if (serverNode) {
        const serverState = serverNode as any
        commissioned = serverState?.state?.commissioning?.commissioned === true
      }
    } catch {
      // Treat any access failure as not-commissioned.
    }
    return { commissioned, fabricCount, fabrics }
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
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error(`Failed to remove fabric ${fabricIndex}:`, error)
      throw new MatterDeviceError(`Failed to remove fabric: ${errorMessage}`, {
        originalError: error instanceof Error ? error : undefined,
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
