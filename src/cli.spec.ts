import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// We intercept Server construction so cli() doesn't actually start a Homebridge
// instance — only the signal-handler wiring is under test.
vi.mock('./server.js', () => ({
  Server: class FakeServer {
    constructor() {}
    start = vi.fn().mockResolvedValue(undefined)
    teardown = vi.fn().mockResolvedValue(undefined)
  },
}))

// Avoid spinning up the real HAP storage init.
vi.mock('@homebridge/hap-nodejs', () => ({
  HAPStorage: {
    setCustomStoragePath: vi.fn(),
  },
}))

vi.mock('./logger.js', () => ({
  Logger: {
    internal: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    setTimestampEnabled: vi.fn(),
    setDebugEnabled: vi.fn(),
    forceColor: vi.fn(),
  },
}))

vi.mock('./user.js', () => ({
  User: {
    setStoragePath: vi.fn(),
    persistPath: vi.fn().mockReturnValue('/tmp/persist'),
  },
}))

vi.mock('./version.js', () => ({
  default: () => '2.0.0',
  getRequiredNodeVersion: () => '^22 || ^24',
}))

describe('cli', () => {
  let processOnSpy: any
  let setTimeoutSpy: any
  let signalHandlers: Record<string, (signal: string, signalNum: number) => void>
  let fakeTimer: { unref: ReturnType<typeof vi.fn> }
  let uncaughtException: (error: unknown) => void
  let killSpy: any

  beforeEach(() => {
    signalHandlers = {}
    processOnSpy = vi.spyOn(process, 'on').mockImplementation((event: any, handler: any) => {
      if (event === 'SIGINT' || event === 'SIGTERM') {
        signalHandlers[event] = handler
      }
      if (event === 'uncaughtException') {
        uncaughtException = handler
      }
      return process
    })
    killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)

    fakeTimer = {
      unref: vi.fn(),
    }
    setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(() => fakeTimer as any)
  })

  afterEach(() => {
    processOnSpy.mockRestore()
    setTimeoutSpy.mockRestore()
    killSpy.mockRestore()
    process.exitCode = undefined
  })

  it('schedules a 5s force-exit fallback and unref()s it on signal', async () => {
    const { default: cli } = await import('./cli.js')
    cli()

    // Drive the SIGTERM handler the cli registered.
    expect(typeof signalHandlers.SIGTERM).toBe('function')
    signalHandlers.SIGTERM('SIGTERM', 15)

    // The fallback setTimeout should be 5000 ms.
    const fiveSecondCall = setTimeoutSpy.mock.calls.find(([, ms]: any[]) => ms === 5000)
    expect(fiveSecondCall).toBeDefined()
    // And it must be unref'd — without this, the process waits the full 5s
    // before exiting even when teardown finishes promptly.
    expect(fakeTimer.unref).toHaveBeenCalled()
  })

  it('debounces a second signal so the timer is only scheduled once', async () => {
    const { default: cli } = await import('./cli.js')
    cli()

    signalHandlers.SIGTERM('SIGTERM', 15)
    signalHandlers.SIGINT('SIGINT', 2)

    // The second signal should hit the `shuttingDown` early-return and not
    // schedule another 5000ms force-exit timer.
    const fiveSecondCalls = setTimeoutSpy.mock.calls.filter(([, ms]: any[]) => ms === 5000)
    expect(fiveSecondCalls).toHaveLength(1)
  })

  describe('a fatal error', () => {
    async function logged(): Promise<string> {
      const { Logger } = await import('./logger.js')
      return vi.mocked(Logger.internal.error).mock.calls.flat().join('\n')
    }

    beforeEach(async () => {
      const { Logger } = await import('./logger.js')
      vi.mocked(Logger.internal.error).mockClear()
      const { default: cli } = await import('./cli.js')
      cli()
    })

    it('logs the stack of an Error', async () => {
      uncaughtException(new Error('plugin bug'))

      expect(await logged()).toContain('Error: plugin bug')
    })

    it.each([
      { thrown: 'device offline', shows: '\'device offline\'' },
      {
        thrown: { code: 42 },
        shows: '{ code: 42 }',
      },
      { thrown: null, shows: 'null' },
      { thrown: undefined, shows: 'undefined' },
    ])('says what was thrown when it is not an Error ($shows)', async ({ thrown, shows }) => {
      expect(() => uncaughtException(thrown)).not.toThrow()

      expect(await logged()).toContain(shows)
    })

    it('starts the shutdown', () => {
      uncaughtException(new Error('plugin bug'))

      expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM')
    })
  })
})
