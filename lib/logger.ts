import * as chalk from 'chalk';
import * as util from 'util';

/**
 * Logger class
 */
export class Logger {

  public prefix: string;

  constructor(prefix: string = '') {
    this.prefix = prefix;
  }

  public debug(...args: any[]) {
    if (DEBUG_ENABLED)
      this.log.apply(this, ['debug'].concat(Array.prototype.slice.call(arguments)));
  }
  
  public info(...args: any[]) {
    this.log.apply(this, ['info'].concat(Array.prototype.slice.call(arguments)));
  }
  
  public warn(...args: any[]) {
    this.log.apply(this, ['warn'].concat(Array.prototype.slice.call(arguments)));
  }
  
  public error(...args: any[]) {
    this.log.apply(this, ['error'].concat(Array.prototype.slice.call(arguments)));
  }
  
  public log(level, msg) {
  
    msg = util.format.apply(util, Array.prototype.slice.call(arguments, 1));
    let func = console.log;
  
    if (level == 'debug') {
      msg = chalk.gray(msg);
    }
    else if (level == 'warn') {
      msg = chalk.yellow(msg);
      func = console.error;
    }
    else if (level == 'error') {
      msg = chalk.bold.red(msg);
      func = console.error;
    }
  
    // prepend prefix if applicable
    if (this.prefix)
      msg = chalk.cyan("[" + this.prefix +  "]") + " " + msg;
  
    // prepend timestamp
    if (TIMESTAMP_ENABLED) {
      const date = new Date();
      msg =  chalk.white("[" + date.toLocaleString() + "]") + " " + msg;
    }
  
    func(msg);
  }

}


export function withPrefix(prefix: string) {
  
  if (!loggerCache[prefix]) {
    // create a class-like logger thing that acts as a function as well
    // as an instance of Logger.
    const logger = new Logger(prefix);
    const log = logger.info.bind(logger);
    log.debug = logger.debug;
    log.info = logger.info;
    log.warn = logger.warn;
    log.error = logger.error;
    log.log = logger.log;
    log.prefix = logger.prefix;
    loggerCache[prefix] = log;
  }

  return loggerCache[prefix];
}


let DEBUG_ENABLED = false;
let TIMESTAMP_ENABLED = true;

// Turns on debug level logging
export function setDebugEnabled(enabled) {
  DEBUG_ENABLED = enabled;
}

export const _system = new Logger(null);

// Turns off timestamps in log messages
export function setTimestampEnabled(timestamp) {
  TIMESTAMP_ENABLED = timestamp;
}

// Force color in log messages, even when output is redirected
export function forceColor() {
  chalk.Instance.apply({level: 1, enabled: true});
}

// global cache of logger instances by plugin name
export const loggerCache = {};
