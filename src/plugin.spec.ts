import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from './logger.js'
import { Plugin } from './plugin.js'
import getVersion from './version.js'

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

  /**
   * A plugin folder on disk with the given package.json fields and files.
   * Returns the loaded Plugin, after calling its initializer.
   */
  async function loadPluginFrom(packageJSON: Record<string, unknown>, files: Record<string, string>): Promise<{ plugin: Plugin, initialized: unknown }> {
    const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { dirname, join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'homebridge-plugin-spec-'))
    try {
      const fullPackageJSON = {
        name: 'homebridge-test',
        version: '1.0.0',
        engines: { homebridge: '>=2.0.0' },
        ...packageJSON,
      }
      writeFileSync(join(dir, 'package.json'), JSON.stringify(fullPackageJSON))
      for (const [file, content] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, file)), { recursive: true })
        writeFileSync(join(dir, file), content)
      }
      const plugin = new Plugin('homebridge-test', dir, fullPackageJSON as never)
      await plugin.load()
      return {
        plugin,
        initialized: plugin.initialize({} as never),
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  const commonJsPlugin = 'module.exports = () => \'cjs plugin ran\'\n'

  // Homebridge 1 loaded a CommonJS plugin with require(), which adds ".js" and
  // finds index.js in a folder. import() does neither.
  describe('a CommonJS main that is not a full file name', () => {
    it.each([
      { main: 'dist/index.js', why: 'a full file name' },
      { main: 'dist/index', why: 'no extension' },
      { main: 'dist', why: 'a folder' },
      { main: './dist/', why: 'a folder with slashes' },
    ])('loads a plugin whose main is $why ($main)', async ({ main }) => {
      const { initialized } = await loadPluginFrom({ main }, { 'dist/index.js': commonJsPlugin })

      expect(initialized).toBe('cjs plugin ran')
    })

    it('loads a plugin with no main from its index.js', async () => {
      const { initialized } = await loadPluginFrom({}, { 'index.js': commonJsPlugin })

      expect(initialized).toBe('cjs plugin ran')
    })
  })

  describe('the exports field of a plugin', () => {
    const entryOf = (packageJSON: Record<string, unknown>) =>
      (new Plugin('homebridge-test', '/unused', { name: 'homebridge-test', version: '1.0.0', ...packageJSON } as never) as unknown as { main: string }).main

    it.each([
      { what: 'a plain string', exports: './dist/index.js' },
      {
        what: 'conditions',
        exports: { import: './dist/index.js', require: './dist/index.cjs' },
      },
      {
        what: 'a "." entry',
        exports: { '.': './dist/index.js' },
      },
      {
        what: 'conditions under "."',
        exports: {
          '.': { import: './dist/index.js', require: './dist/index.cjs' },
        },
      },
      {
        what: 'nested conditions, as the typescript docs show',
        exports: {
          '.': {
            import: { types: './dist/index.d.ts', default: './dist/index.js' },
          },
        },
      },
      {
        what: 'a node condition around import',
        exports: {
          '.': {
            node: { import: './dist/index.js' },
          },
        },
      },
      {
        what: 'a list of fallbacks',
        exports: {
          '.': ['./dist/index.js'],
        },
      },
      {
        what: 'types first, then default',
        exports: {
          '.': { types: './dist/index.d.ts', default: './dist/index.js' },
        },
      },
    ])('finds the entry file in $what', ({ exports }) => {
      expect(entryOf({ exports, main: './wrong.js' })).toBe('./dist/index.js')
    })

    it('uses main when exports only lists sub-paths', () => {
      expect(entryOf({
        main: './dist/index.js',
        exports: { './package.json': './package.json', './lib': './dist/lib.js' },
      })).toBe('./dist/index.js')
    })

    it('uses index.js when there is no exports entry and no main', () => {
      expect(entryOf({
        exports: { './lib': './dist/lib.js' },
      })).toBe('./index.js')
    })

    it('loads a plugin through nested conditions', async () => {
      const { initialized } = await loadPluginFrom(
        {
          type: 'module',
          exports: {
            '.': {
              import: { types: './dist/index.d.ts', default: './dist/index.js' },
            },
          },
        },
        { 'dist/index.js': 'export default () => \'esm plugin ran\'\n' },
      )

      expect(initialized).toBe('esm plugin ran')
    })
  })

  describe('the checks when a plugin is loaded', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>
    let errorSpy: ReturnType<typeof vi.spyOn>
    const files = { 'index.js': commonJsPlugin }

    beforeEach(() => {
      warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      errorSpy = vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      warnSpy.mockRestore()
      errorSpy.mockRestore()
    })

    it('loads without a word when the engines are satisfied', async () => {
      await loadPluginFrom({
        engines: { homebridge: `^${getVersion()}`, node: process.version },
      }, files)

      expect(warnSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('refuses a plugin with no homebridge version in engines', async () => {
      await expect(loadPluginFrom({
        engines: { node: '>=22' },
      }, files))
        .rejects
        .toThrow('does not contain the \'homebridge\' package in \'engines\'')
    })

    it('takes the homebridge version from peerDependencies when engines has none', async () => {
      await loadPluginFrom({
        engines: undefined,
        peerDependencies: { homebridge: '>=2.0.0' },
      }, files)

      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('warns, and still loads, when the Homebridge version is not the one the plugin asks for', async () => {
      const { initialized } = await loadPluginFrom({
        engines: { homebridge: '^0.4.0' },
      }, files)

      expect(initialized).toBe('cjs plugin ran')
      expect(warnSpy).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('requires a Homebridge version of ^0.4.0'))
    })

    it('warns, and still loads, when the Node.js version is not the one the plugin asks for', async () => {
      const { initialized } = await loadPluginFrom({
        engines: { homebridge: '>=2.0.0', node: '^4.0.0' },
      }, files)

      expect(initialized).toBe('cjs plugin ran')
      expect(warnSpy).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('requires a Node.js version of ^4.0.0'))
    })

    it.each(['homebridge', 'hap-nodejs', '@homebridge/hap-nodejs'])('logs an error, and still loads, when %s is in dependencies', async (dependency) => {
      const { initialized } = await loadPluginFrom({
        dependencies: { [dependency]: '^2.0.0' },
      }, files)

      expect(initialized).toBe('cjs plugin ran')
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('carry an additional copy of homebridge and hap-nodejs'))
    })

    it('names a scoped plugin in full in these messages', async () => {
      const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const dir = mkdtempSync(join(tmpdir(), 'homebridge-plugin-spec-'))
      try {
        writeFileSync(join(dir, 'index.js'), commonJsPlugin)
        const plugin = new Plugin('homebridge-test', dir, {
          name: '@scope/homebridge-test',
          version: '1.0.0',
          engines: { homebridge: '^0.4.0', node: '^4.0.0' },
          dependencies: { homebridge: '^2.0.0' },
        } as never, '@scope')

        await plugin.load()
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }

      expect(warnSpy).toHaveBeenCalledTimes(2)
      expect(warnSpy).toHaveBeenNthCalledWith(1, expect.stringContaining('The plugin "@scope/homebridge-test" requires a Homebridge version'))
      expect(warnSpy).toHaveBeenNthCalledWith(2, expect.stringContaining('The plugin "@scope/homebridge-test" requires a Node.js version'))
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('The plugin "@scope/homebridge-test" defines'))
    })

    it('does not change the package.json object it is given', () => {
      const packageJSON = {
        name: 'homebridge-test',
        version: '1.0.0',
        peerDependencies: { homebridge: '>=2.0.0' },
      }

      void new Plugin('homebridge-test', '/unused', packageJSON as never)

      expect(packageJSON).toEqual({
        name: 'homebridge-test',
        version: '1.0.0',
        peerDependencies: { homebridge: '>=2.0.0' },
      })
    })

    it('can not be initialized before it is loaded', () => {
      const plugin = new Plugin('homebridge-test', '/unused', { name: 'homebridge-test', version: '1.0.0' } as never)

      expect(() => plugin.initialize({} as never)).toThrow('Tried to initialize a plugin which hasn\'t been loaded yet!')
    })
  })

  describe('what a plugin registers', () => {
    let infoSpy: ReturnType<typeof vi.spyOn>
    let plugin: Plugin
    const Accessory = class {} as never
    const Platform = class {} as never

    beforeEach(() => {
      infoSpy = vi.spyOn(Logger.internal, 'info').mockImplementation(() => {})
      plugin = new Plugin('homebridge-test', '/unused', { name: '@scope/homebridge-test', version: '1.0.0' } as never, '@scope')
    })

    afterEach(() => {
      infoSpy.mockRestore()
    })

    it('has the scope in its identifier', () => {
      expect(plugin.getPluginIdentifier()).toBe('@scope/homebridge-test')
      expect(new Plugin('homebridge-test', '/unused', { name: 'homebridge-test', version: '1.0.0' } as never).getPluginIdentifier()).toBe('homebridge-test')
    })

    it('hands back an accessory by its name and by its full identifier', () => {
      plugin.registerAccessory('Acc', Accessory)

      expect(plugin.getAccessoryConstructor('Acc')).toBe(Accessory)
      expect(plugin.getAccessoryConstructor('@scope/homebridge-test.Acc')).toBe(Accessory)
      expect(infoSpy).toHaveBeenCalledExactlyOnceWith('Registering accessory \'%s\'', '@scope/homebridge-test.Acc')
    })

    it('hands back a platform by its name and by its full identifier', () => {
      plugin.registerPlatform('Plat', Platform)

      expect(plugin.getPlatformConstructor('Plat')).toBe(Platform)
      expect(plugin.getPlatformConstructor('@scope/homebridge-test.Plat')).toBe(Platform)
      expect(infoSpy).toHaveBeenCalledExactlyOnceWith('Registering platform \'%s\'', '@scope/homebridge-test.Plat')
    })

    it('does not log a registration of a disabled plugin', () => {
      plugin.disabled = true

      plugin.registerAccessory('Acc', Accessory)
      plugin.registerPlatform('Plat', Platform)

      expect(infoSpy).not.toHaveBeenCalled()
    })

    it('refuses the same accessory name twice', () => {
      plugin.registerAccessory('Acc', Accessory)

      expect(() => plugin.registerAccessory('Acc', Accessory))
        .toThrow('Plugin \'@scope/homebridge-test\' tried to register an accessory \'Acc\' which has already been registered!')
    })

    it('refuses the same platform name twice', () => {
      plugin.registerPlatform('Plat', Platform)

      expect(() => plugin.registerPlatform('Plat', Platform))
        .toThrow('Plugin \'@scope/homebridge-test\' tried to register a platform \'Plat\' which has already been registered!')
    })

    it('says so when asked for something it did not register', () => {
      expect(() => plugin.getAccessoryConstructor('Nope')).toThrow('The requested accessory \'Nope\' was not registered by the plugin \'@scope/homebridge-test\'.')
      expect(() => plugin.getPlatformConstructor('Nope')).toThrow('The requested platform \'Nope\' was not registered by the plugin \'@scope/homebridge-test\'.')
    })

    it('refuses a dynamic platform that is configured a second time', () => {
      const platformInstance = {
        configureAccessory: () => {},
      }
      plugin.registerPlatform('Plat', Platform)
      expect(plugin.getActiveDynamicPlatform('Plat')).toBeUndefined()

      plugin.assignDynamicPlatform('@scope/homebridge-test.Plat', platformInstance)

      expect(plugin.getActiveDynamicPlatform('Plat')).toBe(platformInstance)
      expect(() => plugin.getPlatformConstructor('Plat')).toThrow('is configured multiple times in your config.json.')
    })
  })
})
