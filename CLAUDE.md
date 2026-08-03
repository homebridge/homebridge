# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run build` — `npm run clean && tsc`. Compiles `src/` → `dist/` (this is the only artifact directory; the `lib/` folder in the repo is unrelated build-helper code, not the build output).
- `npm run watch` — runs nodemon: rebuilds on `src/**/*.ts` change and restarts `bin/homebridge.js -I -C` (insecure + forced colour). Ignores `*.spec.ts`.
- `npm run dev` — `DEBUG=* ./bin/homebridge.js -D -P example-plugins/` (expects an `example-plugins/` checkout next to plugins under test).
- `npm run lint` / `npm run lint:fix` — ESLint via `@antfu/eslint-config` (flat config in `eslint.config.js`). The CI build runs lint; do not bypass.
- `npm run test` — `vitest run`. `npm run test-coverage` adds `--coverage`. Vitest config: `pool: 'threads'`, `testTimeout: 10000`, coverage scoped to `src/**`.
- Run a single test file: `npx vitest run src/server.spec.ts`. Filter by name: `npx vitest run -t "registers plugin"`.
- `npm run docs` / `npm run lint-docs` — TypeDoc. `lint-docs` treats warnings as errors.
- `npm run desktop:*` — the Windows desktop app (see below). `desktop:prepare` stages it, `desktop:dist` packages it, `desktop:start` runs it unpackaged.
- Engines: Node `^22 || ^24`. ESM-only (`"type": "module"`); use `import` and `.js` extensions on relative imports (TS resolves `nodenext`).

## Running locally

`bin/homebridge.js` is a thin shim that resolves `dist/cli.js` via `realpathSync` (so `npm link` works) and invokes its default export. After `npm run build`:

- `./bin/homebridge.js -D` — debug mode, reads `~/.homebridge/config.json`.
- `./bin/homebridge.js -D -U ~/.homebridge-dev` — alternate user storage path. Use this when developing plugins so you don't disturb a real bridge.
- Other CLI flags: `-I` insecure, `-Q` no QR code, `-K` keep orphaned cached accessories, `-T` no timestamps, `-C` force color, `-P <path>` extra plugin search path, `--strict-plugin-resolution` only load from `-P`.

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

`src/index.ts` is the public package entry point — it re-exports types from `./api.js`, `./bridgeService.js`, `./logger.js`, `./platformAccessory.js`, the entire Matter type surface, and a large slice of `@homebridge/hap-nodejs`. Edits to public exports must be made here; otherwise plugins won't see them.

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

`src/logger.ts` exports the `Logger` class and `Logging` interface. Plugin code should always use the `Logging` instance handed in by the API (which is `Logger.withPrefix(pluginName)`). Internal modules use `Logger.internal` or a custom `Logger.withPrefix('Matter/MainManager')`-style prefix. `LogLevel` is a `const enum` — preserved at runtime via `preserveConstEnums: true` in `tsconfig.json`.

## Desktop app (Windows)

`desktop/` is an Electron shell that ships Homebridge, `homebridge-config-ui-x` and a pinned Node.js 22 runtime as one Windows installer. It is entirely additive: nothing under `src/` knows about it, and `package.json`'s `files` array is unchanged, so the npm package is unaffected. Full detail in [`desktop/README.md`](./desktop/README.md).

- **The window is the web UI.** The shell opens a local boot screen (`desktop/renderer/shell.html`) and navigates to `http://127.0.0.1:<port>` once the bundled UI answers. Only that boot/diagnostics screen and the settings window are the shell's own.
- **One child process.** `desktop/main/supervisor.cjs` spawns `hb-service run` from the bundled config-ui-x, on the bundled `node.exe`. That command starts the UI in-process and forks Homebridge itself — the same entry point the official Windows service uses. Homebridge does _not_ run on Electron's Node.
- **Layout is load-bearing.** `hb-service` finds Homebridge by looking for a sibling `homebridge` directory next to its own install, which is why `scripts/desktop/stage-server.mjs` installs both into one `node_modules`.
- **Two package.json files.** `desktop/package.json` exists so electron-builder packages from `desktop/` and does not pull Homebridge's dependency tree into the asar. Its `version` is synced from the root by `stage-server.mjs`.
- **`.cjs` on purpose.** The root package is ESM; the Electron main and preload files use `.cjs` so they stay CommonJS regardless. Renderer scripts are classic `<script>` tags — `file://` pages cannot load ES modules.
- **Staging must happen on Windows.** `homebridge-config-ui-x` hard-requires `@homebridge/node-pty-prebuilt-multiarch`, whose Windows binaries are only assembled by an install running on Windows. `stage-server.mjs` refuses otherwise; `--allow-cross-stage` produces an inspectable, non-shippable bundle.
- Build output and the download cache live in `.desktop-build/` (gitignored), as do the generated icons in `desktop/resources/`.

## Conventions

- Source is TypeScript with `strict: true`, `module: nodenext`. Always use `.js` suffix on relative imports even from `.ts` files (ESM rule).
- ESLint config bans Prettier (`format/prettier: off`) and enforces single quotes, sorted imports/exports (`perfectionist/sort-*`), and strict brace style. Run `npm run lint:fix` rather than hand-formatting.
- `const enum` is used in several places (`PluginType`, `ServerStatus`, `IpcIncomingEvent`, `LogLevel`, `ChildProcessMessageEventType`). Each is annotated with `// eslint-disable-next-line no-restricted-syntax` — keep that pattern when adding new ones.
- Tests live alongside source as `*.spec.ts`. They are excluded from the published build via `tsconfig.json` `exclude` and from nodemon via `nodemon.json`.

## Branch / version targeting (for PRs)

`/.github/copilot-instructions.md` defines a label-driven branch strategy used by the project's automation:

- Issues need a `patch` / `minor` / `major` label before automated PRs are created.
- PRs target the lowest existing `beta-{major}.{minor}.{patch}` branch matching the bump; `latest` is only for hotfixes.
- New beta branches are named `beta-1.11.1` (patch), `beta-1.12.0` (minor), `beta-2.0.0` (major).

Current `latest` branch is on v2.0.0; recent commits show the v2 Matter work landing.
