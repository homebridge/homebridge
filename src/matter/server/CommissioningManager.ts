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
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ManualPairingCodeCodec, QrCode, QrPairingCodeCodec } from '@matter/types/schema'

import { Logger } from '../../logger.js'
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

export class CommissioningManager {
  public passcode = 0
  public discriminator = 0
  public readonly vendorId: number
  public readonly productId: number
  public commissioningInfo: CommissioningInfo = {}

  // Stored references so commissioning Observable listeners can be removed in
  // teardownCommissioningEventListeners(). matter.js Observables require the
  // exact same observer reference passed to .off() that was passed to .on().
  // Bound at registration time so each CommissioningDeps closure stays consistent.
  private onFabricsChanged: ((fabricIndex: number, action: unknown) => void) | null = null
  private onCommissioned: (() => void) | null = null
  private onDecommissioned: (() => void) | null = null

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
      if (data.passcode && data.discriminator) {
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
    await writeFile(
      credentialsPath,
      JSON.stringify({ passcode: this.passcode, discriminator: this.discriminator }, null, 2),
      'utf-8',
    )
    log.info('Commissioning credentials saved to storage')
  }

  /**
   * Generate and display commissioning information
   */
  async generateCommissioningInfo(deps: CommissioningDeps): Promise<void> {
    const passcode = this.passcode.toString().padStart(8, '0')
    const discriminator = this.discriminator
    const vendorId = this.vendorId
    const productId = this.productId

    // Use Matter.js library to generate pairing codes properly
    const manualCode = ManualPairingCodeCodec.encode({
      discriminator,
      passcode: this.passcode,
    })

    // Format as XXXX-XXX-XXXX for display
    const manualPairingCode = `${manualCode.slice(0, 4)}-${manualCode.slice(4, 7)}-${manualCode.slice(7, 11)}`

    log.info(`Encoding QR code with: passcode=${this.passcode}, discriminator=${discriminator}, vendorId=${vendorId}, productId=${productId}`)

    const qrCodePayload = QrPairingCodeCodec.encode([{
      version: 0,
      vendorId,
      productId,
      flowType: 0, // Standard commissioning flow
      discoveryCapabilities: 4, // OnNetwork=4
      discriminator,
      passcode: this.passcode,
    }])

    log.info(`Generated QR code: ${qrCodePayload}`)
    log.info(`Generated manual code: ${manualPairingCode}`)

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
      await writeFile(commissioningFilePath, JSON.stringify(commissioningData, null, 2), 'utf-8')
      log.debug(`Saved commissioning info to ${commissioningFilePath}`)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.warn(`Failed to save commissioning info to disk: ${errorMessage}`)
    }

    // Display commissioning information
    log.info(`${'='.repeat(60)}`)
    log.info('📱 MATTER COMMISSIONING INFORMATION')
    log.info('='.repeat(60))
    log.info(`Manual Pairing Code: ${manualPairingCode}`)
    log.info(`Passcode: ${passcode}`)
    log.info(`Discriminator: ${discriminator}`)
    log.info('QR Code for commissioning:')

    // Generate and display QR code in terminal using matter.js native QR renderer
    const qrCodeString = QrCode.get(qrCodePayload)
    log.info(`\n${qrCodeString}`)

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

    if (this.onFabricsChanged || this.onCommissioned || this.onDecommissioned) {
      log.debug('Commissioning event listeners already registered, skipping')
      return
    }

    log.debug('Setting up commissioning event listeners')

    try {
      // Listen for fabric changes (add/remove/update)
      this.onFabricsChanged = (fabricIndex, action) => {
        log.info(`Fabric ${action}: index ${fabricIndex}`)

        // Compute commissioning state once and reuse for both the file update
        // and the IPC emit, then push the snapshot into updateCommissioningFile
        // so it doesn't redo the same fabric reads.
        const snapshot = deps.fabricManager.getCommissioningSnapshot()
        this.updateCommissioningFile(deps, snapshot).catch((error) => {
          log.warn('Failed to update commissioning file after fabric change:', error)
        })
        deps.emitter.emit('commissioning-status-changed', snapshot.commissioned, snapshot.fabricCount)
      }
      deps.serverNode.events.commissioning.fabricsChanged.on(this.onFabricsChanged)

      // Listen for commissioning (first fabric added)
      this.onCommissioned = () => {
        log.info('Bridge commissioned')

        const snapshot = deps.fabricManager.getCommissioningSnapshot()
        this.updateCommissioningFile(deps, snapshot).catch((error) => {
          log.warn('Failed to update commissioning file after commissioning:', error)
        })
        deps.emitter.emit('commissioning-status-changed', true, snapshot.fabricCount)
      }
      deps.serverNode.events.commissioning.commissioned.on(this.onCommissioned)

      // Listen for decommissioning (last fabric removed)
      this.onDecommissioned = () => {
        log.info('Bridge decommissioned')

        this.updateCommissioningFile(deps).catch((error) => {
          log.warn('Failed to update commissioning file after decommissioning:', error)
        })
        deps.emitter.emit('commissioning-status-changed', false, 0)
      }
      deps.serverNode.events.commissioning.decommissioned.on(this.onDecommissioned)

      log.debug('Commissioning event listeners registered successfully')
    } catch (error) {
      log.error('Failed to set up commissioning event listeners:', error)
      // Roll back any partial registration so a retry can succeed
      this.teardownCommissioningEventListeners(deps.serverNode)
    }
  }

  /**
   * Remove Matter.js commissioning event listeners.
   *
   * Called from ServerLifecycle.cleanup() to release the closures that capture
   * deps (serverNode, fabricManager, emitter, matterStoragePath) and `this`.
   * Without this, the matter.js Observable retains the observer across stop()
   * cycles, holding the entire CommissioningDeps graph from GC.
   */
  teardownCommissioningEventListeners(serverNode: ServerNode | null): void {
    if (!serverNode) {
      this.onFabricsChanged = null
      this.onCommissioned = null
      this.onDecommissioned = null
      return
    }

    try {
      if (this.onFabricsChanged) {
        serverNode.events.commissioning.fabricsChanged.off(this.onFabricsChanged)
      }
      if (this.onCommissioned) {
        serverNode.events.commissioning.commissioned.off(this.onCommissioned)
      }
      if (this.onDecommissioned) {
        serverNode.events.commissioning.decommissioned.off(this.onDecommissioned)
      }
      log.debug('Commissioning event listeners removed')
    } catch (error) {
      log.debug('Error removing commissioning event listeners:', error)
    } finally {
      this.onFabricsChanged = null
      this.onCommissioned = null
      this.onDecommissioned = null
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
      await writeFile(commissioningFilePath, JSON.stringify(commissioningData, null, 2), 'utf-8')
      log.debug('Updated commissioning info file')
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.debug(`Failed to update commissioning info file: ${errorMessage}`)
    }
  }
}
