'use strict'

/**
 * Follows Homebridge's log file and emits complete lines.
 *
 * `hb-service run` redirects its own stdout/stderr — and the piped output of
 * the Homebridge process it forks — into `<storagePath>/homebridge.log`, so
 * after startup almost nothing reaches the pipes the desktop app holds. Tailing
 * the file is what makes the boot screen show real progress and lets a failed
 * start explain itself.
 *
 * Polling `stat` rather than using `fs.watch` keeps behaviour identical across
 * platforms and survives the log truncation `hb-service` performs periodically.
 */

const { Buffer } = require('node:buffer')
const { EventEmitter } = require('node:events')
const { open, stat } = require('node:fs/promises')
const { StringDecoder } = require('node:string_decoder')

const DEFAULT_POLL_INTERVAL = 500
const DEFAULT_BACKFILL_BYTES = 32 * 1024
const MAX_CHUNK_BYTES = 512 * 1024

class LogTail extends EventEmitter {
  constructor(path, options = {}) {
    super()
    this.path = path
    this.pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL
    this.backfillBytes = options.backfillBytes ?? DEFAULT_BACKFILL_BYTES
    this.offset = 0
    this.timer = null
    this.reading = false
    this.started = false
    this.decoder = new StringDecoder('utf8')
    this.partial = ''
  }

  start() {
    if (this.started) {
      return
    }

    this.started = true
    this.offset = -1
    this.timer = setInterval(() => {
      void this.poll()
    }, this.pollInterval)

    // Don't let the tail timer keep the process alive on its own.
    if (typeof this.timer.unref === 'function') {
      this.timer.unref()
    }

    void this.poll()
  }

  stop() {
    this.started = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.partial = ''
  }

  async poll() {
    if (!this.started || this.reading) {
      return
    }

    this.reading = true

    try {
      const stats = await stat(this.path)

      if (this.offset === -1) {
        // First look at the file: show a little history so the boot screen is
        // not blank, but never the whole (potentially huge) log.
        this.offset = Math.max(0, stats.size - this.backfillBytes)
      } else if (stats.size < this.offset) {
        // Truncated or rotated — start over from the beginning.
        this.offset = 0
        this.partial = ''
      }

      while (this.started && stats.size > this.offset) {
        const length = Math.min(MAX_CHUNK_BYTES, stats.size - this.offset)
        const buffer = Buffer.alloc(length)
        const handle = await open(this.path, 'r')

        try {
          const { bytesRead } = await handle.read(buffer, 0, length, this.offset)
          if (bytesRead <= 0) {
            break
          }
          this.offset += bytesRead
          this.push(this.decoder.write(buffer.subarray(0, bytesRead)))
        } finally {
          await handle.close()
        }
      }
    } catch (error) {
      // The log only appears once hb-service has created the storage directory;
      // anything else is worth surfacing but must not stop the tail.
      if (error.code !== 'ENOENT') {
        this.emit('error', error)
      }
    } finally {
      this.reading = false
    }
  }

  /**
   * Split decoded text into whole lines, holding back any trailing fragment
   * until the rest of it arrives.
   */
  push(text) {
    if (!text) {
      return
    }

    const lines = (this.partial + text).split(/\r?\n/)
    this.partial = lines.pop() ?? ''

    for (const line of lines) {
      this.emit('line', line)
    }
  }
}

module.exports = { LogTail }
