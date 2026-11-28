import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from '../../logger.js'
import { parseProcStartTime, processStartTime, reclaimStaleStorageLock } from './storageLock.js'

describe('matter storage lock', () => {
  let directory: string
  const lockedAt = new Date('2026-11-10T12:00:00Z')

  /** Write the two lock files matter.js leaves behind, dated `lockedAt`. */
  function leaveLock(pid: number | string): void {
    writeFileSync(join(directory, 'matter.lock'), '')
    writeFileSync(join(directory, 'matter.pid'), `${pid} 0123456789abcdef`)
    utimesSync(join(directory, 'matter.pid'), lockedAt, lockedAt)
  }

  const lockExists = () => existsSync(join(directory, 'matter.lock')) || existsSync(join(directory, 'matter.pid'))

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'hb-matter-lock-'))
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(directory, { recursive: true, force: true })
  })

  describe('reclaimStaleStorageLock', () => {
    it('removes a lock whose process id now belongs to a process that started later', async () => {
      leaveLock(160)
      const startedLater = async () => lockedAt.getTime() + 60_000

      await expect(reclaimStaleStorageLock(directory, startedLater)).resolves.toBe(true)

      expect(lockExists()).toBe(false)
    })

    it('keeps a lock whose process was already running when it was written', async () => {
      leaveLock(160)
      const startedEarlier = async () => lockedAt.getTime() - 60_000

      await expect(reclaimStaleStorageLock(directory, startedEarlier)).resolves.toBe(false)

      expect(lockExists()).toBe(true)
    })

    it('keeps a lock whose process started within the margin of the lock time', async () => {
      leaveLock(160)

      await expect(reclaimStaleStorageLock(directory, async () => lockedAt.getTime() + 2000)).resolves.toBe(false)

      expect(lockExists()).toBe(true)
    })

    it('keeps a lock when the start time of its process can not be found', async () => {
      leaveLock(160)

      await expect(reclaimStaleStorageLock(directory, async () => undefined)).resolves.toBe(false)

      expect(lockExists()).toBe(true)
    })

    it.each([
      {
        pid: String(process.pid),
        why: 'held by this process',
      },
      { pid: 'garbage', why: 'with no usable process id' },
    ])('leaves a lock $why to matter.js', async ({ pid }) => {
      leaveLock(pid)
      const startTimeOf = vi.fn(async () => lockedAt.getTime() + 60_000)

      await expect(reclaimStaleStorageLock(directory, startTimeOf)).resolves.toBe(false)

      expect(startTimeOf).not.toHaveBeenCalled()
      expect(lockExists()).toBe(true)
    })

    it('does nothing when the folder is not locked', async () => {
      await expect(reclaimStaleStorageLock(directory, async () => Date.now())).resolves.toBe(false)
    })
  })

  describe('parseProcStartTime', () => {
    // field 22 (start time) is 12345 ticks = 123.45 s after boot
    const fieldsAfterCommand = 'S 1 160 160 0 -1 4194560 100 0 0 0 5 3 0 0 20 0 11 0 12345 1000000 500'

    it('works out the start time from the ticks since boot and the uptime', () => {
      const now = Date.parse('2026-11-10T13:00:00Z')

      // up for 1000 s, started 123.45 s after boot: 876.55 s ago
      expect(parseProcStartTime(`160 (node) ${fieldsAfterCommand}`, '1000.00 3500.12\n', now)).toBe(now - 876_550)
    })

    it('copes with spaces and brackets in the command name', () => {
      const now = Date.parse('2026-11-10T13:00:00Z')

      expect(parseProcStartTime(`160 (my (odd) name) ${fieldsAfterCommand}`, '1000.00 3500.12\n', now)).toBe(now - 876_550)
    })

    it('returns undefined for content it does not understand', () => {
      expect(parseProcStartTime('160 (node) S 1', '1000.00', Date.now())).toBeUndefined()
      expect(parseProcStartTime(`160 (node) ${fieldsAfterCommand}`, '', Date.now())).toBeUndefined()
    })
  })

  describe('processStartTime', () => {
    it('finds a start time in the past for a live process', async () => {
      const started = await processStartTime(process.pid)

      expect(started).toBeLessThanOrEqual(Date.now())
      // this test run is not hours old
      expect(started).toBeGreaterThan(Date.now() - 6 * 60 * 60 * 1000)
    })

    it('returns undefined for a process that does not exist', async () => {
      await expect(processStartTime(2 ** 30)).resolves.toBeUndefined()
    })
  })
})
