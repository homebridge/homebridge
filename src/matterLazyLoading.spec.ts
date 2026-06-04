/**
 * Matter Lazy Loading Tests
 *
 * These tests ensure that the heavy Matter.js libraries (@matter/main, @matter/general,
 * @matter/node, @matter/nodejs) are NOT eagerly imported by core Homebridge files.
 *
 * Matter dependencies should only be loaded when a plugin actually configures Matter support.
 * This is critical for startup performance — loading Matter.js adds significant time.
 *
 * If these tests fail, it means a core file has gained a runtime (non-type) import that
 * pulls in Matter.js libraries. The fix is typically to:
 *   1. Change the import to `import type` if only types are needed
 *   2. Import from the specific lightweight module instead of a barrel/index file
 *   3. Move the needed constant/function out of the matter directory
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC_DIR = resolve(import.meta.dirname)

/**
 * Core files that are loaded during Homebridge startup regardless of Matter configuration.
 * These files must NEVER have runtime imports that transitively pull in @matter/* packages.
 *
 * Excluded:
 * - src/index.ts — the public plugin API, consumed by plugins which may opt into Matter
 * - src/matter/** — these are expected to import @matter/* packages
 * - *.spec.ts — test files don't affect runtime
 */
const CORE_FILES = [
  'api.ts',
  'bridgeService.ts',
  'childBridgeFork.ts',
  'childBridgeService.ts',
  'cli.ts',
  'externalPortService.ts',
  'ipcService.ts',
  'logger.ts',
  'platformAccessory.ts',
  'plugin.ts',
  'pluginManager.ts',
  'server.ts',
  'storageService.ts',
  'user.ts',
  'version.ts',
]

/**
 * Matter modules that are intentionally kept lightweight (no @matter/* imports)
 * so they can be safely imported by core files.
 */
const LIGHTWEIGHT_MATTER_MODULES = [
  'matter/config.ts',
  'matter/configValidator.ts',
  'matter/ChildBridgeMatterMessageHandler.ts',
  'matter/ipc-types.ts',
  'matter/MatterError.ts',
  'matter/MatterPortAllocator.ts',
  'matter/sharedTypes.ts',
]

/**
 * Parse runtime (non-type) import paths from a TypeScript source file.
 * Skips `import type` statements as they are erased at compile time.
 */
function getRuntimeImports(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8')
  const imports: string[] = []

  for (const line of content.split('\n')) {
    const trimmed = line.trim()

    // Skip type-only imports (erased at compile time)
    if (trimmed.startsWith('import type ')) {
      continue
    }
    // Skip type-only re-exports
    if (trimmed.startsWith('export type ')) {
      continue
    }

    // Match: import { ... } from '...'
    // Match: import ... from '...'
    // Match: import '...'
    // Match: export { ... } from '...'
    const fromMatch = trimmed.match(/(?:import|export)\s+(?:\S.*)?from\s+['"]([^'"]+)['"]/)
    if (fromMatch) {
      imports.push(fromMatch[1])
      continue
    }

    // Match bare imports: import '...'
    const bareMatch = trimmed.match(/^import\s+['"]([^'"]+)['"]/)
    if (bareMatch) {
      imports.push(bareMatch[1])
    }
  }

  return imports
}

describe('matter lazy loading', () => {
  describe('core files must not have runtime imports from heavy matter modules', () => {
    const allowedMatterImports = new Set(
      LIGHTWEIGHT_MATTER_MODULES.map(m => `./${m.replace(/\.ts$/, '.js')}`),
    )

    for (const file of CORE_FILES) {
      it(`${file} must not import heavy matter modules`, () => {
        const filePath = resolve(SRC_DIR, file)
        const imports = getRuntimeImports(filePath)

        const matterImports = imports.filter((imp) => {
          // Direct @matter/* package imports are always forbidden in core files
          if (imp.startsWith('@matter/')) {
            return true
          }

          // Check for imports from ./matter/ paths
          if (imp.includes('/matter/') || /^\.\/matter\//.test(imp)) {
            // Allow known lightweight modules
            const normalised = imp.startsWith('./')
              ? imp
              : `./${imp}`
            return !allowedMatterImports.has(normalised)
          }

          return false
        })

        const message = matterImports.length === 0
          ? ''
          : [
              `${file} has runtime imports that would eagerly load Matter.js:`,
              ...matterImports.map(i => `  - ${i}`),
              '',
              'To fix: use \`import type\` for types, import from the specific lightweight',
              'module instead of a barrel file, or move the needed value out of src/matter/.',
            ].join('\n')
        expect(message).toBe('')
      })
    }
  })

  describe('lightweight matter modules must not import @matter/* packages', () => {
    for (const file of LIGHTWEIGHT_MATTER_MODULES) {
      it(`${file} must not import @matter/* packages`, () => {
        const filePath = resolve(SRC_DIR, file)
        const imports = getRuntimeImports(filePath)

        const heavyImports = imports.filter(imp => imp.startsWith('@matter/'))

        const message = heavyImports.length === 0
          ? ''
          : [
              `${file} imports @matter/* packages, making it no longer lightweight:`,
              ...heavyImports.map(i => `  - ${i}`),
              '',
              'This module is imported by core files and must stay free of @matter/* deps.',
              'Use \`import type\` if only types are needed, or split the heavy code out.',
            ].join('\n')
        expect(message).toBe('')
      })
    }
  })

  describe('lightweight matter modules must not transitively load heavy modules via sibling imports', () => {
    // Without this guard a lightweight module could quietly load a heavy
    // sibling (e.g. `./types.js`) and reintroduce the lazy-loading
    // regression — the per-file `@matter/*` check above would still pass
    // because the offending import is relative, not direct.
    //
    // We only check siblings inside `src/matter/`; relative imports that
    // step out (`../logger.js`) are fine since those targets aren't
    // governed by this allowlist.
    const lightweightSiblings = new Set(
      LIGHTWEIGHT_MATTER_MODULES.map(m => m.replace(/^matter\//, './').replace(/\.ts$/, '.js')),
    )

    for (const file of LIGHTWEIGHT_MATTER_MODULES) {
      it(`${file} must only import lightweight sibling matter modules`, () => {
        const filePath = resolve(SRC_DIR, file)
        const imports = getRuntimeImports(filePath)

        const heavySiblings = imports.filter((imp) => {
          if (!imp.startsWith('./')) {
            return false
          }
          return !lightweightSiblings.has(imp)
        })

        const message = heavySiblings.length === 0
          ? ''
          : [
              `${file} runtime-imports a sibling matter module that is not in the lightweight allowlist:`,
              ...heavySiblings.map(i => `  - ${i}`),
              '',
              'Loading that sibling transitively pulls in its @matter/* runtime deps,',
              'breaking the lazy-loading invariant for any core file that imports this module.',
              'Either move the needed value to a lightweight module or use `import type`.',
            ].join('\n')
        expect(message).toBe('')
      })
    }
  })
})
