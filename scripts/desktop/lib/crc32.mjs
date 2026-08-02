/**
 * CRC-32 (IEEE 802.3), shared by the zip reader and the PNG encoder.
 */

const table = (() => {
  const values = new Int32Array(256)

  for (let i = 0; i < 256; i++) {
    let c = i
    for (let bit = 0; bit < 8; bit++) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    }
    values[i] = c
  }

  return values
})()

export function crc32(buffer) {
  let crc = -1

  for (let i = 0; i < buffer.length; i++) {
    crc = table[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8)
  }

  return (crc ^ -1) >>> 0
}
