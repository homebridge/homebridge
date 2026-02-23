/* global NodeJS */

import type { Buffer } from 'node:buffer'

import { createHash } from 'node:crypto'

const validMac = /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/
const PLACEHOLDER_RE = /x/g

export type MacAddress = string

export function validMacAddress(address: string): boolean {
  return validMac.test(address)
}

export function generate(data: string | Buffer | NodeJS.TypedArray | DataView): MacAddress {
  const sha1sum = createHash('sha1')
  sha1sum.update(data)
  const s = sha1sum.digest('hex')

  let i = 0
  return 'xx:xx:xx:xx:xx:xx'.replace(PLACEHOLDER_RE, () => s[i++]).toUpperCase()
}
