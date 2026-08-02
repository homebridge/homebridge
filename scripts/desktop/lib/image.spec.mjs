import { Buffer } from 'node:buffer'
import { inflateSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { crc32 } from './crc32.mjs'
import { Canvas, encodeIco, encodePng, polygon, roundedRect, verticalGradient } from './image.mjs'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

/** Walk a PNG's chunk list, verifying each chunk's CRC as it goes. */
function readChunks(png) {
  expect(png.subarray(0, 8)).toStrictEqual(PNG_MAGIC)

  const chunks = []
  let offset = 8

  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    const body = png.subarray(offset + 8, offset + 8 + length)
    const checksum = png.readUInt32BE(offset + 8 + length)

    expect(crc32(png.subarray(offset + 4, offset + 8 + length))).toBe(checksum)

    chunks.push({ body, type })
    offset += 12 + length
  }

  return chunks
}

function solidCanvas(size, colour) {
  const canvas = new Canvas(size)
  canvas.fill(() => true, () => colour)
  return canvas
}

describe('pNG encoder', () => {
  it('produces a well-formed image with matching dimensions', () => {
    const chunks = readChunks(encodePng(solidCanvas(4, [255, 0, 0])))

    expect(chunks.map(chunk => chunk.type)).toStrictEqual(['IHDR', 'IDAT', 'IEND'])

    const header = chunks[0].body
    expect(header.readUInt32BE(0)).toBe(4)
    expect(header.readUInt32BE(4)).toBe(4)
    // 8-bit RGBA, no interlacing.
    expect([header[8], header[9], header[12]]).toStrictEqual([8, 6, 0])
  })

  it('round-trips pixel data through the IDAT stream', () => {
    const chunks = readChunks(encodePng(solidCanvas(2, [10, 20, 30])))
    const raw = inflateSync(chunks[1].body)

    // Two rows of two RGBA pixels, each row prefixed with filter type 0.
    expect(raw.length).toBe(2 * (1 + 2 * 4))
    expect(raw[0]).toBe(0)
    expect([...raw.subarray(1, 5)]).toStrictEqual([10, 20, 30, 255])
  })
})

describe('iCO encoder', () => {
  const sizes = [16, 64, 256]
  const ico = encodeIco(sizes.map(size => solidCanvas(size, [120, 90, 255])))

  it('describes every image in its directory', () => {
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(sizes.length)

    sizes.forEach((size, index) => {
      const entry = 6 + index * 16
      // 256 is stored as 0 in the single-byte dimension fields.
      expect(ico[entry]).toBe(size >= 256 ? 0 : size)
      expect(ico.readUInt16LE(entry + 6)).toBe(32)
    })
  })

  it('keeps every payload inside the file', () => {
    sizes.forEach((size, index) => {
      const entry = 6 + index * 16
      const length = ico.readUInt32LE(entry + 8)
      const offset = ico.readUInt32LE(entry + 12)

      expect(offset).toBeGreaterThanOrEqual(6 + sizes.length * 16)
      expect(offset + length).toBeLessThanOrEqual(ico.length)
    })
  })

  it('stores small images as DIBs and large ones as PNGs', () => {
    const payloadAt = (index) => {
      const entry = 6 + index * 16
      const offset = ico.readUInt32LE(entry + 12)
      return ico.subarray(offset, offset + ico.readUInt32LE(entry + 8))
    }

    // BITMAPINFOHEADER, with the doubled height that ICO requires.
    expect(payloadAt(0).readUInt32LE(0)).toBe(40)
    expect(payloadAt(0).readInt32LE(4)).toBe(16)
    expect(payloadAt(0).readInt32LE(8)).toBe(32)

    expect(payloadAt(1).readUInt32LE(0)).toBe(40)
    expect(payloadAt(2).subarray(0, 8)).toStrictEqual(PNG_MAGIC)
  })
})

describe('rasteriser', () => {
  it('antialiases the corners of a rounded rectangle', () => {
    const canvas = new Canvas(16)
    canvas.fill(roundedRect(0, 0, 16, 16, 6), () => [255, 255, 255])

    const alphaAt = (x, y) => canvas.data[(y * 16 + x) * 4 + 3]

    expect(alphaAt(8, 8)).toBe(255)
    // The extreme corner falls outside the radius, and the pixel the arc runs
    // through is only partially covered.
    expect(alphaAt(0, 0)).toBe(0)
    expect(alphaAt(1, 1)).toBeGreaterThan(0)
    expect(alphaAt(1, 1)).toBeLessThan(255)
  })

  it('fills a polygon using an even-odd test', () => {
    const canvas = new Canvas(10)
    canvas.fill(polygon([[0, 0], [10, 0], [10, 10], [0, 10]]), () => [1, 2, 3])

    expect([...canvas.data.subarray(0, 4)]).toStrictEqual([1, 2, 3, 255])
  })

  it('interpolates a vertical gradient across the canvas', () => {
    const gradient = verticalGradient([0, 0, 0], [255, 255, 255], 10)

    expect(gradient(0, 0)).toStrictEqual([0, 0, 0])
    expect(gradient(0, 10)).toStrictEqual([255, 255, 255])
    expect(gradient(0, 5)[0]).toBeCloseTo(127.5)
  })
})
