import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { StorageService } from './storageService.js'

describe('storageService', () => {
  let directory: string
  let storage: StorageService

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'hb-storage-service-'))
    storage = new StorageService(directory)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(directory, { recursive: true, force: true })
  })

  describe('setItemSync', () => {
    const data = [
      {
        displayName: 'Lamp',
        context: { room: 'hall', text: 'line one\nline two' },
      },
    ]

    it('writes the same bytes as before the write went through a temporary file', () => {
      storage.setItemSync('item', data)
      fs.writeJsonSync(join(directory, 'reference'), data)

      expect(readFileSync(join(directory, 'item'), 'utf-8')).toBe(readFileSync(join(directory, 'reference'), 'utf-8'))
      expect(readFileSync(join(directory, 'item'), 'utf-8')).toBe(`${JSON.stringify(data)}\n`)
    })

    it('replaces the item with a complete temporary file from the same folder', () => {
      writeFileSync(join(directory, 'item'), '["old"]\n')
      const rename = vi.spyOn(fs, 'renameSync')

      storage.setItemSync('item', data)

      expect(rename).toHaveBeenCalledTimes(1)
      const [from, to] = rename.mock.calls[0] as [string, string]
      expect(to).toBe(join(directory, 'item'))
      expect(from).toBe(join(directory, '.item.tmp'))
      expect(readdirSync(directory)).toEqual(['item'])
    })

    it('keeps the old content in full when the write fails part way', () => {
      writeFileSync(join(directory, 'item'), '["old"]\n')
      // the disk is full after the file was opened
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' })
      })

      expect(() => storage.setItemSync('item', data)).toThrow(/ENOSPC/)

      expect(readFileSync(join(directory, 'item'), 'utf-8')).toBe('["old"]\n')
      expect(readdirSync(directory)).toEqual(['item'])
    })

    it('still saves when the temporary file can not take the place of the item', () => {
      writeFileSync(join(directory, 'item'), '["old"]\n')
      vi.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' })
      })

      storage.setItemSync('item', data)

      expect(readFileSync(join(directory, 'item'), 'utf-8')).toBe(`${JSON.stringify(data)}\n`)
      expect(readdirSync(directory)).toEqual(['item'])
    })

    it('throws for data JSON can not hold, and leaves the item as it was', () => {
      writeFileSync(join(directory, 'item'), '["old"]\n')
      const circular: Record<string, unknown> = {}
      circular.self = circular

      expect(() => storage.setItemSync('item', circular)).toThrow(TypeError)

      expect(readFileSync(join(directory, 'item'), 'utf-8')).toBe('["old"]\n')
      expect(readdirSync(directory)).toEqual(['item'])
    })
  })

  describe('getItem', () => {
    it('gives null for an item that does not exist', async () => {
      await expect(storage.getItem('missing')).resolves.toBeNull()
    })

    it('reads back what setItemSync wrote', async () => {
      storage.setItemSync('item', {
        a: [1, 2, 3],
      })

      await expect(storage.getItem('item')).resolves.toEqual({
        a: [1, 2, 3],
      })
    })

    it('rejects with a SyntaxError for a file that is not JSON', async () => {
      writeFileSync(join(directory, 'item'), '[{"cut off')

      await expect(storage.getItem('item')).rejects.toBeInstanceOf(SyntaxError)
    })
  })

  describe('the other items', () => {
    it('creates the folder with initSync', () => {
      const nested = new StorageService(join(directory, 'a', 'b'))

      nested.initSync()

      expect(readdirSync(join(directory, 'a'))).toEqual(['b'])
    })

    it('copies an item with copyItem', async () => {
      storage.setItemSync('item', ['x'])

      await storage.copyItem('item', '.item.bak')

      expect(readFileSync(join(directory, '.item.bak'), 'utf-8')).toBe('["x"]\n')
    })

    it('removes an item with removeItemSync, and does not mind one that is not there', () => {
      storage.setItemSync('item', ['x'])

      storage.removeItemSync('item')
      storage.removeItemSync('item')

      expect(readdirSync(directory)).toEqual([])
    })
  })
})
