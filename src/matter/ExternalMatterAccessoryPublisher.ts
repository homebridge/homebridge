/**
 * External Matter Accessory Publisher
 *
 * Shared logic for publishing external Matter accessories on dedicated bridges.
 * Used by both MatterBridgeManager and ChildBridgeMatterManager to avoid code duplication.
 */

import type { InternalMatterAccessory } from './types.js'

import { Logger } from '../logger.js'
import { User } from '../user.js'
import { generate } from '../util/mac.js'
import { MatterServer } from './server.js'

const log = Logger.withPrefix('Matter/External')
const COLON_RE = /:/g

/**
 * Configuration context for publishing external Matter accessories
 */
export interface ExternalAccessoryPublishContext {
  /** Port service for allocating Matter ports */
  portService: {
    requestMatterPort: (uniqueId: string) => Promise<number | null | undefined>
    releaseMatterPort?: (uniqueId: string) => boolean
  }
  /** Network interfaces to bind to (from bridge config) */
  networkInterfaces?: string[]
  /** Whether debug mode is enabled */
  debugModeEnabled?: boolean
}

/**
 * Result of publishing an external Matter accessory
 */
export interface PublishedExternalAccessory {
  /** The MatterServer instance for this accessory */
  server: MatterServer
  /** Port the server is running on */
  port: number
  /** Username (MAC address) of the external Matter bridge */
  username: string
  /** Commissioning information */
  commissioningInfo: {
    qrCode?: string
    manualPairingCode?: string
    serialNumber?: string
    commissioned: boolean
  }
}

/**
 * Publish an external Matter accessory on its own dedicated Matter server.
 * This is required for devices like Robotic Vacuum Cleaners that Apple Home
 * requires to be on their own bridge.
 *
 * @param accessory - The Matter accessory to publish
 * @param context - Configuration context for publishing
 * @returns Published accessory info, or null if publishing failed
 */
export async function publishExternalMatterAccessory(
  accessory: InternalMatterAccessory,
  context: ExternalAccessoryPublishContext,
): Promise<PublishedExternalAccessory | null> {
  // Validate accessory has required fields
  if (!accessory.UUID) {
    log.error('External Matter accessory missing UUID - skipping')
    return null
  }

  if (!accessory.displayName) {
    log.error(`External Matter accessory ${accessory.UUID} missing displayName - skipping`)
    return null
  }

  // Generate deterministic MAC address from UUID (same pattern as HAP external accessories)
  const advertiseAddress = generate(accessory.UUID)

  // For Matter, use the MAC without colons as uniqueId
  const uniqueId = advertiseAddress.replace(COLON_RE, '')

  // Allocate Matter port for the external Matter server
  const port = await context.portService.requestMatterPort(uniqueId)
  if (!port) {
    log.error(`Failed to allocate Matter port for external Matter accessory ${accessory.displayName}`)
    log.error('Please configure matterPorts in config.json or free up ports in the default range (5530-5541)')
    return null
  }

  log.info(`Allocated port ${port} for external Matter accessory: ${accessory.displayName}`)

  // Create dedicated Matter server for this accessory
  const matterServer = new MatterServer({
    port,
    uniqueId,
    storagePath: User.matterPath(),
    displayName: accessory.displayName || 'Matter Device',
    manufacturer: accessory.manufacturer,
    model: accessory.model,
    firmwareRevision: accessory.firmwareRevision,
    serialNumber: accessory.serialNumber || uniqueId, // use uniqueId as fallback serial number
    debugModeEnabled: context.debugModeEnabled,
    externalAccessory: true, // external accessory, added before server runs
    networkInterfaces: context.networkInterfaces,
  })

  let started = false
  try {
    // Start the Matter server (but don't run it yet due to externalAccessory mode)
    await matterServer.start()
    started = true

    // Get plugin identifier from accessory
    const pluginIdentifier = accessory._associatedPlugin || 'unknown'

    // Register the accessory to this dedicated server
    await matterServer.registerPlatformAccessories(pluginIdentifier, 'ExternalMatter', [accessory])

    // Now run the server with the device already attached (required for external accessories)
    await matterServer.runServer()
  } catch (error) {
    // Tear down the half-started server so we don't leak SIGINT/SIGTERM
    // handlers, an open mDNS responder, and the matter.js event loop.
    // Only release the port back to the allocator when we *know* the
    // server isn't holding it any more — otherwise the allocator can
    // hand the same port to a subsequent publish attempt and we hit
    // EADDRINUSE. Two safe cases:
    //   - start() never completed (port wasn't bound)
    //   - start() completed AND stop() then completed cleanly
    let portReleasable = !started
    if (started) {
      try {
        await matterServer.stop()
        portReleasable = true
      } catch (stopError) {
        log.debug(`Failed to stop partially-started Matter server for ${accessory.displayName}:`, stopError)
      }
    } else if ((error as { portMayStillBeBound?: boolean } | undefined)?.portMayStillBeBound) {
      // start() failed, but its internal cleanup could not close the
      // half-built server node (ServerLifecycle flagged it), so the port may
      // still be bound. Keep it reserved rather than risk EADDRINUSE on reuse.
      portReleasable = false
    }
    // Hand the port back to the allocator so it can be reused on the next
    // publish attempt — without this, a single publish failure would
    // permanently consume one slot in the Matter port range.
    if (portReleasable) {
      context.portService.releaseMatterPort?.(uniqueId)
    } else {
      // The matter.js server may still be bound to the port (stop() failed, or
      // start()'s internal cleanup couldn't close the half-built node), so we
      // can't safely hand it back. The slot stays consumed until the process
      // restarts — warn so operators can see a port was lost rather than
      // silently shrinking the pool.
      log.warn(`Leaving Matter port ${port} reserved for ${accessory.displayName} — the matter.js server may still be bound. This port stays unavailable until Homebridge restarts.`)
    }
    throw error
  }

  log.info(`✓ External Matter accessory published: ${accessory.displayName} on port ${port} (bridge ${advertiseAddress})`)

  // Get commissioning info
  const commissioningInfo = matterServer.getCommissioningInfo()

  return {
    server: matterServer,
    port,
    username: advertiseAddress,
    commissioningInfo,
  }
}
