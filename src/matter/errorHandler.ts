/* global NodeJS */

/**
 * Simplified Matter Error Handler
 *
 * Provides basic error categorization and logging without the complexity
 * of circuit breakers, recovery callbacks, and exponential backoff.
 *
 * This simplified version is more appropriate for alpha/beta releases.
 * Advanced features can be added later based on production error patterns.
 */

import { Logger } from '../logger.js'
import {
  MatterCommissioningError,
  MatterDeviceError,
  MatterError,
  MatterErrorType,
  MatterNetworkError,
  MatterStorageError,
} from './types.js'

const log = Logger.withPrefix('Matter/Errors')

/**
 * Simplified Matter Error Handler
 * Focuses on proper error categorization and user-friendly logging
 */
export class MatterErrorHandler {
  private static instance: MatterErrorHandler

  private constructor() {}

  static getInstance(): MatterErrorHandler {
    if (!MatterErrorHandler.instance) {
      MatterErrorHandler.instance = new MatterErrorHandler()
    }
    return MatterErrorHandler.instance
  }

  /**
   * Handle a Matter error with appropriate logging
   */
  async handleError(error: Error | MatterError, context?: string): Promise<void> {
    const matterError = this.categorizeError(error, context)
    this.logError(matterError)
  }

  /**
   * Categorize a generic error into a typed MatterError
   */
  private categorizeError(error: Error | MatterError, context?: string): MatterError {
    // If already a typed MatterError, return it
    if (error instanceof MatterError) {
      return error
    }

    const errorMessage = error.message.toLowerCase()
    const errorCode = 'code' in error ? (error as NodeJS.ErrnoException).code : undefined

    // Network errors — prefer error.code for Node.js system errors, fallback to string matching
    if (errorCode === 'EADDRINUSE' || errorMessage.includes('eaddrinuse')) {
      return new MatterNetworkError(
        `Port is already in use: ${error.message}`,
        { code: 'PORT_IN_USE', recoverable: false },
      )
    }

    if (errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT'
      || errorMessage.includes('econnrefused') || errorMessage.includes('etimedout')) {
      return new MatterNetworkError(
        `Connection failed: ${error.message}`,
        { code: 'CONNECTION_FAILED', recoverable: true },
      )
    }

    // Commissioning errors
    if (errorMessage.includes('commissioning') || errorMessage.includes('pairing')) {
      return new MatterCommissioningError(
        `Commissioning error: ${error.message}`,
        { recoverable: false },
      )
    }

    // Storage errors — prefer error.code for filesystem errors, fallback to string matching
    if (errorCode === 'ENOENT' || errorCode === 'EACCES'
      || errorMessage.includes('enoent')
      || errorMessage.includes('storage') || errorMessage.includes('corrupted')) {
      return new MatterStorageError(
        `Storage error: ${error.message}`,
        { recoverable: true },
      )
    }

    // Configuration errors
    if (errorMessage.includes('config') || errorMessage.includes('invalid')) {
      return new MatterError(
        `Configuration error: ${error.message}`,
        'CONFIGURATION_ERROR',
        { recoverable: false, type: MatterErrorType.CONFIGURATION },
      )
    }

    // Device sync errors (context-based)
    if (context?.includes('sync') || context?.includes('device')) {
      return new MatterDeviceError(
        `Device sync error: ${error.message}`,
        { recoverable: true, context },
      )
    }

    // Server errors (context-based)
    if (context?.includes('server')) {
      return new MatterError(
        `Server error: ${error.message}`,
        'SERVER_ERROR',
        { recoverable: true, type: MatterErrorType.SERVER, context },
      )
    }

    // Default to unknown error
    return new MatterError(
      error.message || 'Unknown Matter error',
      'UNKNOWN_ERROR',
      { recoverable: false, type: MatterErrorType.UNKNOWN, originalError: error },
    )
  }

  /**
   * Log error with appropriate severity and user-friendly messages
   */
  private logError(error: MatterError): void {
    if (error instanceof MatterNetworkError) {
      if (error.details?.code === 'PORT_IN_USE') {
        log.error('Matter port is already in use. Please configure a different port in your config.json.')
      } else {
        log.warn(`Matter network error: ${error.message}`)
      }
    } else if (error instanceof MatterCommissioningError) {
      log.info(`Matter commissioning issue: ${error.message}`)
    } else if (error instanceof MatterDeviceError) {
      log.debug(`Device sync error: ${error.message}`)
    } else if (error instanceof MatterStorageError) {
      log.warn(`Matter storage error: ${error.message}`)
      if (error.message.includes('corrupted')) {
        log.warn('If this persists, you may need to delete the Matter storage directory and re-pair your devices.')
      }
    } else if (error.code === 'CONFIGURATION_ERROR') {
      log.error(`Matter configuration error: ${error.message}`)
    } else if (error.code === 'SERVER_ERROR') {
      log.error(`Matter server error: ${error.message}`)
    } else {
      log.error(`Matter error: ${error.message}`)
    }

    // Log stack trace for non-recoverable errors
    if (!error.recoverable && error.stack) {
      log.debug('Stack trace:', error.stack)
    }
  }
}

// Export singleton instance
export const errorHandler = MatterErrorHandler.getInstance()
