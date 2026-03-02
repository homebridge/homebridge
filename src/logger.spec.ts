import type { MockInstance } from 'vitest'

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
    Logger.setDebugEnabled(false) // reset debug setting
  })

  it('should log debug level messages when debug is enabled (via method, with param)', () => {
    Logger.setDebugEnabled(true)
    const logger = Logger.withPrefix('test')
    logger.debug('test message')
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test message'))
    Logger.setDebugEnabled(false) // reset debug setting
  })

  it('should not include timestamps in log messages when timestamp is disabled (via method)', () => {
    Logger.setTimestampEnabled(false)
    const logger = Logger.withPrefix('test')
    logger.info('test message')
    expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringMatching(/\[\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2} (AM|PM)\].*/))
  })

  it('should include timestamps in log messages when timestamp is enabled (via method, no param)', () => {
    Logger.setTimestampEnabled()
    const logger = Logger.withPrefix('test')
    logger.info('test message')
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/\[\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2} (AM|PM)\].*/))
    Logger.setTimestampEnabled(false) // reset timestamp setting
  })

  it('should include timestamps in log messages when timestamp is enabled (via method, with param)', () => {
    Logger.setTimestampEnabled(true)
    const logger = Logger.withPrefix('test')
    logger.info('test message')
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/\[\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2} (AM|PM)\].*/))
    Logger.setTimestampEnabled(false) // reset timestamp setting
  })

  it('should set chalk level to 1 when forceColor is enabled (via method)', () => {
    Logger.forceColor()
    expect(chalk.level).toBe(1)
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
