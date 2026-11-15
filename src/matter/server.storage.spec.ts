import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { User } from '../user.js'
import { MatterServer } from './server.js'

/**
 * Runs real matter.js nodes (never online: an external server does not run
 * until runServer() is called), with their storage in a temporary folder.
 */
describe('matterServer storage on real matter.js nodes', () => {
  let storageRoot: string
  let matterPath: string
  const servers: MatterServer[] = []

  beforeEach(() => {
    storageRoot = mkdtempSync(join(tmpdir(), 'hb-matter-storage-'))
    matterPath = join(storageRoot, 'matter')
    User.setStoragePath(storageRoot)
    // The servers print their pairing codes; keep the test output clean.
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(async () => {
    await Promise.allSettled(servers.splice(0).map(server => server.stop()))
    vi.restoreAllMocks()
    rmSync(storageRoot, { recursive: true, force: true })
  })

  function externalServer(uniqueId: string, port: number): MatterServer {
    const server = new MatterServer({
      port,
      uniqueId,
      storagePath: matterPath,
      displayName: uniqueId,
      serialNumber: uniqueId,
      manufacturer: 'Test',
      model: 'Test',
      externalAccessory: true,
    })
    servers.push(server)
    return server
  }

  it('keeps the node storage of two servers that start together in their own folders', async () => {
    const first = externalServer('AAAAAAAAAAAA', 55981)
    const second = externalServer('BBBBBBBBBBBB', 55982)

    await Promise.all([
      first.start(),
      second.start(),
    ])

    // matter.js stores a node under <server folder>/<node id>/
    const nodeFolders = (uniqueId: string): string[] => readdirSync(join(matterPath, uniqueId), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
    expect(nodeFolders('AAAAAAAAAAAA')).toEqual(['AAAAAAAAAAAA'])
    expect(nodeFolders('BBBBBBBBBBBB')).toEqual(['BBBBBBBBBBBB'])
  }, 30000)
})
