#!/usr/bin/env node

/**
 * Generate the desktop app's icons.
 *
 * Kept as generated output rather than committed binaries: the artwork is a
 * rounded tile with a house glyph, which is a dozen straight lines, and
 * producing it here means the repository stays free of binary assets and of an
 * image-processing dependency.
 *
 * Usage: node scripts/desktop/make-icon.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

import { Canvas, encodeIco, encodePng, polygon, roundedRect, verticalGradient } from './lib/image.mjs'
import { resourcesDir } from './lib/paths.mjs'

const TILE_TOP = [0x93, 0x76, 0xFF]
const TILE_BOTTOM = [0x56, 0x3A, 0xD6]
const GLYPH = [0xFF, 0xFF, 0xFF]

// The house outline from the shell's inline SVG, in its original 32×32 space.
const HOUSE = [
  [16, 3],
  [3, 13],
  [3, 15],
  [6, 15],
  [6, 28],
  [14, 28],
  [14, 20],
  [18, 20],
  [18, 28],
  [26, 28],
  [26, 15],
  [29, 15],
  [29, 13],
]

const HOUSE_BOUNDS = { height: 25, width: 26, x: 3, y: 3 }

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

function drawIcon(size) {
  const canvas = new Canvas(size)
  const radius = size * 0.22

  canvas.fill(roundedRect(0, 0, size, size, radius), verticalGradient(TILE_TOP, TILE_BOTTOM, size))

  const scale = (size * 0.62) / HOUSE_BOUNDS.width
  const width = HOUSE_BOUNDS.width * scale
  const height = HOUSE_BOUNDS.height * scale
  const offsetX = (size - width) / 2
  const offsetY = (size - height) / 2

  const glyph = HOUSE.map(([x, y]) => [
    offsetX + (x - HOUSE_BOUNDS.x) * scale,
    offsetY + (y - HOUSE_BOUNDS.y) * scale,
  ])

  canvas.fill(polygon(glyph), () => GLYPH)

  return canvas
}

async function main() {
  await mkdir(resourcesDir, { recursive: true })

  const outputs = [
    ['icon.png', encodePng(drawIcon(512))],
    ['tray.png', encodePng(drawIcon(32))],
    ['icon.ico', encodeIco(ICO_SIZES.map(drawIcon))],
  ]

  for (const [name, data] of outputs) {
    await writeFile(join(resourcesDir, name), data)
    process.stdout.write(`[make-icon] wrote ${name} (${(data.length / 1024).toFixed(1)} KB)\n`)
  }
}

main().catch((error) => {
  process.stderr.write(`[make-icon] ${error.message}\n`)
  process.exitCode = 1
})
