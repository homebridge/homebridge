import util from 'node:util'

import chalk from 'chalk'

/**
 * Log levels to indicate importance of the logged message.
 * Every level corresponds to a certain color.
 *
 * - INFO: no color
 * - SUCCESS: green
 * - WARN: yellow
 * - ERROR: red
 * - DEBUG: gray
 *
 * Messages with DEBUG level are only displayed if explicitly enabled.
 *
 * This is a `const enum`. A plugin built with plain `tsc` gets the value written into its code at
 * compile time. A plugin built with `isolatedModules` or `verbatimModuleSyntax` (esbuild, tsx, swc,
 * Vite) can not use it: TypeScript reports TS2748 ("Cannot access ambient const enums"). Call the
 * method of the level instead: `log.info(...)`, `log.warn(...)`, `log.error(...)`, `log.debug(...)`.
 * It stays a `const enum` for now: as a normal enum, every plugin built with plain `tsc` would start
 * to import the `homebridge` package at run time.
 */
// eslint-disable-next-line no-restricted-syntax
export const enum LogLevel {
  INFO = 'info',
  SUCCESS = 'success',
  WARN = 'warn',
  ERROR = 'error',
  DEBUG = 'debug',
}

/**
 * Represents a logging device which can be used directly as a function (for INFO logging)
 * but also has dedicated logging functions for respective logging levels.
 */
export interface Logging {
  prefix: string
  (message: string, ...parameters: any[]): void
  info: (message: string, ...parameters: any[]) => void
  success: (message: string, ...parameters: any[]) => void
  warn: (message: string, ...parameters: any[]) => void
  error: (message: string, ...parameters: any[]) => void
  debug: (message: string, ...parameters: any[]) => void
  log: (level: LogLevel, message: string, ...parameters: any[]) => void
}

/**
 * Logger class
 */
export class Logger {
  public static readonly internal = new Logger()
  private static readonly loggerCache = new Map<string, Logging>() // global cache of logger instances by plugin name
  private static debugEnabled = false
  private static timestampEnabled = true

  readonly prefix?: string

  constructor(prefix?: string) {
    this.prefix = prefix
  }

  /**
   * Creates a new Logging device with a specified prefix.
   *
   * @param prefix {string} - the prefix of the logger
   */
  static withPrefix(prefix: string): Logging {
    const loggerStuff = Logger.loggerCache.get(prefix)

    if (loggerStuff) {
      return loggerStuff
    } else {
      const logger = new Logger(prefix)

      // The device is a function (INFO logging) that also carries a method for each level.
      // Every method is bound to the device, so it still works when a plugin passes it around
      // on its own (`promise.catch(log.error)`, `emitter.on('error', log.warn)`, `const { debug } = log`).
      // The device itself is the `this`, as it is for `log.info('x')`, so `log.prefix` stays the prefix in use.
      const device = logger.info.bind(logger)
      const logging: Logging = Object.assign(device, {
        prefix,
        info: logger.info.bind(device),
        success: logger.success.bind(device),
        warn: logger.warn.bind(device),
        error: logger.error.bind(device),
        debug: logger.debug.bind(device),
        log: logger.log.bind(device),
      })
      Logger.loggerCache.set(prefix, logging)
      return logging
    }
  }

  /**
   * Turns on debug level logging. Off by default.
   *
   * @param enabled {boolean}
   */
  public static setDebugEnabled(enabled: boolean = true): void {
    Logger.debugEnabled = enabled
  }

  /**
   * Turns on inclusion of timestamps in log messages. On by default.
   *
   * @param enabled {boolean}
   */
  public static setTimestampEnabled(enabled: boolean = true): void {
    Logger.timestampEnabled = enabled
  }

  /**
   * Check if timestamps are enabled in log messages.
   *
   * @returns {boolean} true if timestamps are enabled
   */
  public static isTimestampEnabled(): boolean {
    return Logger.timestampEnabled
  }

  /**
   * Forces color in logging output, even if it seems like color is unsupported.
   */
  public static forceColor(): void {
    // `1` is basic 16 colour support, which is all Homebridge uses. Never lower a level that is
    // already higher: on a terminal with 256 or true colour, a plugin that uses chalk keeps it.
    chalk.level = Math.max(chalk.level, 1) as typeof chalk.level
  }

  public info(message: string, ...parameters: any[]): void {
    this.log(LogLevel.INFO, message, ...parameters)
  }

  public success(message: string, ...parameters: any[]): void {
    this.log(LogLevel.SUCCESS, message, ...parameters)
  }

  public warn(message: string, ...parameters: any[]): void {
    this.log(LogLevel.WARN, message, ...parameters)
  }

  public error(message: string, ...parameters: any[]): void {
    this.log(LogLevel.ERROR, message, ...parameters)
  }

  public debug(message: string, ...parameters: any[]): void {
    this.log(LogLevel.DEBUG, message, ...parameters)
  }

  public log(level: LogLevel, message: string, ...parameters: any[]): void {
    if (level === LogLevel.DEBUG && !Logger.debugEnabled) {
      return
    }

    message = util.format(message, ...parameters)

    let loggingFunction = console.log // eslint-disable-line no-console
    switch (level) {
      case LogLevel.SUCCESS:
        message = chalk.green(message)
        break
      case LogLevel.WARN:
        message = chalk.yellow(message)
        loggingFunction = console.error
        break
      case LogLevel.ERROR:
        message = chalk.red(message)
        loggingFunction = console.error
        break
      case LogLevel.DEBUG:
        message = chalk.gray(message)
        break
    }

    if (this.prefix) {
      message = `${getLogPrefix(this.prefix)} ${message}`
    }

    if (Logger.timestampEnabled) {
      const date = new Date()
      message = chalk.white(`[${date.toLocaleString()}] `) + message
    }

    loggingFunction(message)
  }
}

/**
 * Gets the prefix
 * @param prefix
 */
export function getLogPrefix(prefix: string): string {
  return chalk.cyan(`[${prefix}]`)
}
