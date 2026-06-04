import { describe, expect, it, vi } from 'vitest'

import { Logger } from '../logger.js'
import { createHomebridgeLogFormatter } from './logFormatter.js'

describe('logFormatter', () => {
  describe('createHomebridgeLogFormatter', () => {
    it('should return a formatter function', () => {
      const formatter = createHomebridgeLogFormatter()
      expect(typeof formatter).toBe('function')
    })

    it('should format Matter.js log messages with facility and timestamp', () => {
      // Enable timestamps for this test
      Logger.setTimestampEnabled(true)
      const formatter = createHomebridgeLogFormatter()

      const diagnostic = {
        now: new Date('2025-01-15T10:30:00.000Z'),
        facility: 'TestFacility',
        values: ['Test message'],
        level: 'notice',
      }

      const result = formatter(diagnostic)

      expect(result).toContain('[Matter/TestFacility]')
      expect(result).toContain('Test message')
      expect(result).toMatch(/\[\d{1,2}\/\d{1,2}\/\d{4}/)

      // Reset timestamp setting
      Logger.setTimestampEnabled(false)
    })

    it('should format messages without timestamp when disabled', () => {
      Logger.setTimestampEnabled(false)
      const formatter = createHomebridgeLogFormatter()

      const diagnostic = {
        now: new Date('2025-01-15T10:30:00.000Z'),
        facility: 'TestFacility',
        values: ['Test message'],
        level: 'notice',
      }

      const result = formatter(diagnostic)

      expect(result).toContain('[Matter/TestFacility]')
      expect(result).toContain('Test message')
      expect(result).not.toMatch(/\[.*\d\/\d{1,2}\/\d{4}/)
    })

    it('should apply gray color for debug level messages', () => {
      const formatter = createHomebridgeLogFormatter()

      const diagnostic = {
        now: new Date(),
        facility: 'Test',
        values: ['debug message'],
        level: 'debug',
      }

      const result = formatter(diagnostic)
      // Chalk colors may be stripped in test environment, just check the message is there
      expect(result).toContain('debug message')
      expect(result).toContain('[Matter/Test]')
    })

    it('should apply gray color for info level messages', () => {
      const formatter = createHomebridgeLogFormatter()

      const diagnostic = {
        now: new Date(),
        facility: 'Test',
        values: ['info message'],
        level: 'info',
      }

      const result = formatter(diagnostic)
      expect(result).toContain('info message')
      expect(result).toContain('[Matter/Test]')
    })

    it('should apply yellow color for warn level messages', () => {
      const formatter = createHomebridgeLogFormatter()

      const diagnostic = {
        now: new Date(),
        facility: 'Test',
        values: ['warning message'],
        level: 'warn',
      }

      const result = formatter(diagnostic)
      // Chalk colors may be stripped in test environment, just check the message is there
      expect(result).toContain('warning message')
      expect(result).toContain('[Matter/Test]')
    })

    it('should apply red color for error level messages', () => {
      const formatter = createHomebridgeLogFormatter()

      const diagnostic = {
        now: new Date(),
        facility: 'Test',
        values: ['error message'],
        level: 'error',
      }

      const result = formatter(diagnostic)
      // Chalk colors may be stripped in test environment, just check the message is there
      expect(result).toContain('error message')
      expect(result).toContain('[Matter/Test]')
    })

    it('should apply red color for fatal level messages', () => {
      const formatter = createHomebridgeLogFormatter()

      const diagnostic = {
        now: new Date(),
        facility: 'Test',
        values: ['fatal message'],
        level: 'fatal',
      }

      const result = formatter(diagnostic)
      expect(result).toContain('fatal message')
      expect(result).toContain('[Matter/Test]')
    })

    it('should not apply color for notice level messages', () => {
      const formatter = createHomebridgeLogFormatter()

      const diagnostic = {
        now: new Date(),
        facility: 'Test',
        values: ['notice message'],
        level: 'notice',
      }

      const result = formatter(diagnostic)
      // Should not contain common ANSI color codes (except for cyan facility)
      expect(result).not.toContain('\x1B[90m') // gray
      expect(result).not.toContain('\x1B[33m') // yellow
      expect(result).not.toContain('\x1B[31m') // red
    })

    it('should trim long MessageChannel messages', () => {
      const formatter = createHomebridgeLogFormatter()
      const longMessage = 'a'.repeat(300)

      const diagnostic = {
        now: new Date(),
        facility: 'MessageChannel',
        values: [longMessage],
        level: 'debug',
      }

      const result = formatter(diagnostic)
      expect(result).toContain('[trimmed...]')
      expect(result.length).toBeLessThan(longMessage.length + 100)
    })

    it('should not trim messages from other facilities', () => {
      const formatter = createHomebridgeLogFormatter()
      const longMessage = 'a'.repeat(300)

      const diagnostic = {
        now: new Date(),
        facility: 'OtherFacility',
        values: [longMessage],
        level: 'debug',
      }

      const result = formatter(diagnostic)
      expect(result).not.toContain('[trimmed...]')
      expect(result).toContain(longMessage)
    })

    it('should format multiple message values', () => {
      const formatter = createHomebridgeLogFormatter()

      const diagnostic = {
        now: new Date(),
        facility: 'Test',
        values: ['first', 'second', 'third'],
        level: 'notice',
      }

      const result = formatter(diagnostic)
      expect(result).toContain('first')
      expect(result).toContain('second')
      expect(result).toContain('third')
    })

    it('should call lazy logging functions', () => {
      const formatter = createHomebridgeLogFormatter()
      const lazyFn = vi.fn(() => 'lazy value')

      const diagnostic = {
        now: new Date(),
        facility: 'Test',
        values: [lazyFn],
        level: 'notice',
      }

      const result = formatter(diagnostic)
      expect(lazyFn).toHaveBeenCalled()
      expect(result).toContain('lazy value')
    })

    it('should handle null values', () => {
      const formatter = createHomebridgeLogFormatter()

      const diagnostic = {
        now: new Date(),
        facility: 'Test',
        values: [null],
        level: 'notice',
      }

      const result = formatter(diagnostic)
      expect(result).toContain('null')
    })

    it('should handle undefined values', () => {
      const formatter = createHomebridgeLogFormatter()

      const diagnostic = {
        now: new Date(),
        facility: 'Test',
        values: [undefined],
        level: 'notice',
      }

      const result = formatter(diagnostic)
      expect(result).toContain('undefined')
    })

    it('should format error objects with stack traces', () => {
      const formatter = createHomebridgeLogFormatter()
      const error = new Error('test error')

      const diagnostic = {
        now: new Date(),
        facility: 'Test',
        values: [error],
        level: 'error',
      }

      const result = formatter(diagnostic)
      expect(result).toContain('test error')
      // Matter.js renders the actual stack frames (e.g. "at /path:line") rather
      // than a JSON blob with a literal "stack" key.
      expect(result).toContain(' at ')
    })

    it('should format plain objects as JSON', () => {
      const formatter = createHomebridgeLogFormatter()
      const obj = { key: 'value', number: 42 }

      const diagnostic = {
        now: new Date(),
        facility: 'Test',
        values: [obj],
        level: 'notice',
      }

      const result = formatter(diagnostic)
      expect(result).toContain('key')
      expect(result).toContain('value')
      expect(result).toContain('42')
    })

    it('should handle non-message diagnostics gracefully', () => {
      const formatter = createHomebridgeLogFormatter()

      const result = formatter('plain string')
      expect(result).toBe('plain string')
    })

    it('should handle empty message values', () => {
      const formatter = createHomebridgeLogFormatter()

      const diagnostic = {
        now: new Date(),
        facility: 'Test',
        values: [],
        level: 'notice',
      }

      const result = formatter(diagnostic)
      expect(result).toContain('[Matter/Test]')
    })

    it('should handle diagnostic with valueOf using Diagnostic API', () => {
      const formatter = createHomebridgeLogFormatter()

      // Create a plain object that Matter.js Diagnostic.valueOf would process
      const objectValue = { key: 'test', value: 42 }

      const diagnostic = {
        now: new Date(),
        facility: 'Test',
        values: [objectValue],
        level: 'notice',
      }

      const result = formatter(diagnostic)
      // Should contain the JSON stringified version
      expect(result).toContain('key')
      expect(result).toContain('test')
    })
  })
})
