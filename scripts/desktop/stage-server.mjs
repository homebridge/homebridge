#!/usr/bin/env node

/**
 * Stage the Homebridge server bundle that ships inside the desktop app.
 *
 * The result is an ordinary npm project at `.desktop-build/staging/server`
 * holding this checkout of Homebridge next to `homebridge-config-ui-x`:
 *
 *   server/node_modules/homebridge               ← packed from this repo
 *   server/node_modules/homebridge-config-ui-x   ← the bundled web UI
 *
 * The layout matters: `hb-service` locates Homebridge by looking for a sibling
 * `homebridge` directory next to its own install, so no global npm install is
 * needed at runtime.
 *
 * This step has to run on Windows. `homebridge-config-ui-x` hard-requires
 * `@homebridge/node-pty-prebuilt-multiarch`, and that package only assembles
 * its Windows binaries (conpty/winpty, copied out of `third_party` by its own
 * post-install script) when the install itself happens on Windows — on any
 * other host the published tarball's Linux prebuilds satisfy the check and the
 * Windows ones are never fetched, which leaves the bundled web UI unable to
 * start. Pass `--allow-cross-stage` to build an inspectable, non-shippable
 * bundle anyway.
 *
 * Usage: node scripts/desktop/stage-server.mjs [--clean] [--allow-cross-stage]
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'

import { cacheDir, desktopDir, nodeStagingDir, readAppConfig, repoRoot, resolveNodeVersion, serverStagingDir } from './lib/paths.mjs'

function log(message) {
  process.stdout.write(`[stage-server] ${message}\n`)
}

function describe(command, args) {
  return [command, ...args].join(' ')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options })

  if (result.error) {
    throw new Error(`Failed to run ${describe(command, args)}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`${describe(command, args)} exited with code ${result.status}`)
  }

  return result
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false, ...options })

  if (result.error) {
    throw new Error(`Failed to run ${describe(command, args)}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`${describe(command, args)} exited with code ${result.status}:\n${result.stderr}`)
  }

  return result.stdout
}

/**
 * Work out how to run npm.
 *
 * Never by spawning `npm.cmd`: since the fix for CVE-2024-27980, Node refuses
 * to spawn a `.bat`/`.cmd` file without `shell: true` and fails with EINVAL,
 * and going through a shell would mean hand-quoting every path. Running npm's
 * own CLI entry point with a Node binary sidesteps both.
 *
 * The bundled runtime is preferred where it can execute, so every npm operation
 * — including any native module build — runs on the exact Node.js that will
 * later run the staged bundle.
 */
function resolveNpm() {
  const bundledNode = join(nodeStagingDir, process.platform === 'win32' ? 'node.exe' : join('bin', 'node'))
  const hostNodeDir = dirname(process.execPath)

  const candidates = [
    { bundled: true, cli: join(nodeStagingDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'), node: bundledNode },
    // Windows and portable installs keep npm next to the node binary...
    { bundled: false, cli: join(hostNodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'), node: process.execPath },
    // ...Unix prefixes keep it one level up, under lib.
    { bundled: false, cli: join(hostNodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), node: process.execPath },
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate.node) && existsSync(candidate.cli)) {
      return { bundled: candidate.bundled, command: candidate.node, prefixArgs: [candidate.cli] }
    }
  }

  if (process.platform === 'win32') {
    throw new Error([
      'Could not find an npm CLI to run.',
      'Run "npm run desktop:runtime" first so the bundled Node.js 22 runtime (which ships npm) is staged.',
    ].join('\n'))
  }

  // On Unix `npm` is a shell script, so spawning it directly is safe.
  return { bundled: false, command: 'npm', prefixArgs: [] }
}

/**
 * Pack this checkout and give the tarball a content-addressed name, so the
 * dependency spec changes whenever Homebridge's build output changes and npm
 * can never resolve a stale copy out of its cache.
 */
async function packHomebridge(npm, arch) {
  if (!existsSync(join(repoRoot, 'dist', 'cli.js'))) {
    throw new Error('dist/cli.js is missing — run "npm run build" before staging the desktop app')
  }

  const packOutput = capture(npm.command, [
    ...npm.prefixArgs,
    'pack',
    '--pack-destination',
    cacheDir,
    '--loglevel',
    'error',
  ], { cwd: repoRoot })

  const packedName = packOutput.trim().split('\n').pop().trim()
  const packedPath = join(cacheDir, packedName)
  const digest = createHash('sha256').update(await readFile(packedPath)).digest('hex').slice(0, 12)
  const stableName = packedName.replace(/\.tgz$/, `-${digest}.tgz`)

  await copyFile(packedPath, join(cacheDir, stableName))
  await rm(packedPath, { force: true })

  // Drop tarballs left behind by earlier builds so the cache does not grow
  // without bound across repeated releases.
  for (const entry of readdirSync(cacheDir)) {
    if (entry.startsWith('homebridge-') && entry.endsWith('.tgz') && entry !== stableName) {
      await rm(join(cacheDir, entry), { force: true })
    }
  }

  log(`packed ${stableName} for win-${arch}`)
  return stableName
}

/**
 * On Windows, `@homebridge/node-pty-prebuilt-multiarch` is only usable once its
 * post-install has populated `build/Release` — the published tarball ships
 * Linux prebuilds only. Fail the build here rather than shipping a bundle whose
 * web UI exits on startup.
 */
function verifyNodePty(configUiDir, crossStaged) {
  const releaseDir = join(serverStagingDir, 'node_modules', '@homebridge', 'node-pty-prebuilt-multiarch', 'build', 'Release')
  const hasNativeBinding = existsSync(releaseDir) && readdirSync(releaseDir).some(entry => entry.endsWith('.node'))

  if (hasNativeBinding) {
    return
  }

  const message = 'node-pty has no Windows native binding in build/Release — homebridge-config-ui-x will not start'

  if (crossStaged) {
    log(`WARNING: ${message}`)
    log('WARNING: this bundle is for inspection only, re-stage on Windows before packaging a release')
    return
  }

  throw new Error(`${message}. Check that the install scripts for @homebridge/node-pty-prebuilt-multiarch ran (do not pass --ignore-scripts), then re-run with --clean.\nStaged UI: ${configUiDir}`)
}

/**
 * The desktop app is versioned by the Homebridge release it ships, and
 * electron-builder reads that version from desktop/package.json. Sync it here
 * so bumping the library version is enough.
 */
async function syncAppVersion(version) {
  const manifestPath = join(desktopDir, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

  if (manifest.version === version) {
    return
  }

  manifest.version = version
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  log(`synced desktop/package.json to version ${version}`)
}

async function main() {
  const clean = process.argv.includes('--clean')
  const allowCrossStage = process.argv.includes('--allow-cross-stage')
  const crossStaged = process.platform !== 'win32'

  if (crossStaged && !allowCrossStage) {
    throw new Error([
      `Refusing to stage the desktop server bundle on ${process.platform}.`,
      'homebridge-config-ui-x depends on @homebridge/node-pty-prebuilt-multiarch, whose Windows',
      'binaries are only assembled when npm install runs on Windows. Run this on a Windows host,',
      'or pass --allow-cross-stage to produce a bundle for inspection that must not be shipped.',
    ].join('\n'))
  }

  const appConfig = readAppConfig()
  const nodeVersion = resolveNodeVersion(appConfig)
  const arch = process.env.HOMEBRIDGE_DESKTOP_NODE_ARCH || appConfig.nodeArch
  const homebridgePackage = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'))

  await syncAppVersion(homebridgePackage.version)
  await mkdir(cacheDir, { recursive: true })

  if (clean) {
    log('removing previously staged server bundle')
    await rm(serverStagingDir, { recursive: true, force: true })
  }

  await mkdir(serverStagingDir, { recursive: true })

  const npm = resolveNpm()
  log(npm.bundled ? 'using the bundled Node.js 22 runtime and its npm' : `using npm via ${npm.command}`)

  const tarball = await packHomebridge(npm, arch)

  await writeFile(join(serverStagingDir, 'package.json'), `${JSON.stringify({
    name: 'homebridge-desktop-server',
    version: homebridgePackage.version,
    private: true,
    description: 'Server bundle shipped inside Homebridge Desktop — not published.',
    dependencies: {
      'homebridge': `file:../../cache/${tarball}`,
      'homebridge-config-ui-x': appConfig.configUiVersion,
    },
  }, null, 2)}\n`)

  const env = { ...process.env }

  if (crossStaged) {
    log(`cross-staging from ${process.platform} — targeting win32/${arch} for native prebuilds`)
    // prebuild-install (used by @homebridge/node-pty-prebuilt-multiarch) reads
    // these to pick which prebuilt binary to download.
    env.npm_config_platform = 'win32'
    env.npm_config_arch = arch
    env.npm_config_target_arch = arch
    env.npm_config_runtime = 'node'
    env.npm_config_target = nodeVersion
    env.npm_config_build_from_source = 'false'
  }

  run(npm.command, [
    ...npm.prefixArgs,
    'install',
    '--omit=dev',
    '--os=win32',
    `--cpu=${arch}`,
    '--no-audit',
    '--no-fund',
    '--loglevel=warn',
  ], { cwd: serverStagingDir, env })

  const homebridgeDir = join(serverStagingDir, 'node_modules', 'homebridge')
  const configUiDir = join(serverStagingDir, 'node_modules', 'homebridge-config-ui-x')

  for (const [label, path] of [['homebridge', homebridgeDir], ['homebridge-config-ui-x', configUiDir]]) {
    if (!existsSync(join(path, 'package.json'))) {
      throw new Error(`Staging failed: ${label} is missing from the server bundle`)
    }
  }
  if (!existsSync(join(configUiDir, 'dist', 'bin', 'hb-service.js'))) {
    throw new Error('Staging failed: hb-service.js is missing from homebridge-config-ui-x')
  }

  verifyNodePty(configUiDir, crossStaged)

  const stagedConfigUi = JSON.parse(await readFile(join(configUiDir, 'package.json'), 'utf8'))

  await writeFile(join(serverStagingDir, '.stage-info.json'), `${JSON.stringify({
    homebridgeVersion: homebridgePackage.version,
    configUiVersion: stagedConfigUi.version,
    nodeVersion,
    arch,
    crossStaged,
    stagedAt: new Date().toISOString(),
  }, null, 2)}\n`)

  log(`staged homebridge ${homebridgePackage.version} + homebridge-config-ui-x ${stagedConfigUi.version}`)
}

main().catch((error) => {
  process.stderr.write(`[stage-server] ${error.message}\n`)
  process.exitCode = 1
})
