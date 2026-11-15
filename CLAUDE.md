# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run build` — `npm run clean && tsc`. Compiles `src/` → `dist/` (the only artifact directory; it is not in git).
- `npm run watch` — runs nodemon: rebuilds on `src/**/*.ts` change and restarts `bin/homebridge.js -I -C` (insecure + forced colour). Ignores `*.spec.ts`.
- `npm run dev` — `DEBUG=* ./bin/homebridge.js -D -P example-plugins/` (expects an `example-plugins/` checkout next to plugins under test).
- `npm run lint` / `npm run lint:fix` — ESLint via `@antfu/eslint-config` (flat config in `eslint.config.js`). The CI build runs lint; do not bypass.
- `npm run typecheck` — `tsc -p tsconfig.typecheck.json`. Type-checks `src/` **including the `*.spec.ts` files** (the build leaves them out), without writing anything.
- `npm run test` — `vitest run`. The `pretest` script runs `npm run typecheck` first, so a type error in a spec file fails `npm run test` (and CI). `npm run test-coverage` adds `--coverage`. Vitest config: `pool: 'threads'`, `testTimeout: 10000`, coverage scoped to `src/**`.
- Run a single test file: `npx vitest run src/server.spec.ts`. Filter by name: `npx vitest run -t "registers plugin"`.
- `npm run docs` / `npm run lint-docs` — TypeDoc. `lint-docs` treats warnings as errors.
- `npm run check` — `npm install && npm outdated`.
- Engines: Node `^22.12.0 || ^24 || ^26`. ESM-only (`"type": "module"`); use `import` and `.js` extensions on relative imports (TS resolves `nodenext`).

## Running locally

`bin/homebridge.js` is a thin shim that resolves `dist/cli.js` via `realpathSync` (so `npm link` works) and invokes its default export. After `npm run build`:

- `./bin/homebridge.js -D` — debug mode, reads `~/.homebridge/config.json`.
- `./bin/homebridge.js -D -U ~/.homebridge-dev` — alternate user storage path. Use this when developing plugins so you don't disturb a real bridge.
- Other CLI flags: `-I` insecure, `-Q` no QR code, `-K` keep orphaned cached accessories, `-T` no timestamps, `-C` force color, `-P <path>` extra plugin search path (or the folder of one plugin), `--strict-plugin-resolution` only load from `-P`.
- `-U` and `-P` need a value: without one the CLI stops with an error (it does not fall back to the default).
- Exit codes: a fatal error (an uncaught exception, or a failed `server.start()`) is logged, the bridge is torn down, and the process ends with exit code **1**. A normal stop by SIGTERM / SIGINT leaves the exit code alone; if the teardown takes longer than 5 seconds the process is ended with `128 + signal number`.

Plugin development uses `npm link` from the plugin directory; Homebridge then discovers it via the global `node_modules` path resolved by `pluginManager.ts`.

## Architecture

Homebridge is a single-process server that loads npm packages (named `homebridge-*` or `@scope/homebridge-*` with the `homebridge-plugin` keyword), instantiates them against the `API`, and bridges their accessories to **HAP** (HomeKit) and optionally **Matter**. Understanding the layering matters because the two protocol stacks have very different startup costs.

### Process layout

- **Main process** (`src/cli.ts` → `src/server.ts`): loads config, constructs `PluginManager`, `BridgeService` (the main HAP bridge), and zero-or-more `ChildBridgeService` instances. `IpcService` (`src/ipcService.ts`) talks to a parent process (e.g. config-ui-x) over `process.send`/`process.on('message')`.
- **Child bridges** (`src/childBridgeService.ts` + `src/childBridgeFork.ts`): a plugin or accessory whose config has a `_bridge` block runs in a forked Node process with its own HAP pairing. The parent communicates via the same `ChildProcessMessageEventType` enum on both sides.
- **External Matter accessories**: published as separate Matter pairings via `src/matter/ExternalMatterAccessoryPublisher.ts`. The owning bridge is tracked in `Server.externalMatterBridgeRegistry`.

### Plugin API surface

`src/api.ts` (`HomebridgeAPI`) is what plugins receive in their `PluginInitializer(api)`. Two registration paths matter:

- `api.hap` (= `@homebridge/hap-nodejs`) plus `registerAccessory` / `registerPlatform` / `registerPlatformAccessories` / `unregisterPlatformAccessories` — the classic HomeKit path. `PluginType.ACCESSORY` vs `PluginType.PLATFORM` distinguishes the two registration modes; `DynamicPlatformPlugin`, `StaticPlatformPlugin`, `IndependentPlatformPlugin` are the three platform variants.
- `api.matter` (`MatterAPI | undefined`) — only defined on bridges where `bridge.matter` (or a child's `_bridge.matter`) is configured. Mirrors the HAP shape: `registerPlatformAccessories`, `unregisterPlatformAccessories`, `updateAccessoryState`, `getAccessoryState`, plus device-type helpers under `api.matter.switch.*`. Public types live in `src/index.ts` under the “Matter Protocol — Plugin API Exports” section.

`src/index.ts` is the public package entry point (`import … from 'homebridge'`) — it re-exports types from `./api.js`, `./bridgeService.js`, `./logger.js`, `./platformAccessory.js`, the entire Matter type surface, and a large slice of `@homebridge/hap-nodejs`. Edits to public exports must be made here; otherwise plugins won't see them. `src/index.spec.ts` pins some of them.

The package has a second entry, **`homebridge/matter`** (`src/matterExports.ts`, wired up in the `exports` map and `typesVersions` of `package.json`). It carries the Matter exports on their own. The Matter **value** exports of the main entry (`MatterStatus`, `clusters`, `devices`, `deviceTypes`, `clusterNames`, the Matter error classes and enums) are deprecated there: because of them, a run-time import of any value from `'homebridge'` loads all of matter.js. New Matter value exports go in `src/matterExports.ts`; do not add more to `src/index.ts`. Plugins are best served by `api.matter.*` and `api.hap.*`, which need no import at all.

Only add to the public exports. Never remove or rename one without a deprecation first.

### Matter is opt-in and lazy-loaded

This is a critical invariant enforced by **`src/matterLazyLoading.spec.ts`**: the listed core files (`api.ts`, `bridgeService.ts`, `cli.ts`, `server.ts`, `pluginManager.ts`, etc.) must not have any **runtime** import that transitively pulls in `@matter/*` packages — only `import type` is allowed. Loading `@matter/main` adds significant startup time, and bridges without a `matter` config block must not pay that cost.

When changing core files, if you need something from `src/matter/`:

1. Prefer `import type { … } from './matter/…'`.
2. If you need a runtime value, import from a leaf module (e.g. `./matter/config.js`) rather than the barrel `./matter/index.js`.
3. Move the constant out of `src/matter/` if it's truly protocol-agnostic.

The `Server.matterManager` field is `?:` and only constructed lazily; `MatterBridgeManager` (main bridge) and `ChildBridgeMatterManager` (per-child) both extend `BaseMatterManager`. Behaviors per cluster live in `src/matter/behaviors/`; the matter.js server lifecycle is split across `src/matter/server/` (`AccessoryManager`, `CommissioningManager`, `FabricManager`, `ServerLifecycle`, `StateManager`).

### Configuration shape

`HomebridgeConfig` (`src/bridgeService.ts`) — `bridge` (one main `BridgeConfiguration`), `accessories[]`, `platforms[]`, optional `plugins[]` allow-list and `disabledPlugins[]` block-list. Both `accessories[]` and `platforms[]` items may carry a `_bridge` block to be hosted in a child process. `BridgeConfiguration.hap` defaults true; setting `hap: false` requires a `matter` block (validated at load time).

### Logging

`src/logger.ts` exports the `Logger` class and `Logging` interface. Plugin code should always use the `Logging` instance handed in by the API (which is `Logger.withPrefix(pluginName)`). Internal modules use `Logger.internal` or a custom `Logger.withPrefix('Matter/MainManager')`-style prefix. A prefixed logger is cached per prefix, and its methods are copies bound to it (so `promise.catch(log.error)` works): in a test, spy on `Logger.withPrefix('<prefix>')`, not on `Logger.prototype`. `LogLevel` is a `const enum` — preserved at runtime via `preserveConstEnums: true` in `tsconfig.json`.

## Conventions

- Source is TypeScript with `strict: true`, `module: nodenext`. Always use `.js` suffix on relative imports even from `.ts` files (ESM rule).
- ESLint config bans Prettier (`format/prettier: off`) and enforces single quotes, sorted imports/exports (`perfectionist/sort-*`), and strict brace style. Run `npm run lint:fix` rather than hand-formatting.
- `const enum` is used in ten places: four are public (`PluginType`, `APIEvent`, `LogLevel`, `PlatformAccessoryEvent`) and six are internal (`InternalAPIEvent`, `ServerStatus`, `IpcIncomingEvent`, `IpcOutgoingEvent`, `ChildProcessMessageEventType`, `ChildBridgeStatus`). Each is annotated with `// eslint-disable-next-line no-restricted-syntax`. The public ones stay `const enum` on purpose (as normal enums they would add a run-time import of `homebridge` to every plugin built with plain `tsc`). Use a normal `enum` for anything new that plugins can see, as the Matter enums do.
- Tests live alongside source as `*.spec.ts`. They are excluded from the published build via `tsconfig.json` `exclude` and from nodemon via `nodemon.json`.

## Tests on real objects

Most specs mock the layer below. A mock can hide the bug, so three harnesses run the real thing. Prefer them when a fix depends on what HAP-NodeJS or matter.js really does:

- `src/bridgeService.real.spec.ts` — `BridgeService` against the real HAP-NodeJS bridge and a real cache folder in a temp directory.
- `src/matter/behaviors/realNode.spec.ts` — the Homebridge behaviors on a real matter.js `ServerNode` (never online, storage in a temp folder). Helpers: `register`, `invoke`, `settle`, `write`, `stateOf`.
- `src/matter/server.storage.spec.ts` — a real `MatterServer` with its storage in a temp folder. Give each test its own port and a unique id.

Rules of thumb:

- Every fix gets a test that fails without the fix.
- vitest "Maximum call stack size exceeded" / "Unhandled Errors" in a Matter test means a matter.js error object could not be serialised: catch the error and compare `error.message` instead of using `rejects.toThrow()`.
- `User.setStoragePath()` throws once the storage path has been read, so tests in one file share one storage root (or take a fresh `User` with `vi.resetModules()` and a new `import()`).

## Branch / version targeting (for PRs)

`/.github/copilot-instructions.md` defines a label-driven branch strategy used by the project's automation:

- Issues need a `patch` / `minor` / `major` label before automated PRs are created.
- PRs target the lowest existing `beta-{major}.{minor}.{patch}` branch matching the bump; `latest` is only for hotfixes.
- New beta branches are named after the version they lead to. From v2.5.0 that is `beta-2.5.1` (patch), `beta-2.6.0` (minor), `beta-3.0.0` (major).

The current version is in `package.json` (v2.5.0 when this was written). Do not edit `CHANGELOG.md` by habit: it is written per release.
