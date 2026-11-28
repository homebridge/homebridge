import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// We intercept Server construction so cli() doesn't actually start a Homebridge
// instance — only the signal-handler wiring is under test.
const serverOptions: unknown[] = []

vi.mock('./server.js', () => ({
  Server: class FakeServer {
    constructor(options: unknown) {
      serverOptions.push(options)
    }

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

  describe('the options', () => {
    const originalArgv = process.argv

    afterEach(() => {
      process.argv = originalArgv
    })

    async function run(...argv: string[]): Promise<{ options: any, Logger: any, User: any, HAPStorage: any }> {
      const { Logger } = await import('./logger.js')
      const { User } = await import('./user.js')
      const { HAPStorage } = await import('@homebridge/hap-nodejs')
      for (const mock of [
        Logger.setTimestampEnabled,
        Logger.setDebugEnabled,
        Logger.forceColor,
        User.setStoragePath,
        HAPStorage.setCustomStoragePath,
      ]) {
        vi.mocked(mock).mockClear()
      }
      serverOptions.length = 0
      const { default: cli } = await import('./cli.js')
      process.argv = ['node', 'homebridge', ...argv]
      cli()
      return {
        options: serverOptions[0],
        Logger,
        User,
        HAPStorage,
      }
    }

    it('starts the server with everything off when no option is given', async () => {
      const { options, Logger, User, HAPStorage } = await run()

      expect(options).toEqual({
        keepOrphanedCachedAccessories: false,
        insecureAccess: false,
        hideQRCode: false,
        customPluginPath: undefined,
        noLogTimestamps: false,
        debugModeEnabled: false,
        forceColourLogging: false,
        customStoragePath: undefined,
        strictPluginResolution: false,
      })
      expect(Logger.setTimestampEnabled).not.toHaveBeenCalled()
      expect(Logger.setDebugEnabled).not.toHaveBeenCalled()
      expect(Logger.forceColor).not.toHaveBeenCalled()
      expect(User.setStoragePath).not.toHaveBeenCalled()
      // HAP-NodeJS keeps its data in the persist folder of the storage path
      expect(HAPStorage.setCustomStoragePath).toHaveBeenCalledExactlyOnceWith('/tmp/persist')
    })

    it.each([
      { flag: '-D', long: '--debug', option: 'debugModeEnabled' },
      { flag: '-I', long: '--insecure', option: 'insecureAccess' },
      { flag: '-Q', long: '--no-qrcode', option: 'hideQRCode' },
      { flag: '-K', long: '--keep-orphans', option: 'keepOrphanedCachedAccessories' },
      { flag: '-T', long: '--no-timestamp', option: 'noLogTimestamps' },
      { flag: '-C', long: '--color', option: 'forceColourLogging' },
      { flag: '--strict-plugin-resolution', long: '--strict-plugin-resolution', option: 'strictPluginResolution' },
    ])('$flag switches $option on, and nothing else', async ({ flag, long, option }) => {
      for (const argument of [flag, long]) {
        const { options } = await run(argument)

        const switchedOn = Object.keys(options).filter(key => options[key] === true)
        expect(switchedOn).toEqual([option])
      }
    })

    it('applies the logging options to the logger', async () => {
      const { Logger } = await run('-D', '-T', '-C')

      expect(Logger.setDebugEnabled).toHaveBeenCalledExactlyOnceWith(true)
      expect(Logger.setTimestampEnabled).toHaveBeenCalledExactlyOnceWith(false)
      expect(Logger.forceColor).toHaveBeenCalledOnce()
    })

    it('takes combined short flags', async () => {
      const { options } = await run('-DIQ')

      expect(options).toMatchObject({
        debugModeEnabled: true,
        insecureAccess: true,
        hideQRCode: true,
        keepOrphanedCachedAccessories: false,
      })
    })

    it('passes the plugin path and the storage path on', async () => {
      const { options, User } = await run('-P', '/plugins', '--user-storage-path=/storage')

      expect(options).toMatchObject({ customPluginPath: '/plugins', customStoragePath: '/storage' })
      expect(User.setStoragePath).toHaveBeenCalledExactlyOnceWith('/storage')
    })
  })

  describe('the Node.js version check', () => {
    afterEach(() => {
      vi.doUnmock('./version.js')
      vi.resetModules()
    })

    async function warningsFor(requiredNodeVersion: string | undefined): Promise<string[]> {
      vi.resetModules()
      vi.doMock('./version.js', () => ({
        default: () => '2.0.0',
        getRequiredNodeVersion: () => requiredNodeVersion,
      }))
      await import('./cli.js')
      const { Logger } = await import('./logger.js')
      return vi.mocked(Logger.internal.warn).mock.calls.map(call => String(call[0]))
    }

    it('warns when the running Node.js is not a version Homebridge supports', async () => {
      const warnings = await warningsFor('^1.0.0')

      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain(`Homebridge requires a Node.js version of ^1.0.0 which does not satisfy the current Node.js version of ${process.version}`)
    })

    it('says nothing when the running Node.js is supported, or when no version is required', async () => {
      expect(await warningsFor(`^${process.versions.node}`)).toEqual([])
      expect(await warningsFor(undefined)).toEqual([])
    })
  })

  describe('the path options', () => {
    const originalArgv = process.argv
    let exitSpy: any
    let stderrSpy: any

    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`process.exit(${code})`)
      }) as any)
      stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    })

    afterEach(() => {
      process.argv = originalArgv
      exitSpy.mockRestore()
      stderrSpy.mockRestore()
    })

    it.each([
      {
        argv: ['-U'],
        option: '-U, --user-storage-path <path>',
      },
      {
        argv: ['-P'],
        option: '-P, --plugin-path <path>',
      },
      {
        argv: ['-P', '/plugins', '-U'],
        option: '-U, --user-storage-path <path>',
      },
    ])('stops with an error when $argv has no path', async ({ argv, option }) => {
      const { User } = await import('./user.js')
      vi.mocked(User.persistPath).mockClear()
      const { default: cli } = await import('./cli.js')
      process.argv = ['node', 'homebridge', ...argv]

      expect(() => cli()).toThrow('process.exit(1)')

      const written = stderrSpy.mock.calls.flat().join('')
      expect(written).toContain(`error: option '${option}' argument missing`)
      // Homebridge did not carry on with the default storage folder
      expect(User.persistPath).not.toHaveBeenCalled()
    })

    it.each([
      ['-U', '-I'],
      ['-P', '-D'],
      ['--user-storage-path', '--insecure'],
    ])('stops with an error when %s is followed by the option %s in place of a path', async (option, next) => {
      const { User } = await import('./user.js')
      vi.mocked(User.setStoragePath).mockClear()
      vi.mocked(User.persistPath).mockClear()
      const { default: cli } = await import('./cli.js')
      process.argv = ['node', 'homebridge', option, next]

      expect(() => cli()).toThrow('process.exit(1)')

      const written = stderrSpy.mock.calls.flat().join('')
      expect(written).toContain(`argument '${next}' is invalid`)
      expect(User.setStoragePath).not.toHaveBeenCalled()
      expect(User.persistPath).not.toHaveBeenCalled()
    })

    it('uses the storage path that is given', async () => {
      const { User } = await import('./user.js')
      vi.mocked(User.setStoragePath).mockClear()
      const { default: cli } = await import('./cli.js')
      process.argv = [
        'node',
        'homebridge',
        '-P',
        '/plugins',
        '-U',
        '/storage',
      ]

      cli()

      expect(User.setStoragePath).toHaveBeenCalledExactlyOnceWith('/storage')
      expect(exitSpy).not.toHaveBeenCalled()
    })
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

    it('ends the process with exit code 1, also when the teardown finishes at once', () => {
      uncaughtException(new Error('plugin bug'))

      expect(process.exitCode).toBe(1)
    })

    it('leaves the exit code alone for a normal stop by signal', () => {
      signalHandlers.SIGTERM('SIGTERM', 15)

      expect(process.exitCode).toBeUndefined()
    })

    it('starts the shutdown', () => {
      uncaughtException(new Error('plugin bug'))

      expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM')
    })
  })
})
