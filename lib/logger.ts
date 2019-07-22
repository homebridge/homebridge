import util from 'util';

import chalk from 'chalk';

var DEBUG_ENABLED = false;
var TIMESTAMP_ENABLED = true;

// Turns on debug level logging
export function setDebugEnabled(enabled: boolean) {
  DEBUG_ENABLED = enabled;
}

// Turns off timestamps in log messages
export function setTimestampEnabled(timestamp: boolean) {
  TIMESTAMP_ENABLED = timestamp;
}

// Force color in log messages, even when output is redirected
export function forceColor() {
  chalk.enabled = true;
  chalk.level = 1;
}

// global cache of logger instances by plugin name
const loggerCache: Record<string, Logger> = {};

/**
 * Logger class
 */
export class Logger {
    constructor(public prefix: string = '') {
    }

    debug(...msg: string[]) {
        if (DEBUG_ENABLED) {
            this.log('debug', ...msg);
            //this.log.apply(this, ['debug'].concat(Array.prototype.slice.call(arguments)));
        }
    }

    info(...msg: string[]) {
        this.log('info', ...msg);
    }

    warn(...msg: string[]) {
        this.log('warn', ...msg);
    }

    error(...msg: string[]) {
        this.log('error', ...msg);
    }

    log(level: string, ...msg: any[]) {
        const [ format, ...params ] = msg;
        let newMsg = util.format(format, ...params);
        //let newMsg = util.format.apply(util, Array.prototype.slice.call(msg, 1));
        let func = console.log;
        if (level == 'debug') {
            newMsg = chalk.gray(newMsg);
        }
        else if (level == 'warn') {
            newMsg = chalk.yellow(newMsg);
            func = console.error;
        }
        else if (level == 'error') {
            newMsg = chalk.bold.red(newMsg);
            func = console.error;
        }
        // prepend prefix if applicable
        if (this.prefix)
            newMsg = chalk.cyan("[" + this.prefix + "]") + " " + newMsg;
        // prepend timestamp
        if (TIMESTAMP_ENABLED) {
            var date = new Date();
            newMsg = chalk.white("[" + date.toLocaleString() + "]") + " " + newMsg;
        }
        func(newMsg);
    }

    static withPrefix(prefix: string): Logger {
        if (!loggerCache[prefix]) {
            // create a class-like logger thing that acts as a function as well
            // as an instance of Logger.
            var logger = new Logger(prefix);
            var log: any = logger.info.bind(logger);
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
}

export const _system = new Logger();
