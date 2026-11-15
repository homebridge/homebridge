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
import { dirname, relative, resolve } from 'node:path'

import ts from 'typescript'
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
 * Parse the run-time (non-type) static import and re-export paths from TypeScript source text.
 *
 * The file is parsed with the TypeScript compiler, not line by line, so an import written over
 * several lines is seen. Left out, as the compiler erases them:
 * - `import type { A } from '...'` and `export type { A } from '...'`
 * - `import { type A, type B } from '...'` (every name is marked `type`)
 *
 * A dynamic `import('...')` is left out too: that is how Matter is loaded on demand.
 */
function parseRuntimeImports(content: string, fileName = 'file.ts'): string[] {
  const source = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
  const imports: string[] = []

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause
      // no clause: a bare `import '...'`, which always runs
      if (clause) {
        if (clause.isTypeOnly) {
          continue
        }
        const named = clause.namedBindings && ts.isNamedImports(clause.namedBindings)
          ? clause.namedBindings.elements
          : undefined
        const onlyTypeNames = !clause.name && named !== undefined && named.length > 0 && named.every(element => element.isTypeOnly)
        if (onlyTypeNames) {
          continue
        }
      }
      imports.push(statement.moduleSpecifier.text)
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (statement.isTypeOnly) {
        continue
      }
      const named = statement.exportClause && ts.isNamedExports(statement.exportClause)
        ? statement.exportClause.elements
        : undefined
      if (named !== undefined && named.length > 0 && named.every(element => element.isTypeOnly)) {
        continue
      }
      imports.push(statement.moduleSpecifier.text)
    }
  }

  return imports
}

function getRuntimeImports(filePath: string): string[] {
  return parseRuntimeImports(readFileSync(filePath, 'utf-8'), filePath)
}

/**
 * Every source file a core file loads at run time through static imports, however many files
 * lie in between, with the chain of files that leads to it.
 */
function walkRuntimeImports(entry: string): Array<{ specifier: string, chain: string[] }> {
  const reached: Array<{ specifier: string, chain: string[] }> = []
  const seen = new Set<string>()

  const visit = (file: string, chain: string[]): void => {
    if (seen.has(file)) {
      return
    }
    seen.add(file)

    for (const specifier of getRuntimeImports(resolve(SRC_DIR, file))) {
      if (!specifier.startsWith('.')) {
        reached.push({ specifier, chain })
        continue
      }
      const target = relative(SRC_DIR, resolve(SRC_DIR, dirname(file), specifier)).replace(/\\/g, '/').replace(/\.js$/, '.ts')
      reached.push({ specifier: target, chain })
      // a heavy matter module is the end of the road: what it loads in turn adds nothing to the report
      if (!target.startsWith('matter/') || LIGHTWEIGHT_MATTER_MODULES.includes(target)) {
        visit(target, [...chain, target])
      }
    }
  }

  visit(entry, [entry])
  return reached
}

describe('matter lazy loading', () => {
  describe('the import scanner', () => {
    it.each([
      [
        'a single-line import',
        'import { a } from \'./matter/index.js\'',
        ['./matter/index.js'],
      ],
      [
        'an import written over several lines',
        'import {\n  a,\n  b,\n} from \'./matter/index.js\'',
        ['./matter/index.js'],
      ],
      [
        'a package import written over several lines',
        'import {\n  Endpoint,\n} from "@matter/main"',
        ['@matter/main'],
      ],
      [
        'a default import',
        'import thing from \'./matter/index.js\'',
        ['./matter/index.js'],
      ],
      [
        'a namespace import',
        'import * as thing from \'./matter/index.js\'',
        ['./matter/index.js'],
      ],
      [
        'a bare import',
        'import \'./matter/index.js\'',
        ['./matter/index.js'],
      ],
      [
        'a re-export',
        'export { a } from \'./matter/index.js\'',
        ['./matter/index.js'],
      ],
      [
        'a re-export written over several lines',
        'export {\n  a,\n} from \'./matter/index.js\'',
        ['./matter/index.js'],
      ],
      [
        'a re-export of everything',
        'export * from \'./matter/index.js\'',
        ['./matter/index.js'],
      ],
      [
        'one type name next to a value',
        'import { type A, b } from \'./matter/index.js\'',
        ['./matter/index.js'],
      ],
      [
        'a default import next to type names',
        'import thing, { type A } from \'./matter/index.js\'',
        ['./matter/index.js'],
      ],
    ])('sees %s as a run-time import', (_title, code, expected) => {
      expect(parseRuntimeImports(code)).toEqual(expected)
    })

    it.each([
      ['a type import', 'import type { A } from \'./matter/index.js\''],
      ['a type import written over several lines', 'import type {\n  A,\n  B,\n} from \'./matter/index.js\''],
      ['an import of type names only', 'import { type A, type B } from \'./matter/index.js\''],
      ['a type re-export', 'export type { A } from \'./matter/index.js\''],
      ['a re-export of type names only', 'export { type A } from \'./matter/index.js\''],
      ['a dynamic import', 'const m = await import(\'./matter/index.js\')'],
      ['an import inside a comment', '// import { a } from \'./matter/index.js\'\n/* import { b } from \'@matter/main\' */'],
      ['an import inside a text', 'const text = `\nimport { a } from \'@matter/main\'\n`'],
    ])('does not see %s as a run-time import', (_title, code) => {
      expect(parseRuntimeImports(code)).toEqual([])
    })
  })

  describe('core files must not load heavy matter modules through any chain of imports', () => {
    // The per-file checks below only look at the listed files. A core file can also reach matter.js
    // through a file that is on no list (`src/util/*.ts`, say). This follows every static run-time
    // import, however deep, and names the chain that leads to the heavy module.
    for (const file of CORE_FILES) {
      it(`${file} must not reach a heavy matter module`, () => {
        const heavy = walkRuntimeImports(file).filter(({ specifier }) => {
          if (specifier.startsWith('@matter/')) {
            return true
          }
          return specifier.startsWith('matter/') && !LIGHTWEIGHT_MATTER_MODULES.includes(specifier)
        })

        const message = heavy.length === 0
          ? ''
          : [
              `${file} would load Matter.js at start-up through:`,
              ...heavy.map(({ specifier, chain }) => `  - ${[...chain, specifier].join(' -> ')}`),
            ].join('\n')
        expect(message).toBe('')
      })
    }

    it('follows imports through files that are on no list', () => {
      // server.ts imports ./util/mac.js and ./user.js: both must have been walked
      const reached = walkRuntimeImports('server.ts').map(({ specifier }) => specifier)

      expect(reached).toContain('util/mac.ts')
      expect(reached).toContain('user.ts')
      expect(reached).toContain('node:path')
    })
  })

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
