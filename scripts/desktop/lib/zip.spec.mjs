import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { crc32 } from './crc32.mjs'
import { extractZip, readZipEntries, readZipEntryData } from './zip.mjs'

const STORED = 0
const DEFLATED = 8

/**
 * Build an in-memory zip archive so the reader is exercised against structures
 * it did not produce itself.
 */
function buildZip(files) {
  const locals = []
  const centrals = []
  let offset = 0

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const raw = Buffer.from(file.data ?? '')
    const method = file.method ?? DEFLATED
    const payload = method === DEFLATED ? deflateRawSync(raw) : raw
    const checksum = file.crc32 ?? crc32(raw)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034B50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014B50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE((file.mode ?? 0) << 16, 38)
    central.writeUInt32LE(offset, 42)

    const localRecord = Buffer.concat([local, name, payload])
    locals.push(localRecord)
    centrals.push(Buffer.concat([central, name]))
    offset += localRecord.length
  }

  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, directory, end])
}

describe('zip reader', () => {
  let destination

  beforeEach(async () => {
    destination = await mkdtemp(join(tmpdir(), 'homebridge-zip-'))
  })

  afterEach(async () => {
    await rm(destination, { force: true, recursive: true })
  })

  it('lists every entry in the central directory', () => {
    const archive = buildZip([
      { name: 'a.txt', data: 'alpha' },
      { name: 'nested/', data: '' },
      { name: 'nested/b.txt', data: 'beta', method: STORED },
    ])

    expect(readZipEntries(archive).map(entry => entry.name)).toStrictEqual(['a.txt', 'nested/', 'nested/b.txt'])
  })

  it('inflates deflated and stored members alike', () => {
    const archive = buildZip([
      { name: 'deflated.txt', data: 'x'.repeat(5000) },
      { name: 'stored.txt', data: 'plain', method: STORED },
    ])
    const [deflated, stored] = readZipEntries(archive)

    expect(readZipEntryData(archive, deflated).toString()).toBe('x'.repeat(5000))
    expect(readZipEntryData(archive, stored).toString()).toBe('plain')
  })

  it('rejects a member whose checksum does not match its contents', () => {
    const archive = buildZip([{ name: 'a.txt', crc32: 1, data: 'alpha' }])
    const [entry] = readZipEntries(archive)

    expect(() => readZipEntryData(archive, entry)).toThrow(/CRC mismatch/)
  })

  it('rejects compression methods the Node.js distribution never uses', () => {
    const archive = buildZip([{ data: 'alpha', method: 12, name: 'a.txt' }])
    const [entry] = readZipEntries(archive)

    expect(() => readZipEntryData(archive, entry)).toThrow(/Unsupported zip compression method 12/)
  })

  it('rejects input that is not a zip archive', () => {
    expect(() => readZipEntries(Buffer.alloc(64))).toThrow(/end of central directory record not found/)
  })

  it('writes files and directories to disk', async () => {
    const archive = buildZip([
      { name: 'top.txt', data: 'top' },
      { name: 'nested/', data: '' },
      { name: 'nested/inner.txt', data: 'inner' },
    ])

    const written = await extractZip(archive, destination)

    expect(written).toBe(2)
    expect(await readFile(join(destination, 'top.txt'), 'utf8')).toBe('top')
    expect(await readFile(join(destination, 'nested', 'inner.txt'), 'utf8')).toBe('inner')
  })

  it('applies the rewrite hook to strip a prefix and skip entries', async () => {
    const archive = buildZip([
      { name: 'node-v22.0.0-win-x64/node.exe', data: 'binary' },
      { name: 'node-v22.0.0-win-x64/README.md', data: 'docs' },
      { name: 'unrelated.txt', data: 'skip me' },
    ])

    const written = await extractZip(archive, destination, {
      rewrite: name => (name.startsWith('node-v22.0.0-win-x64/') ? name.slice('node-v22.0.0-win-x64/'.length) : null),
    })

    expect(written).toBe(2)
    expect(await readFile(join(destination, 'node.exe'), 'utf8')).toBe('binary')
    await expect(readFile(join(destination, 'unrelated.txt'))).rejects.toThrow()
  })

  it('aborts rather than following a traversal path out of the destination', async () => {
    const archive = buildZip([{ name: '../escaped.txt', data: 'nope' }])

    await expect(extractZip(archive, destination)).rejects.toThrow(/Refusing to extract entry outside/)
  })

  it('strips the root from an absolute archive path', async () => {
    const archive = buildZip([{ name: '/etc/escaped.txt', data: 'nope' }])

    await extractZip(archive, destination)

    expect(await readFile(join(destination, 'etc', 'escaped.txt'), 'utf8')).toBe('nope')
  })
})
