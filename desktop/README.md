# Homebridge Desktop

A Windows desktop application that packages Homebridge, its web interface and a
Node.js 22 runtime into a single installer. There is nothing to install
beforehand — no Node.js, no npm, no service configuration.

The window _is_ the Homebridge UI. The app shows a local boot screen while the
server starts, then hands the window over to the bundled
[homebridge-config-ui-x](https://github.com/homebridge/homebridge-config-ui-x),
which is where all real work happens: config, plugins, accessories, logs,
backups, pairing.

## How it works

```
Homebridge Desktop.exe            Electron shell — window, tray, menu, supervision
└── resources/
    ├── node/node.exe             bundled Node.js 22 (+ npm, for plugin installs)
    └── server/node_modules/
        ├── homebridge-config-ui-x  the web UI, started via `hb-service run`
        └── homebridge              this repository, packed and installed
```

The shell spawns one child process:

```
resources/node/node.exe  resources/server/node_modules/homebridge-config-ui-x/dist/bin/hb-service.js  run  -U <storage>  -P <storage>/node_modules
```

`hb-service run` is the same entry point the official Windows service uses. It
starts the web UI in-process and forks Homebridge itself, so restarting
Homebridge from inside the web UI keeps working exactly as it does elsewhere.

Homebridge runs on the bundled Node.js rather than on Electron's, so plugins
with native modules resolve against a stock Node 22 ABI, and the bundled npm can
install plugins with no system-wide Node.js present.

### What the shell adds

- **Boot and diagnostics screen** — live, colour-rendered log tail with a filter
  while the server starts, and the reason when it fails. Reachable at any time
  from _View → Status and Logs_.
- **Supervision** — restarts Homebridge with backoff if it exits unexpectedly,
  and gives up with an explanation after five failures in a row.
- **Tray** — the bridge keeps running with the window closed. Start, restart,
  stop and open-in-browser live there and in the menu.
- **Clean shutdown** — quitting terminates the whole process tree, so Homebridge
  and every child bridge release their ports.
- **Settings** — storage folder, first-run UI port, launch at login, tray
  behaviour. Everything about the bridge itself belongs to the web UI.

### Where data lives

The storage folder (default `%USERPROFILE%\.homebridge`, the same one the CLI
uses) holds `config.json`, cached accessories, HomeKit pairing data,
`homebridge.log`, backups, and installed plugins under `node_modules`. None of
it lives in the app directory, so updating or reinstalling the app leaves an
existing setup untouched, and an uninstall does not delete it.

Only desktop-shell preferences are kept separately, in
`%APPDATA%\Homebridge Desktop\desktop-settings.json`.

## Building

**Build on Windows.** `homebridge-config-ui-x` depends on
`@homebridge/node-pty-prebuilt-multiarch`, whose Windows binaries are only
assembled when `npm install` runs on Windows — its published tarball ships Linux
prebuilds only, and those satisfy the package's own check on other hosts, so a
bundle staged elsewhere has a web UI that exits on startup. `stage-server.mjs`
refuses to run off Windows unless you pass `--allow-cross-stage`, which produces
an inspectable, non-shippable bundle (and flags itself as such on the boot
screen).

```bash
npm install
npm run desktop:prepare     # build + icons + Node.js runtime + server bundle
npm run desktop:dist        # NSIS installer and portable .exe in .desktop-build/release
```

Individual steps:

| Script                    | What it does                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `npm run desktop:icons`   | Generates `icon.png`, `tray.png` and `icon.ico` into `desktop/resources`           |
| `npm run desktop:runtime` | Downloads and checksum-verifies the pinned Node.js 22 Windows build                |
| `npm run desktop:server`  | Packs this repository and installs it next to `homebridge-config-ui-x`             |
| `npm run desktop:pack`    | Packages an unpacked app directory only — quick check that the payload is complete |
| `npm run desktop:dist`    | Full Windows build: NSIS installer plus portable executable                        |
| `npm run desktop:start`   | Runs the shell against `.desktop-build/staging` without packaging                  |

Run the steps in order — `desktop:server` uses the Node.js runtime that
`desktop:runtime` stages, both to install with and to run npm at all. It never
spawns `npm.cmd`: Node refuses to spawn `.cmd` files without a shell since the
fix for CVE-2024-27980, so npm's CLI is invoked with a Node binary instead.

Versions are pinned in [`app-config.json`](./app-config.json). Bumping the
Node.js or web UI version there is the only change needed to ship a new one;
`HOMEBRIDGE_DESKTOP_NODE_VERSION` overrides the Node.js version for a one-off
build.

Everything the build produces lands in `.desktop-build/` (gitignored), including
a download cache so repeat builds do not re-fetch the Node.js archive.

### Running the shell during development

`npm run desktop:start` runs the Electron shell directly against the staging
directory. On macOS or Linux the bundled `node.exe` cannot execute, so the shell
falls back to the host's `node` — with a bundle staged using
`--allow-cross-stage`, the whole app is usable for shell work on those hosts.
`HOMEBRIDGE_DESKTOP_NODE_BIN` overrides the interpreter explicitly.

## Layout

| Path                  | Contents                                                                 |
| --------------------- | ------------------------------------------------------------------------ |
| `main/main.cjs`       | Entry point: app lifecycle, IPC handlers, quit sequence                  |
| `main/supervisor.cjs` | Spawns and supervises `hb-service run`, owns the restart policy          |
| `main/paths.cjs`      | Resolves the bundled runtime and server, packaged or staged              |
| `main/uiEndpoint.cjs` | Reads the UI port from config.json and health-checks it                  |
| `main/logTail.cjs`    | Follows `homebridge.log` for the boot screen                             |
| `main/windows.cjs`    | Main window, settings window, navigation policy                          |
| `preload/shell.cjs`   | contextBridge API, exposed only on the shell's own `file://` pages       |
| `renderer/`           | Boot screen, settings form, ANSI-to-DOM log renderer                     |
| `package.json`        | The app's own manifest — keeps Homebridge's dependencies out of the asar |

## Notes and limitations

- **x64 only.** `app-config.json` accepts `arm64`, but only x64 is built and
  tested.
- **Plugin installs use whichever npm the web UI finds.** On Windows,
  `homebridge-config-ui-x` looks for `npm.cmd` under `%APPDATA%\npm`, then
  `%ProgramFiles%\nodejs`, then `%NVM_SYMLINK%`. The app points `NVM_SYMLINK` at
  its bundled runtime and puts it first on `PATH`, so a machine with no
  system-wide Node.js is fully self-contained. If Node.js _is_ installed
  system-wide, its npm wins — plugins still install to the right place, because
  the app sets `npm_config_prefix` to the storage folder, but native plugin
  modules are then built against that Node.js version instead of the bundled 22.
- **Stopping is not graceful on Windows.** Windows offers no way to ask an
  unrelated console process to shut down cleanly, so the process tree is
  terminated outright. Homebridge persists accessory and pairing state as it
  changes, so this is equivalent to the service being stopped by Windows.
- **The app is unsigned.** SmartScreen will warn on first run until a code
  signing certificate is configured for `electron-builder`.
