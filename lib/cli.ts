import program from 'commander';
import hap from "hap-nodejs";

import version from './version';
import {Server} from './server';
import {Plugin} from './plugin';
import {User} from './user';
import * as Logger from "./logger";

const log = Logger._system;

export default () => {
  let cleanCachedAccessories = false
  let insecureAccess = false;
  let hideQRCode = false;
  let shuttingDown = false;

  program
    .version(version)
    .option('-C, --color', 'force color in logging', () => { Logger.forceColor(); })
    .option('-D, --debug', 'turn on debug level logging', () => { Logger.setDebugEnabled(true); })
    .option('-I, --insecure', 'allow unauthenticated requests (for easier hacking)', () => { insecureAccess = true; })
    .option('-P, --plugin-path [path]', 'look for plugins installed at [path] as well as the default locations ([path] can also point to a single plugin)', (p) => { Plugin.addPluginPath(p); })
    .option('-Q, --no-qrcode', 'do not issue QRcode in logging', () => { hideQRCode = true; })
    .option('-R, --remove-orphans', 'remove cached accessories for which plugin is not loaded', () => { cleanCachedAccessories = true; })
    .option('-T, --no-timestamp', 'do not issue timestamps in logging', () => { Logger.setTimestampEnabled(false); })
    .option('-U, --user-storage-path [path]', 'look for homebridge user files at [path] instead of the default location (~/.homebridge)', (p) => { User.setStoragePath(p); })
    .parse(process.argv);

  // Initialize HAP-NodeJS with a custom persist directory
  hap.init(User.persistPath());

  const server = new Server({
    cleanCachedAccessories,
    hideQRCode,
    insecureAccess,
  });

  const signals: Record<string, number> = {'SIGINT': 2, 'SIGTERM': 15};
  Object.keys(signals).forEach((signal: any) => {
    process.on(signal, () => {
      if (shuttingDown) {
        return
      }
      shuttingDown = true;

      log.info("Got %s, shutting down Homebridge...", signal);

      server._teardown();
      setTimeout(function (){
        process.exit(128 + signals[signal]);
      }, 5000)
      server._api.emit('shutdown')
    });
  });

  process.on('uncaughtException', (error: Error) => {
    log.error(error.stack!);
    if (!shuttingDown) {
      process.kill(process.pid, 'SIGTERM');
    }
  });

  server.run();
}
