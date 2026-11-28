/**
 * Clears a matter.js storage lock that is provably left over.
 *
 * matter.js locks a node's storage folder with two files, `matter.lock` and
 * `matter.pid`, and removes them when the process exits. A process that is
 * killed hard (a container stopped past its timeout, an out-of-memory kill, a
 * power cut) leaves them behind. On the next start matter.js treats the lock
 * as held whenever ANY process with the stored process id is alive. Process
 * ids are small and repeat in a container, so that id often belongs to some
 * other program by then, and Matter never starts again until the files are
 * deleted by hand (#4047).
 *
 * A process that started after the lock was written can not be the one that
 * wrote it. That is the only case handled here: the lock is removed and
 * matter.js is asked again. Anything that can not be proven is left alone.
 */

import { execFile } from 'node:child_process'
import { readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

import { Logger } from '../../logger.js'

const log = Logger.withPrefix('Matter/Server')

const LOCK_FILE = 'matter.lock'
const PID_FILE = 'matter.pid'

/** Clock ticks per second in /proc/<pid>/stat. 100 on every Linux build Node.js supports. */
const LINUX_CLOCK_TICKS = 100

/**
 * How much later than the lock a process must have started before the lock is
 * called left over. Covers the rounding of the start time (whole seconds from
 * `ps`, hundredths from /proc).
 */
const START_AFTER_LOCK_MARGIN_MS = 5000

/**
 * The start time of a process from the contents of /proc/<pid>/stat and
 * /proc/uptime (Linux), in milliseconds since the epoch.
 */
export function parseProcStartTime(procStat: string, procUptime: string, now: number): number | undefined {
  // The second field is the command in brackets and may itself hold spaces and
  // brackets, so count the fields from the last closing bracket: the field
  // after it is field 3, and the start time (in clock ticks since boot) is 22.
  const afterCommand = procStat.slice(procStat.lastIndexOf(')') + 1).trim().split(/\s+/)
  const startTicks = Number.parseFloat(afterCommand[22 - 3])
  const uptimeSeconds = Number.parseFloat(procUptime)
  if (!Number.isFinite(startTicks) || !Number.isFinite(uptimeSeconds)) {
    return undefined
  }
  return now - (uptimeSeconds - startTicks / LINUX_CLOCK_TICKS) * 1000
}

/**
 * When the process with this id started, in milliseconds since the epoch, or
 * undefined when that can not be found out.
 */
export async function processStartTime(pid: number): Promise<number | undefined> {
  try {
    const [procStat, procUptime] = await Promise.all([
      readFile(`/proc/${pid}/stat`, 'utf-8'),
      readFile('/proc/uptime', 'utf-8'),
    ])
    return parseProcStartTime(procStat, procUptime, Date.now())
  } catch {
    // no /proc (macOS, BSD): ask ps
  }

  return new Promise((resolve) => {
    execFile('ps', [
      '-o',
      'lstart=',
      '-p',
      String(pid),
    ], {
      env: { ...process.env, LC_ALL: 'C' },
      timeout: 5000,
    }, (error, stdout) => {
      const started = error
        ? Number.NaN
        : Date.parse(stdout.trim())
      resolve(Number.isFinite(started)
        ? started
        : undefined)
    })
  })
}

/**
 * Remove the storage lock in `directory` when the live process that has the
 * lock's process id started after the lock was written.
 *
 * @param directory the folder matter.js locked (a node's storage folder)
 * @param startTimeOf how to find a process's start time (injectable for tests)
 * @returns true when a lock was removed
 */
export async function reclaimStaleStorageLock(
  directory: string,
  startTimeOf: (pid: number) => Promise<number | undefined> = processStartTime,
): Promise<boolean> {
  const lockPath = join(directory, LOCK_FILE)
  const pidPath = join(directory, PID_FILE)

  let pid: number
  let lockedAt: number
  try {
    pid = Number.parseInt((await readFile(pidPath, 'utf-8')).trim().split(/\s+/)[0], 10)
    lockedAt = (await stat(pidPath)).mtimeMs
    await stat(lockPath)
  } catch {
    // no lock here, or no process id to go by: matter.js deals with that itself
    return false
  }

  // Our own id, or an id nobody has: matter.js already handles both.
  if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) {
    return false
  }

  const startedAt = await startTimeOf(pid)
  if (startedAt === undefined || startedAt <= lockedAt + START_AFTER_LOCK_MARGIN_MS) {
    return false
  }

  log.warn(
    `Removing a Matter storage lock left behind by an earlier run in ${directory}: it names process ${pid}, `
    + `but that process started at ${new Date(startedAt).toISOString()}, after the lock was written at ${new Date(lockedAt).toISOString()}. `
    + 'This happens when Homebridge was killed before it could shut down (for example a container stopped past its timeout).',
  )
  // The lock file last: it is the one matter.js goes by.
  await rm(pidPath, { force: true })
  await rm(lockPath, { force: true })
  return true
}
