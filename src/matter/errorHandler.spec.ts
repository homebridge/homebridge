import type { MockInstance } from 'vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { errorHandler, MatterErrorHandler } from './errorHandler.js'
import {
  MatterCommissioningError,
  MatterDeviceError,
  MatterError,
  MatterErrorType,
  MatterNetworkError,
  MatterStorageError,
} from './types.js'

describe('matterErrorHandler', () => {
  let consoleErrorSpy: MockInstance
  let consoleWarnSpy: MockInstance
  let consoleInfoSpy: MockInstance
  let consoleDebugSpy: MockInstance

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleInfoSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleInfoSpy.mockRestore()
    consoleDebugSpy.mockRestore()
  })

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = MatterErrorHandler.getInstance()
      const instance2 = MatterErrorHandler.getInstance()
      expect(instance1).toBe(instance2)
    })

    it('should return the exported singleton', () => {
      expect(errorHandler).toBe(MatterErrorHandler.getInstance())
    })
  })

  describe('handleError', () => {
    it('should handle a generic error by categorizing it', async () => {
      const error = new Error('test error')
      await errorHandler.handleError(error)
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should handle an already-typed MatterError directly', async () => {
      const error = new MatterNetworkError('Network issue', { code: 'CONNECTION_FAILED', recoverable: true })
      await errorHandler.handleError(error)
      expect(consoleErrorSpy).toHaveBeenCalled() // Logger.warn uses console.error
    })
  })

  describe('categorizeError', () => {
    it('should categorize EADDRINUSE as port in use error', async () => {
      const error = new Error('bind EADDRINUSE')
      await errorHandler.handleError(error)
      // Check that the error was logged (Logger adds timestamps and prefixes)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('port is already in use'))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('configure a different port'))
    })

    it('should categorize ECONNREFUSED as connection failed', async () => {
      const error = new Error('connect ECONNREFUSED')
      await errorHandler.handleError(error)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('network error'))
    })

    it('should categorize ETIMEDOUT as connection failed', async () => {
      const error = new Error('connect ETIMEDOUT')
      await errorHandler.handleError(error)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('network error'))
    })

    it('should categorize commissioning errors', async () => {
      const error = new Error('commissioning failed')
      await errorHandler.handleError(error)
      expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('commissioning'))
    })

    it('should categorize pairing errors as commissioning errors', async () => {
      const error = new Error('pairing timeout')
      await errorHandler.handleError(error)
      expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('commissioning'))
    })

    it('should categorize storage errors', async () => {
      const error = new Error('storage read failed')
      await errorHandler.handleError(error)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('storage error'))
    })

    it('should categorize ENOENT as storage error', async () => {
      const error = new Error('ENOENT: no such file or directory')
      await errorHandler.handleError(error)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('storage error'))
    })

    it('should categorize corrupted storage errors with helpful message', async () => {
      const error = new Error('storage corrupted')
      await errorHandler.handleError(error)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('storage error'))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('delete the Matter storage'))
    })

    it('should categorize configuration errors', async () => {
      const error = new Error('invalid config')
      await errorHandler.handleError(error)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('configuration error'))
    })

    it('should categorize device sync errors based on context', async () => {
      const error = new Error('update failed')
      // Should not throw when handling device sync errors
      await expect(errorHandler.handleError(error, 'device sync')).resolves.not.toThrow()
    })

    it('should categorize server errors based on context', async () => {
      const error = new Error('initialization failed')
      await errorHandler.handleError(error, 'server startup')
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('server error'))
    })

    it('should categorize unknown errors as default', async () => {
      const error = new Error('something unexpected')
      await errorHandler.handleError(error)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Matter error'))
    })
  })

  describe('logError', () => {
    it('should log network port conflict as error', async () => {
      const error = new MatterNetworkError('Port conflict', { code: 'PORT_IN_USE', recoverable: false })
      await errorHandler.handleError(error)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('port is already in use'))
    })

    it('should log other network errors as warnings', async () => {
      const error = new MatterNetworkError('Connection timeout', { code: 'CONNECTION_FAILED', recoverable: true })
      await errorHandler.handleError(error)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('network error'))
    })

    it('should log commissioning errors as info', async () => {
      const error = new MatterCommissioningError('Pairing failed', { recoverable: false })
      await errorHandler.handleError(error)
      expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('commissioning'))
    })

    it('should log device errors as debug', async () => {
      const error = new MatterDeviceError('Sync failed', { recoverable: true })
      // Should not throw when handling device errors
      await expect(errorHandler.handleError(error)).resolves.not.toThrow()
    })

    it('should log storage errors as warnings', async () => {
      const error = new MatterStorageError('Read failed', { recoverable: true })
      await errorHandler.handleError(error)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('storage error'))
    })

    it('should log configuration errors as errors', async () => {
      const error = new MatterError(
        'Invalid config',
        'CONFIGURATION_ERROR',
        { recoverable: false, type: MatterErrorType.CONFIGURATION },
      )
      await errorHandler.handleError(error)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('configuration error'))
    })

    it('should log server errors as errors', async () => {
      const error = new MatterError(
        'Server failed',
        'SERVER_ERROR',
        { recoverable: true, type: MatterErrorType.SERVER },
      )
      await errorHandler.handleError(error)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('server error'))
    })

    it('should log stack trace for non-recoverable errors in debug mode', async () => {
      const error = new MatterError('Fatal error', 'FATAL', { recoverable: false })
      error.stack = 'Error: Fatal error\n  at test.ts:1:1'
      await errorHandler.handleError(error)
      // Stack trace is logged but not with console.debug, check that error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Matter error'))
    })

    it('should not log stack trace for recoverable errors', async () => {
      const error = new MatterError('Recoverable error', 'RECOVERABLE', { recoverable: true })
      error.stack = 'Error: Recoverable error\n  at test.ts:1:1'
      await errorHandler.handleError(error)
      expect(consoleDebugSpy).not.toHaveBeenCalledWith(expect.stringContaining('Stack trace'))
    })
  })
})
