import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { afterAll, describe, expect, it } from 'vitest'

import { HomebridgeAPI } from '../api.js'

/**
 * matter.js sets itself up when it is first loaded. Nothing here imports it at
 * the top, so that the first load happens inside the test, through the same
 * call Homebridge makes at start.
 */
describe('the process-wide set-up of matter.js', () => {
  const home = mkdtempSync(join(tmpdir(), 'hb-matter-home-'))

  afterAll(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('is switched off before matter.js is loaded with the Matter API', async () => {
    // A config file as another matter.js tool of this user could have left it
    mkdirSync(join(home, '.matter'), { recursive: true })
    writeFileSync(join(home, '.matter', 'config.json'), JSON.stringify({
      mdns: { ipv4: false },
    }))
    process.env.HOME = home
    process.env.APPDATA = home
    const uncaughtListenersBefore = process.listenerCount('uncaughtExceptionMonitor')

    await new HomebridgeAPI().loadMatterAPI()

    const { Environment } = await import('@matter/main')
    const vars = Environment.default.vars
    // the config file is not read
    expect(vars.get('mdns.ipv4')).toBeUndefined()
    // no second print of every uncaught error in the process
    expect(process.listenerCount('uncaughtExceptionMonitor')).toBe(uncaughtListenersBefore)
    // signals and the exit code stay with Homebridge
    expect(vars.get('runtime.signals')).toBe(false)
    expect(vars.get('runtime.exitcode')).toBe(false)
    expect(vars.get('runtime.unhandlederrors')).toBe(false)
  }, 30000)
})
