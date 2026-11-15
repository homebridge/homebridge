import type { MockInstance } from 'vitest'

import type { LogLevel } from './logger.js'

import chalk from 'chalk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from './logger.js'

describe('logger', () => {
  let consoleLogSpy: MockInstance
  let consoleErrorSpy: MockInstance

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    Logger.setDebugEnabled(false) // back to the default, also when a test failed
  })

  it('should create a new logger with a prefix', () => {
    const logger = Logger.withPrefix('test')
    expect(logger.prefix).toBe('test')
  })

  it('should log info level messages', () => {
    const logger = Logger.withPrefix('test')
    logger.info('test message')
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test message'))
  })

  it('should log success level messages', () => {
    const logger = Logger.withPrefix('test')
    logger.success('test message')
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test message'))
  })

  it('should log warn level messages', () => {
    const logger = Logger.withPrefix('test')
    logger.warn('test message')
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('test message'))
  })

  it('should log error level messages', () => {
    const logger = Logger.withPrefix('test')
    logger.error('test message')
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('test message'))
  })

  it('should not log debug level messages when debug is disabled (via method)', () => {
    const logger = Logger.withPrefix('test')
    logger.debug('test message')
    expect(consoleLogSpy).not.toHaveBeenCalled()
  })

  it('should log debug level messages when debug is enabled (via method, no param)', () => {
    Logger.setDebugEnabled()
    const logger = Logger.withPrefix('test')
    logger.debug('test message')
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test message'))
  })

  it('should log debug level messages when debug is enabled (via method, with param)', () => {
    Logger.setDebugEnabled(true)
    const logger = Logger.withPrefix('test')
    logger.debug('test message')
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test message'))
  })

  describe('timestamps', () => {
    // The real timestamp follows the locale of the machine (`3/1/2026, 4:05:06 PM` in the US,
    // `01/03/2026, 16:05:06` in the UK), so the tests give the date a fixed text of their own.
    const STAMP = 'the-time-now'
    let localeStringSpy: MockInstance

    beforeEach(() => {
      localeStringSpy = vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue(STAMP)
    })

    afterEach(() => {
      localeStringSpy.mockRestore()
      Logger.setTimestampEnabled(true) // back to the default, also when a test failed
    })

    it('should include timestamps in log messages by default', () => {
      expect(Logger.isTimestampEnabled()).toBe(true)
      Logger.withPrefix('test').info('test message')
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/\[the-time-now\] .*\[test\].* test message/))
    })

    it('should not include timestamps in log messages when timestamp is disabled (via method)', () => {
      Logger.setTimestampEnabled(false)
      Logger.withPrefix('test').info('test message')
      expect(Logger.isTimestampEnabled()).toBe(false)
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test message'))
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining(STAMP))
    })

    it('should include timestamps in log messages when timestamp is enabled (via method, no param)', () => {
      Logger.setTimestampEnabled(false)
      Logger.setTimestampEnabled()
      Logger.withPrefix('test').info('test message')
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/\[the-time-now\] .*test message/))
    })

    it('should include timestamps in log messages when timestamp is enabled (via method, with param)', () => {
      Logger.setTimestampEnabled(false)
      Logger.setTimestampEnabled(true)
      Logger.withPrefix('test').info('test message')
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/\[the-time-now\] .*test message/))
    })
  })

  it('should set chalk level to 1 when forceColor is enabled (via method)', () => {
    Logger.forceColor()
    expect(chalk.level).toBe(1)
  })

  it('should let every method be passed around on its own', async () => {
    Logger.setDebugEnabled(true)
    const logger = Logger.withPrefix('detached')
    const { info, success, warn, error, debug, log } = logger

    info('info message')
    success('success message')
    debug('debug message')
    log('info' as LogLevel, 'log message')
    warn('warn message')
    await Promise.reject(new Error('lost device')).catch(error)

    for (const message of [
      'info message',
      'success message',
      'debug message',
      'log message',
    ]) {
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`\\[detached\\].*${message}`)))
    }
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringMatching(/\[detached\].*warn message/))
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringMatching(/\[detached\].*lost device/))
  })

  it('should not throw from a detached debug method when debug logging is off', () => {
    const { debug } = Logger.withPrefix('detached')
    expect(() => debug('debug message')).not.toThrow()
    expect(consoleLogSpy).not.toHaveBeenCalled()
  })

  it('should return the same logger when called with the same prefix', () => {
    const logger1 = Logger.withPrefix('test')
    const logger2 = Logger.withPrefix('test')
    expect(logger1).toBe(logger2)
  })

  it('should create different loggers for different prefixes', () => {
    const logger1 = Logger.withPrefix('test1')
    const logger2 = Logger.withPrefix('test2')
    expect(logger1).not.toBe(logger2)
    expect(logger1.prefix).toBe('test1')
    expect(logger2.prefix).toBe('test2')
  })
})
