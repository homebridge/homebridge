import { describe, expect, it } from 'vitest'

import { Plugin } from './plugin.js'

/**
 * Unit tests for the diagnostic improvements to the
 * "does not export an initializer function" error path.
 *
 * The Plugin class hard-fails when the imported module's default export
 * is not a function (and there's no \`default.default\` either). The error
 * message used to read just "does not export an initializer function" —
 * we now include the type and a short list of the keys we did find, so
 * authors can spot ESM/CJS shape mismatches at a glance.
 */
describe('plugin', () => {
  describe('initializer-not-found error', () => {
    /**
     * Build a Plugin instance whose disk-read imports a module that has the
     * wrong export shape. We do this by writing a tiny ESM module to a temp
     * file and pointing the Plugin at it via a faked package.json.
     */
    async function probeError(makeMain: () => Promise<string>): Promise<string> {
      const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const dir = mkdtempSync(join(tmpdir(), 'homebridge-plugin-spec-'))
      try {
        const mainFile = 'main.mjs'
        writeFileSync(join(dir, mainFile), await makeMain(), 'utf-8')
        const plugin = new Plugin(
          'homebridge-shape-mismatch',
          dir,
          {
            name: 'homebridge-shape-mismatch',
            version: '1.0.0',
            main: mainFile,
            engines: { homebridge: '>=2.0.0' },
          } as any,
        )
        try {
          await plugin.load()
          throw new Error('expected plugin.load to reject')
        } catch (err: any) {
          return String(err?.message ?? err)
        }
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }

    it('mentions the type and named exports of an object-with-wrong-shape default', async () => {
      const message = await probeError(async () =>
        // Default-export a plain object (no callable). Add a couple of named
        // exports too so we exercise both paths in the diagnostic.
        'export default { foo: 1, bar: 2 }\nexport const init = () => {}\nexport const setup = () => {}\n',
      )

      // The error must mention what was actually exported, not just the
      // generic "does not export an initializer function" line.
      expect(message).toMatch(/does not export an initializer function/i)
      expect(message).toMatch(/type 'object'/i)
      expect(message).toMatch(/keys \[foo, bar\]/i)
      expect(message).toMatch(/named exports: \[init, setup\]/i)
    })

    it('mentions the type for a primitive default', async () => {
      const message = await probeError(async () =>
        'export default 42\n',
      )

      expect(message).toMatch(/does not export an initializer function/i)
      expect(message).toMatch(/type 'number'/i)
    })
  })
})
