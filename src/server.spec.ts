import type { MockInstance } from 'vitest'

import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import fs from 'fs-extra'
import { HAPStorage } from 'hap-nodejs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Server } from './server.js'
import { User } from './user.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe('server', () => {
  const homebridgeStorageFolder = path.resolve(__dirname, '../mock')
  const configPath = path.resolve(homebridgeStorageFolder, 'config.json')
  let consoleErrorSpy: MockInstance
  let consoleLogSpy: MockInstance

  const mockConfig = {
    bridge: {
      username: 'CC:22:3D:E3:CE:30',
      pin: '031-45-154',
      name: 'Homebridge',
      advertiser: 'ciao',
    },
    accessories: [],
    platforms: [],
  }

  beforeAll(async () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await fs.ensureDir(homebridgeStorageFolder)
    await fs.writeJson(configPath, mockConfig)
    User.setStoragePath(homebridgeStorageFolder)
    HAPStorage.setCustomStoragePath(User.persistPath())
  })

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterAll(async () => {
    await fs.remove(homebridgeStorageFolder)
    consoleErrorSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })

  it('creates an instance of the server without errors', async () => {
    const server = new Server({
      customStoragePath: homebridgeStorageFolder,
      hideQRCode: true,
    })

    expect(server).toBeInstanceOf(Server)
  })

  it('starts without errors', async () => {
    const server = new Server({
      customStoragePath: homebridgeStorageFolder,
      hideQRCode: true,
    })

    await server.start()

    expect(server).toBeInstanceOf(Server)
  })
})
