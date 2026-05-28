/**
 * Child Bridge Matter Message Handler
 *
 * Handles Matter-related message processing for child bridges.
 * Extracted from childBridgeFork.ts to minimize changes to core files.
 */

import type { ChildBridgeMatterManager } from './ChildBridgeMatterManager.js'
import type { MatterEvent } from './ipc-types.js'

import { Logger } from '../logger.js'
// Import the routing sentinel from the lightweight module so this file
// stays free of transitive runtime `@matter/*` imports (see
// matterLazyLoading.spec.ts and CLAUDE.md). `./types.js` would load
// `@matter/main/clusters/*` at runtime; `./MatterError.js` does not.
import { MatterAccessoryNotOnBridgeError } from './MatterError.js'

const log = Logger.withPrefix('Matter/ChildMessageHandler')

/**
 * Matter message handler for child bridge processes
 * Provides methods to handle Matter-specific requests from the parent process
 */
export class ChildBridgeMatterMessageHandler {
  constructor(
    private matterManager: ChildBridgeMatterManager | undefined,
    private bridgeUsername: string,
    private sendMessage: (type: string, data: unknown) => void,
  ) {}

  /**
   * Handle start Matter monitoring request from parent process
   */
  handleStartMatterMonitoring(): void {
    if (this.matterManager?.hasActiveMatter()) {
      this.matterManager.enableStateMonitoring()
    }
  }

  /**
   * Handle stop Matter monitoring request from parent process
   */
  handleStopMatterMonitoring(): void {
    if (this.matterManager?.hasActiveMatter()) {
      this.matterManager.disableStateMonitoring()
    }
  }

  /**
   * Handle get Matter accessories request from parent process
   */
  handleGetMatterAccessories(data?: { correlationId?: string }): void {
    log.debug(`handleGetMatterAccessories called for bridge ${this.bridgeUsername}`)
    const correlationId = data?.correlationId
    try {
      // Only collect accessories if Matter is actually enabled for this bridge
      if (!this.matterManager?.hasActiveMatter()) {
        log.debug('Matter not enabled, returning empty accessories list')
        // Return empty accessories list for bridges without Matter
        const event: MatterEvent = {
          type: 'accessoriesData',
          correlationId,
          data: {
            bridgeUsername: this.bridgeUsername,
            accessories: [],
          },
        }
        this.sendMessage('matterEvent', event)
        return
      }

      const accessories = this.matterManager.collectAllAccessories()
      log.debug(`Collected ${accessories.length} accessories from child bridge`)

      const event: MatterEvent = {
        type: 'accessoriesData',
        correlationId,
        data: {
          bridgeUsername: this.bridgeUsername,
          accessories,
        },
      }
      this.sendMessage('matterEvent', event)
    } catch (error) {
      log.error('Failed to get Matter accessories:', error)
      const event: MatterEvent = {
        type: 'accessoriesData',
        correlationId,
        data: {
          bridgeUsername: this.bridgeUsername,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }
      this.sendMessage('matterEvent', event)
    }
  }

  /**
   * Handle get Matter accessory info request from parent process
   */
  handleGetMatterAccessoryInfo(data: { uuid: string, correlationId?: string }): void {
    const correlationId = data?.correlationId
    try {
      // Only process if Matter is enabled for this bridge
      if (!this.matterManager?.hasActiveMatter()) {
        // Don't send a response - let parent handle timeout or try other bridges
        return
      }

      const accessoryInfo = this.matterManager.getAccessoryInfo(data.uuid)

      if (accessoryInfo) {
        const event: MatterEvent = {
          type: 'accessoryInfoData',
          correlationId,
          data: accessoryInfo,
        }
        this.sendMessage('matterEvent', event)
      }
      // If not found, don't send a response - let parent handle timeout
    } catch (error) {
      log.error('Failed to get Matter accessory info:', error)
      // Include uuid in the error payload so the parent server can correlate
      // the response and cancel its pending fallback timer for this lookup.
      const event: MatterEvent = {
        type: 'accessoryInfoData',
        correlationId,
        data: {
          uuid: data?.uuid,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }
      this.sendMessage('matterEvent', event)
    }
  }

  /**
   * Handle Matter accessory control request from parent process
   */
  handleMatterAccessoryControl(data: {
    uuid: string
    cluster: string
    attributes: Record<string, unknown>
    partId?: string
    correlationId?: string
  }): void {
    const correlationId = data?.correlationId
    // Only process if Matter is enabled for this bridge
    if (!this.matterManager?.hasActiveMatter()) {
      // Silently ignore - this bridge doesn't have Matter enabled
      log.debug(`Ignoring Matter control for ${data.uuid} - Matter not enabled on child bridge ${this.bridgeUsername}`)
      return
    }

    log.debug(`Matter control request for child bridge ${this.bridgeUsername}: uuid=${data.uuid}, cluster=${data.cluster}, part=${data.partId || 'main'}`)

    this.matterManager.handleTriggerCommand(data.uuid, data.cluster, data.attributes, data.partId)
      .then(() => {
        log.debug(`Successfully controlled accessory ${data.uuid} on child bridge ${this.bridgeUsername}`)

        // Send control response
        const controlResponse: MatterEvent = {
          type: 'accessoryControlResponse',
          correlationId,
          data: {
            success: true,
            uuid: data.uuid,
          },
        }
        this.sendMessage('matterEvent', controlResponse)
      })
      .catch((error) => {
        // Silently ignore if this bridge doesn't own the accessory — the
        // parent broadcasts to all matter children, so a "wrong bridge"
        // here is expected, not a real failure.
        if (error instanceof MatterAccessoryNotOnBridgeError) {
          log.debug(`Accessory ${data.uuid} not on child bridge ${this.bridgeUsername}, ignoring`)
          return
        }
        log.error(`Failed to control ${data.uuid} on child bridge ${this.bridgeUsername}: ${error.message}`)
        const event: MatterEvent = {
          type: 'accessoryControlResponse',
          correlationId,
          data: {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            uuid: data.uuid,
          },
        }
        this.sendMessage('matterEvent', event)
      })
  }
}
