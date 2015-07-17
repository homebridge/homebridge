import chalk from 'chalk';

let DEBUG_ENABLED = false;

// Turns on debug level logging
export function setDebugEnabled(enabled) {
  DEBUG_ENABLED = enabled;
}

// global cache of logger instances by provider name
let loggerCache = {};

export class Logger {
  
  constructor(providerName) {
    this.providerName = providerName;
  }

  debug(msg) {
    if (DEBUG_ENABLED)
      this.log('debug', msg);
  }
  
  info(msg) {
    this.log('info', msg);
  }

  warn(msg) {
    this.log('warn', msg);
  }

  error(msg) {
    this.log('error', msg);
  }
  
  log(level, msg) {
    
    if (level == 'debug')
      msg = chalk.gray(msg);
    else if (level == 'warn')
      msg = chalk.yellow(msg);
    else if (level == 'error')
      msg = chalk.bold.red(msg);
    
    // prepend provider name if applicable
    if (this.providerName)
      msg = chalk.cyan(`[${this.providerName}]`) + " " + msg;
      
    console.log(msg);
  }
  
  static forProvider(providerName) {
    return loggerCache[providerName] || (loggerCache[providerName] = new Logger(providerName));
  }
}

// system logger, for internal use only
export let log = new Logger();
