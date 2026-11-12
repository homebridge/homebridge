import type { ServerNode } from '@matter/main'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { expect, it } from 'vitest'

import { FabricManager } from './FabricManager.js'

it('does not mistake accessories.json for paired fabrics', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-fabrics-'))
  try {
    fs.writeFileSync(path.join(dir, 'accessories.json'), JSON.stringify([
      { uuid: 'accessory' },
    ]))
    const manager = new FabricManager(() => ({ env: {}, state: {} }) as ServerNode, () => dir)
    expect(manager.getCommissioningSnapshot()).toEqual({ commissioned: false, fabricCount: 0, fabrics: [] })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

it('trusts an empty live list over stale files and commissioning flags', () => {
  const manager = new FabricManager(() => ({
    env: {},
    state: {
      operationalCredentials: { fabrics: [] },
      commissioning: { commissioned: true },
    },
  }) as unknown as ServerNode, () => undefined)
  expect(manager.isCommissioned()).toBe(false)
  expect(manager.getCommissioningSnapshot().commissioned).toBe(false)
})

it('trusts an empty native storage list over a stale commissioning flag', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-fabrics-'))
  try {
    fs.mkdirSync(path.join(dir, 'node'))
    fs.writeFileSync(path.join(dir, 'node', 'fabrics.fabrics'), '[]')
    const manager = new FabricManager(() => ({
      env: {},
      state: {
        commissioning: { commissioned: true },
      },
    }) as unknown as ServerNode, () => dir)
    expect(manager.isCommissioned()).toBe(false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
