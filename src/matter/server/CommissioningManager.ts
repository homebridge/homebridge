/**
 * Commissioning Manager
 *
 * Handles passcode generation, discriminator generation, credential persistence,
 * QR code rendering, commissioning event listeners, and commissioning file updates.
 */

import type { ServerNode } from '@matter/main'
import type { EventEmitter } from 'node:events'

import type { MatterServerConfig } from '../sharedTypes.js'
import type { CommissioningSnapshot, FabricManager } from './FabricManager.js'

import { randomBytes } from 'node:crypto'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ObserverGroup } from '@matter/main'
import { SubscriptionsServer } from '@matter/node'
import { QrCode } from '@matter/types/schema'

import { Logger } from '../../logger.js'
import { MatterDeviceError } from '../types.js'
import { DEFAULT_PRODUCT_ID, DEFAULT_VENDOR_ID, MAX_PASSCODE_ATTEMPTS } from './ServerConfig.js'

const log = Logger.withPrefix('Matter/Server')

export interface CommissioningInfo {
  qrCode?: string
  manualPairingCode?: string
  qrCodeUrl?: string
}

export interface CommissioningDeps {
  config: MatterServerConfig
  serverNode: ServerNode | null
  matterStoragePath?: string
  serialNumber?: string
  emitter: EventEmitter
  fabricManager: FabricManager
}

/**
 * Write a file that holds the pairing passcode: readable by the Homebridge
 * user only, and swapped into place in one step so a reader (the UI) never
 * sees half of it. The rename also replaces an older, world-readable file.
 */
async function writePrivateFile(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, content, { encoding: 'utf-8', mode: 0o600 })
  await rename(temporaryPath, path)
}

export class CommissioningManager {
  public passcode = 0
  public discriminator = 0
  public readonly vendorId: number
  public readonly productId: number
  public commissioningInfo: CommissioningInfo = {}

  // The commissioning listeners, held as a group so cleanup can remove them in
  // one go and release what they capture (the node, the fabric manager, the emitter).
  private readonly observers = new ObserverGroup()
  private listening = false

  constructor() {
    this.vendorId = DEFAULT_VENDOR_ID
    this.productId = DEFAULT_PRODUCT_ID
  }

  /**
   * Generate a secure random passcode
   * According to Matter spec, passcode must be:
   * - 8 digits (00000001 to 99999998)
   * - Not in the invalid list
   * - Not sequential or repeating patterns
   */
  generateSecurePasscode(): number {
    let passcode: number
    const maxAttempts = MAX_PASSCODE_ATTEMPTS
    let attempts = 0

    const invalidPasscodes = [
      0,
      11111111,
      22222222,
      33333333,
      44444444,
      55555555,
      66666666,
      77777777,
      88888888,
      99999999,
      12345678,
      87654321,
    ]

    do {
      // Use cryptographically secure random number generation with rejection sampling
      const maxRange = 99999998
      const maxUint32 = 0xFFFFFFFF
      const limit = Math.floor(maxUint32 / maxRange) * maxRange

      let randomValue: number
      do {
        randomValue = randomBytes(4).readUInt32BE(0)
      } while (randomValue >= limit)

      // Generate a value between 1 and 99999998 without modulo bias
      passcode = (randomValue % maxRange) + 1

      attempts++
      if (attempts > maxAttempts) {
        throw new Error('Failed to generate secure passcode after maximum attempts')
      }
    } while (
      invalidPasscodes.includes(passcode)
      || !this.isValidPasscode(passcode)
    )

    return passcode
  }

  /**
   * Validate a passcode according to Matter specifications
   */
  isValidPasscode(passcode: number): boolean {
    // Must be between 1 and 99999998
    if (passcode < 1 || passcode > 99999998) {
      return false
    }

    // Convert to 8-digit string
    const passcodeStr = passcode.toString().padStart(8, '0')

    // Check for sequential patterns (12345678, 23456789, etc.)
    let isSequential = true
    for (let i = 1; i < passcodeStr.length; i++) {
      if (Number.parseInt(passcodeStr[i]) !== Number.parseInt(passcodeStr[i - 1]) + 1) {
        isSequential = false
        break
      }
    }
    if (isSequential) {
      return false
    }

    // Check for reverse sequential (87654321, 76543210, etc.)
    let isReverseSequential = true
    for (let i = 1; i < passcodeStr.length; i++) {
      if (Number.parseInt(passcodeStr[i]) !== Number.parseInt(passcodeStr[i - 1]) - 1) {
        isReverseSequential = false
        break
      }
    }
    if (isReverseSequential) {
      return false
    }

    // Check for too many repeating digits (more than 3 of same digit)
    const digitCounts = new Map<string, number>()
    for (const digit of passcodeStr) {
      digitCounts.set(digit, (digitCounts.get(digit) || 0) + 1)
      const count = digitCounts.get(digit)
      if (count !== undefined && count > 3) {
        return false
      }
    }

    return true
  }

  /**
   * Generate a random discriminator
   * According to Matter spec, discriminator must be:
   * - 12 bits (0-4095)
   * - Should be random for security
   */
  generateRandomDiscriminator(): number {
    // Generate cryptographically secure random 12-bit discriminator (0-4095)
    const discriminator = randomBytes(2).readUInt16BE(0) & 0x0FFF // Mask to 12 bits

    // Validate discriminator range
    if (discriminator < 0 || discriminator > 4095) {
      throw new Error(`Invalid discriminator generated: ${discriminator}`)
    }

    return discriminator
  }

  /**
   * Load or generate commissioning credentials (passcode and discriminator)
   * Reads/writes a simple credentials.json file in the bridge storage directory.
   */
  async loadOrGenerateCredentials(matterStoragePath: string): Promise<void> {
    const credentialsPath = join(matterStoragePath, 'credentials.json')

    try {
      const { readFile } = await import('node:fs/promises')
      const data = JSON.parse(await readFile(credentialsPath, 'utf-8'))
      if (
        Number.isInteger(data.passcode)
        && this.isValidPasscode(data.passcode)
        && Number.isInteger(data.discriminator)
        && data.discriminator >= 0
        && data.discriminator <= 4095
      ) {
        log.info('Loading existing commissioning credentials from storage')
        this.passcode = data.passcode
        this.discriminator = data.discriminator
        return
      }
    } catch {
      // File doesn't exist or is invalid - generate new credentials
    }

    // Generate new credentials and store them
    log.info('Generating new commissioning credentials')
    this.passcode = this.generateSecurePasscode()
    this.discriminator = this.generateRandomDiscriminator()

    // Store for future use
    await writePrivateFile(credentialsPath, JSON.stringify({ passcode: this.passcode, discriminator: this.discriminator }, null, 2))
    log.info('Commissioning credentials saved to storage')
  }

  /**
   * Generate and display commissioning information
   */
  async generateCommissioningInfo(deps: CommissioningDeps): Promise<void> {
    if (!deps.serverNode) {
      throw new MatterDeviceError('The pairing codes can only be read once the Matter server node exists')
    }

    // matter.js builds both codes from the node's own passcode, discriminator,
    // vendor id and product id, so they can not drift from what it advertises.
    const { manualPairingCode: manualCode, qrPairingCode: qrCodePayload } = deps.serverNode.state.commissioning.pairingCodes

    // Format as XXXX-XXX-XXXX for display
    const manualPairingCode = `${manualCode.slice(0, 4)}-${manualCode.slice(4, 7)}-${manualCode.slice(7, 11)}`

    // Store commissioning info
    this.commissioningInfo = {
      qrCode: qrCodePayload,
      manualPairingCode,
    }

    // Save commissioning info to disk for UI access
    try {
      if (!deps.matterStoragePath) {
        throw new Error('Matter storage path not initialized')
      }
      const commissioningFilePath = join(deps.matterStoragePath, 'commissioning.json')
      const commissioningData = {
        qrCode: qrCodePayload,
        manualPairingCode,
        serialNumber: deps.serialNumber,
        passcode: this.passcode,
        discriminator: this.discriminator,
        commissioned: deps.fabricManager.isCommissioned(),
      }
      await writePrivateFile(commissioningFilePath, JSON.stringify(commissioningData, null, 2))
      log.debug(`Saved commissioning info to ${commissioningFilePath}`)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error)
      log.warn(`Failed to save commissioning info to disk: ${errorMessage}`)
    }

    // The pairing codes let anybody on the network add this bridge, and logs
    // get shared. So they are shown in one place only, and only while there is
    // something to pair: a bridge that already has a controller says so in one
    // line. The codes stay available in the Homebridge UI either way.
    if (deps.fabricManager.isCommissioned()) {
      log.info('Matter is paired with a controller. The pairing codes are not shown; find them in the Homebridge UI.')
      return
    }

    log.info(`${'='.repeat(60)}`)
    log.info('📱 MATTER COMMISSIONING INFORMATION')
    log.info('='.repeat(60))
    log.info(`Manual Pairing Code: ${manualPairingCode}`)

    // -Q / --no-qrcode: no QR code in the log, as for HomeKit
    if (!deps.config.hideQRCode) {
      log.info('QR Code for commissioning:')

      // Generate and display QR code in terminal using matter.js native QR renderer
      const qrCodeString = QrCode.get(qrCodePayload)
      log.info(`\n${qrCodeString}`)
    }

    log.info(`${'='.repeat(60)}`)
  }

  /**
   * Set up Matter.js commissioning event listeners
   */
  setupCommissioningEventListeners(deps: CommissioningDeps): void {
    if (!deps.serverNode) {
      log.warn('Cannot set up commissioning event listeners - serverNode not initialized')
      return
    }

    if (this.listening) {
      log.debug('Commissioning event listeners already registered, skipping')
      return
    }

    log.debug('Setting up commissioning event listeners')

    try {
      const events = deps.serverNode.events.commissioning

      // Every fabric change (added, removed, updated). matter.js raises this
      // after it has updated its fabric list, and after `commissioned` or
      // `decommissioned` for the first and the last fabric, so this is the one
      // place that saves the new state and tells the UI. Doing it from the
      // other two events as well wrote the file twice at the same moment and
      // told the UI twice.
      this.observers.on(events.fabricsChanged, (fabricIndex, action) => {
        log.info(`Fabric ${action}: index ${fabricIndex}`)

        if (action === 'deleted') {
          this.purgeSubscriptionsForFabric(deps.serverNode, fabricIndex).catch((error) => {
            log.debug(`Failed to purge persisted subscriptions for removed fabric ${fabricIndex}:`, error)
          })
        }

        const snapshot = deps.fabricManager.getCommissioningSnapshot()
        this.updateCommissioningFile(deps, snapshot).catch((error) => {
          log.warn('Failed to update commissioning file after fabric change:', error)
        })
        deps.emitter.emit('commissioning-status-changed', snapshot.commissioned, snapshot.fabricCount)
      })
      this.observers.on(events.commissioned, () => log.info('Bridge commissioned'))
      this.observers.on(events.decommissioned, () => log.info('Bridge decommissioned'))
      this.listening = true

      log.debug('Commissioning event listeners registered successfully')
    } catch (error) {
      log.error('Failed to set up commissioning event listeners:', error)
      // Roll back any partial registration so a retry can succeed
      this.teardownCommissioningEventListeners()
    }
  }

  /**
   * Delete persisted subscriptions belonging to a removed fabric.
   *
   * matter.js persists controller subscriptions so it can proactively
   * re-establish them when the node next comes online (a single pass with a
   * short, no-retry connection timeout per peer). It removes the fabric's
   * sessions on removal but leaves the persisted subscription entries behind,
   * so re-establishment wastes its window on peers that can never answer
   * ("Failed to connect to ... Fabric index #N does not exist").
   */
  private async purgeSubscriptionsForFabric(serverNode: ServerNode | null, fabricIndex: number): Promise<void> {
    if (!serverNode) {
      return
    }

    await serverNode.act((agent) => {
      const subscriptions = agent.get(SubscriptionsServer)
      const remaining = subscriptions.state.subscriptions.filter(
        subscription => subscription.peerAddress.fabricIndex !== fabricIndex,
      )
      const purged = subscriptions.state.subscriptions.length - remaining.length
      if (purged > 0) {
        subscriptions.state.subscriptions = remaining
        log.debug(`Purged ${purged} persisted subscription(s) for removed fabric ${fabricIndex}`)
      }
    })
  }

  /**
   * Remove Matter.js commissioning event listeners.
   *
   * Called from ServerLifecycle.cleanup() to release the closures that capture
   * deps (serverNode, fabricManager, emitter, matterStoragePath) and `this`.
   * Without this, the matter.js Observable retains the observer across stop()
   * cycles, holding the entire CommissioningDeps graph from GC.
   */
  teardownCommissioningEventListeners(): void {
    try {
      this.observers.close()
      log.debug('Commissioning event listeners removed')
    } catch (error) {
      log.debug('Error removing commissioning event listeners:', error)
    } finally {
      this.listening = false
    }
  }

  /**
   * Update commissioning info file when commissioning state changes.
   *
   * Pass a precomputed `snapshot` to avoid redundant fabric reads — each of
   * isCommissioned(), getCommissionedFabricCount(), and getFabricInfo() may
   * scan the matter storage directory synchronously, and they're called in
   * tight succession from the commissioning event handlers.
   */
  async updateCommissioningFile(deps: CommissioningDeps, snapshot?: CommissioningSnapshot): Promise<void> {
    try {
      if (!deps.matterStoragePath) {
        return
      }

      const { commissioned, fabricCount, fabrics } = snapshot ?? deps.fabricManager.getCommissioningSnapshot()

      const commissioningFilePath = join(deps.matterStoragePath, 'commissioning.json')
      const commissioningData = {
        qrCode: this.commissioningInfo.qrCode,
        manualPairingCode: this.commissioningInfo.manualPairingCode,
        serialNumber: deps.serialNumber,
        passcode: this.passcode,
        discriminator: this.discriminator,
        commissioned,
        fabricCount,
        fabrics,
      }
      await writePrivateFile(commissioningFilePath, JSON.stringify(commissioningData, null, 2))
      log.debug('Updated commissioning info file')
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error)
      log.debug(`Failed to update commissioning info file: ${errorMessage}`)
    }
  }
}
