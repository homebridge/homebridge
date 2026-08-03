/**
 * Tiny RGBA rasteriser plus PNG and ICO encoders.
 *
 * The desktop app needs a Windows `.ico` and a couple of PNGs, and pulling an
 * image toolchain into a project that has none for a handful of flat shapes is
 * not worth it — everything here is straight lines and a rounded rectangle.
 */

import { Buffer } from 'node:buffer'
import { deflateSync } from 'node:zlib'

import { crc32 } from './crc32.mjs'

const SUPERSAMPLE = 4

/**
 * A mutable RGBA image with straight-alpha `over` compositing.
 */
export class Canvas {
  constructor(size) {
    this.size = size
    this.data = new Uint8ClampedArray(size * size * 4)
  }

  /**
   * Blend a colour into one pixel at the given coverage (0…1).
   */
  blend(x, y, [r, g, b], coverage) {
    if (coverage <= 0) {
      return
    }

    const offset = (y * this.size + x) * 4
    const alpha = Math.min(1, coverage)
    const existing = this.data[offset + 3] / 255
    const out = alpha + existing * (1 - alpha)

    if (out <= 0) {
      return
    }

    for (let channel = 0; channel < 3; channel++) {
      const source = [r, g, b][channel]
      const destination = this.data[offset + channel]
      this.data[offset + channel] = (source * alpha + destination * existing * (1 - alpha)) / out
    }

    this.data[offset + 3] = out * 255
  }

  /**
   * Fill every pixel whose supersampled centre passes `inside`, colouring it
   * with `colourAt`. Supersampling is what gives the shapes clean edges.
   */
  fill(inside, colourAt) {
    const step = 1 / SUPERSAMPLE
    const offset = step / 2

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let hits = 0

        for (let sy = 0; sy < SUPERSAMPLE; sy++) {
          for (let sx = 0; sx < SUPERSAMPLE; sx++) {
            if (inside(x + sx * step + offset, y + sy * step + offset)) {
              hits++
            }
          }
        }

        if (hits > 0) {
          this.blend(x, y, colourAt(x, y), hits / (SUPERSAMPLE * SUPERSAMPLE))
        }
      }
    }
  }
}

/**
 * Signed-distance test for a rounded rectangle.
 */
export function roundedRect(x0, y0, x1, y1, radius) {
  return (px, py) => {
    const cx = Math.min(Math.max(px, x0 + radius), x1 - radius)
    const cy = Math.min(Math.max(py, y0 + radius), y1 - radius)
    const dx = px - cx
    const dy = py - cy

    if (px < x0 || px > x1 || py < y0 || py > y1) {
      return false
    }

    return dx * dx + dy * dy <= radius * radius
  }
}

/**
 * Even-odd point-in-polygon test for a closed polygon.
 */
export function polygon(points) {
  return (px, py) => {
    let inside = false

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i]
      const [xj, yj] = points[j]

      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
        inside = !inside
      }
    }

    return inside
  }
}

/**
 * Linear vertical gradient between two RGB colours.
 */
export function verticalGradient(top, bottom, height) {
  return (_x, y) => {
    const t = Math.min(1, Math.max(0, y / height))
    return [
      top[0] + (bottom[0] - top[0]) * t,
      top[1] + (bottom[1] - top[1]) * t,
      top[2] + (bottom[2] - top[2]) * t,
    ]
  }
}

function chunk(type, payload) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(payload.length)

  const body = Buffer.concat([Buffer.from(type, 'ascii'), payload])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))

  return Buffer.concat([length, body, checksum])
}

/**
 * Encode an RGBA canvas as a PNG (8-bit, colour type 6, no interlacing).
 */
export function encodePng(canvas) {
  const { data, size } = canvas
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)

  for (let y = 0; y < size; y++) {
    // Filter type 0 (none) — these images compress well enough without one.
    raw[y * (stride + 1)] = 0
    Buffer.from(data.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  header[10] = 0
  header[11] = 0
  header[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Encode a canvas as a 32-bit bottom-up DIB, the classic ICO payload.
 */
function encodeDib(canvas) {
  const { data, size } = canvas
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  // Height covers the colour bitmap and the (unused) AND mask.
  header.writeInt32LE(size * 2, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)

  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    const source = (size - 1 - y) * size * 4
    for (let x = 0; x < size; x++) {
      const from = source + x * 4
      const to = (y * size + x) * 4
      pixels[to] = data[from + 2]
      pixels[to + 1] = data[from + 1]
      pixels[to + 2] = data[from]
      pixels[to + 3] = data[from + 3]
    }
  }

  // 1bpp AND mask, rows padded to 4 bytes. Left zeroed: the alpha channel
  // already describes transparency for 32-bit icons.
  const maskStride = Math.ceil(size / 32) * 4
  const mask = Buffer.alloc(maskStride * size)

  return Buffer.concat([header, pixels, mask])
}

/**
 * Build a Windows .ico from several canvases.
 *
 * Sizes up to 64px are stored as DIBs and larger ones as PNGs — the layout
 * Windows itself uses, and the one every icon consumer understands.
 */
export function encodeIco(canvases) {
  const images = canvases.map((canvas) => {
    const usePng = canvas.size > 64
    return {
      size: canvas.size,
      payload: usePng ? encodePng(canvas) : encodeDib(canvas),
      usePng,
    }
  })

  const directory = Buffer.alloc(6 + images.length * 16)
  directory.writeUInt16LE(0, 0)
  directory.writeUInt16LE(1, 2)
  directory.writeUInt16LE(images.length, 4)

  let offset = directory.length

  images.forEach((image, index) => {
    const entry = 6 + index * 16
    // 256 is encoded as 0 in the single-byte dimension fields.
    directory[entry] = image.size >= 256 ? 0 : image.size
    directory[entry + 1] = image.size >= 256 ? 0 : image.size
    directory[entry + 2] = 0
    directory[entry + 3] = 0
    directory.writeUInt16LE(1, entry + 4)
    directory.writeUInt16LE(32, entry + 6)
    directory.writeUInt32LE(image.payload.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += image.payload.length
  })

  return Buffer.concat([directory, ...images.map(image => image.payload)])
}
