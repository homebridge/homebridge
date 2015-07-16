import log from 'npmlog';

// global cache of logger instances by provider name
let loggerCache = {};

export class Logger {
  
  constructor(providerName: string) {
    this.providerName = providerName;
  }
  
  info(msg: string) {
    log.info(`[${this.providerName}] ${msg}`);
  }

  warn(msg: string) {
    log.warn(`[${this.providerName}] ${msg}`);
  }

  error(msg: string) {
    log.error(`[${this.providerName}] ${msg}`);
  }
  
  static forProvider(providerName: string):Logger {
    return loggerCache[providerName] || (loggerCache[providerName] = new Logger(providerName));
  }
}