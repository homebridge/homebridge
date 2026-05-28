import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = new URL('../.github/scripts/deprecate_npm_prereleases.sh', import.meta.url)

const registryResponse = JSON.stringify({
  versions: {
    '2.0.2-beta.3': { version: '2.0.2-beta.3' },
    '2.0.2-beta.2': { version: '2.0.2-beta.2' },
    '2.0.2-alpha.1': { version: '2.0.2-alpha.1' },
    '2.0.1-beta.1': { version: '2.0.1-beta.1' },
    '2.0.0-beta.2': { version: '2.0.0-beta.2' },
    '1.9.9-beta.1': { version: '1.9.9-beta.1' },
    '1.9.9': { version: '1.9.9' },
  },
})

const tempDirs: string[] = []

function createExecutable(path: string, source: string): void {
  writeFileSync(path, source)
  chmodSync(path, 0o755)
}

function runScript(execute = false) {
  const tempDir = mkdtempSync(join(tmpdir(), 'deprecate-npm-prereleases-'))
  const binDir = join(tempDir, 'bin')
  const npmCallsPath = join(tempDir, 'npm-calls.txt')

  tempDirs.push(tempDir)

  mkdirSync(binDir)
  writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
    name: 'homebridge',
    version: '2.0.2',
  }))

  createExecutable(join(binDir, 'curl'), `#!/usr/bin/env bash
cat <<'EOF'
${registryResponse}
EOF
`)

  createExecutable(join(binDir, 'npm'), `#!/usr/bin/env bash
printf '%s\n' "$*" >> "${npmCallsPath}"
`)

  const result = spawnSync('bash', [scriptPath.pathname, ...(execute ? ['--execute'] : [])], {
    cwd: tempDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
    },
  })

  return {
    ...result,
    npmCallsPath,
  }
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true })
  }
})

describe('deprecate_npm_prereleases.sh', () => {
  it('lists versions that would be deprecated during dry runs', () => {
    const result = runScript()

    expect(result.status).toBe(0)
    expect(result.stderr).not.toContain('tail: invalid option')
    expect(result.stdout).toContain('Found 6 pre-release versions (keeping up to 5 most recent):')
    expect(result.stdout).toContain('* Keeping version: 2.0.2-beta.3')
    expect(result.stdout).toContain('* [DRY RUN] Would run: npm deprecate homebridge@"1.9.9-beta.1" "This pre-release version is deprecated in favor of the latest release."')
    expect(result.stdout).toContain('* Would deprecate 1 pre-release versions:')
    expect(result.stdout).toContain('  * `1.9.9-beta.1`')
    expect(result.stdout).toContain('* Kept 5 most recent pre-release versions:')
  })

  it('summarizes versions actually deprecated during execute mode', () => {
    const result = runScript(true)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('* Deprecated version: 1.9.9-beta.1')
    expect(result.stdout).toContain('* Deprecated 1 pre-release versions:')
    expect(result.stdout).not.toContain('DRY RUN MODE')
    expect(result.stdout).toContain('  * `1.9.9-beta.1`')
    expect(result.stdout).toContain('* Kept 5 most recent pre-release versions:')
    expect(readFileSync(result.npmCallsPath, 'utf8')).toBe('deprecate homebridge@1.9.9-beta.1 This pre-release version is deprecated in favor of the latest release.\n')
  })
})
