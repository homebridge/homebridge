/**
 * Minimal, dependency-free ZIP reader.
 *
 * The desktop build downloads the official Node.js Windows distribution, which
 * is only published as a `.zip`. Neither Node nor GNU tar can read zip archives,
 * and shelling out to `unzip` / `Expand-Archive` makes the build host-dependent,
 * so the handful of archive structures we need are parsed here instead.
 *
 * Deliberately supports only what the Node.js distribution actually uses:
 * store (0) and deflate (8), no encryption, no ZIP64. Anything else throws.
 */

import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, sep } from 'node:path'
import { inflateRawSync } from 'node:zlib'

import { crc32 } from './crc32.mjs'

const EOCD_SIGNATURE = 0x06054B50
const CENTRAL_HEADER_SIGNATURE = 0x02014B50
const LOCAL_HEADER_SIGNATURE = 0x04034B50
const EOCD_MIN_SIZE = 22
const CENTRAL_HEADER_SIZE = 46
const LOCAL_HEADER_SIZE = 30
const ZIP64_MARKER_16 = 0xFFFF
const ZIP64_MARKER_32 = 0xFFFFFFFF

/**
 * Locate the End Of Central Directory record, scanning backwards past any
 * trailing archive comment.
 */
function findEndOfCentralDirectory(buffer) {
  const earliest = Math.max(0, buffer.length - EOCD_MIN_SIZE - 0xFFFF)
  for (let offset = buffer.length - EOCD_MIN_SIZE; offset >= earliest; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset
    }
  }
  throw new Error('Not a zip archive: end of central directory record not found')
}

/**
 * Read the central directory and return one descriptor per archive member.
 */
export function readZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(eocd + 10)
  const centralDirectorySize = buffer.readUInt32LE(eocd + 12)
  const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16)

  if (entryCount === ZIP64_MARKER_16 || centralDirectorySize === ZIP64_MARKER_32 || centralDirectoryOffset === ZIP64_MARKER_32) {
    throw new Error('ZIP64 archives are not supported')
  }

  const entries = []
  let offset = centralDirectoryOffset

  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_HEADER_SIGNATURE) {
      throw new Error(`Corrupt zip archive: bad central directory header at offset ${offset}`)
    }

    const flags = buffer.readUInt16LE(offset + 8)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)

    if (flags & 0x1) {
      throw new Error('Encrypted zip archives are not supported')
    }

    entries.push({
      name: buffer.toString('utf8', offset + CENTRAL_HEADER_SIZE, offset + CENTRAL_HEADER_SIZE + nameLength),
      method: buffer.readUInt16LE(offset + 10),
      crc32: buffer.readUInt32LE(offset + 16),
      compressedSize: buffer.readUInt32LE(offset + 20),
      uncompressedSize: buffer.readUInt32LE(offset + 24),
      externalAttributes: buffer.readUInt32LE(offset + 38),
      localHeaderOffset: buffer.readUInt32LE(offset + 42),
    })

    offset += CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength
  }

  return entries
}

/**
 * Inflate a single member. Sizes come from the central directory because the
 * local header may carry zeroes when a data descriptor is used.
 */
export function readZipEntryData(buffer, entry) {
  const header = entry.localHeaderOffset
  if (buffer.readUInt32LE(header) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error(`Corrupt zip archive: bad local header for ${entry.name}`)
  }

  const nameLength = buffer.readUInt16LE(header + 26)
  const extraLength = buffer.readUInt16LE(header + 28)
  const start = header + LOCAL_HEADER_SIZE + nameLength + extraLength
  const raw = buffer.subarray(start, start + entry.compressedSize)

  let data
  switch (entry.method) {
    case 0:
      data = Buffer.from(raw)
      break
    case 8:
      data = inflateRawSync(raw)
      break
    default:
      throw new Error(`Unsupported zip compression method ${entry.method} for ${entry.name}`)
  }

  if (data.length !== entry.uncompressedSize) {
    throw new Error(`Corrupt zip archive: size mismatch for ${entry.name}`)
  }
  if (crc32(data) !== entry.crc32) {
    throw new Error(`Corrupt zip archive: CRC mismatch for ${entry.name}`)
  }

  return data
}

/**
 * Resolve an archive path inside the destination directory. A leading root or
 * drive letter is stripped; anything that still escapes — `..` traversal —
 * aborts the extraction rather than being written.
 */
function safeJoin(destination, name) {
  const relative = normalize(name).replace(/^([/\\]|[a-z]:[/\\])+/i, '')
  const target = join(destination, relative)
  if (target !== destination && !target.startsWith(destination + sep)) {
    throw new Error(`Refusing to extract entry outside of the destination: ${name}`)
  }
  return target
}

/**
 * Extract an in-memory zip archive to disk.
 *
 * @param {Buffer} buffer archive contents
 * @param {string} destination directory to extract into (created if missing)
 * @param {object} [options]
 * @param {(name: string) => string | null} [options.rewrite] maps an archive
 * path to its destination path; return `null` to skip the entry.
 * @returns {Promise<number>} the number of files written
 */
export async function extractZip(buffer, destination, options = {}) {
  const rewrite = options.rewrite ?? (name => name)
  const entries = readZipEntries(buffer)
  const createdDirectories = new Set()
  let written = 0

  for (const entry of entries) {
    const rewritten = rewrite(entry.name)
    if (rewritten === null || rewritten === '') {
      continue
    }

    const target = safeJoin(destination, rewritten)

    if (entry.name.endsWith('/')) {
      await mkdir(target, { recursive: true })
      createdDirectories.add(target)
      continue
    }

    const parent = dirname(target)
    if (!createdDirectories.has(parent)) {
      await mkdir(parent, { recursive: true })
      createdDirectories.add(parent)
    }

    // Unix permissions live in the high 16 bits of the external attributes when
    // the archive was produced on a Unix host; keep the executable bit so the
    // extracted runtime stays usable when staging on macOS/Linux.
    const unixMode = (entry.externalAttributes >>> 16) & 0o7777
    const mode = unixMode || 0o644

    await writeFile(target, readZipEntryData(buffer, entry), { mode })
    written++
  }

  return written
}
