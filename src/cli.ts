import "source-map-support/register"; // registering node-source-map-support for typescript stack traces
import commander from "commander";
import getVersion, { getRequiredNodeVersion } from "./version";
import { Logger } from "./logger";
import { User } from "./user";
import { HomebridgeOptions, Server } from "./server";
import { init } from "hap-nodejs";
import Signals = NodeJS.Signals;
import { satisfies } from "semver";

const log = Logger.internal;

const requiredNodeVersion = getRequiredNodeVersion();
if (requiredNodeVersion && !satisfies(process.version, requiredNodeVersion)) {
  log.warn(`Homebridge requires Node version of ${requiredNodeVersion} which does \
not satisfy the current Node version of ${process.version}. You may need to upgrade your installation of Node.`);
}

// noinspection JSUnusedGlobalSymbols
export = function cli(): void {
  let insecureAccess = false;
  let hideQRCode = false;
  let cleanCachedAccessories = false;
  let customPluginPath: string | undefined = undefined;

  let shuttingDown = false;

  commander
    .version(getVersion())
    .option("-C, --color", "force color in logging", () => Logger.forceColor())
    .option("-D, --debug", "turn on debug level logging", () => Logger.setDebugEnabled(true))
    .option("-I, --insecure", "allow unauthenticated requests (for easier hacking)", () => insecureAccess = true)
    .option("-P, --plugin-path [path]", "look for plugins installed at [path] as well as the default locations ([path] can also point to a single plugin)", path => customPluginPath = path)
    .option("-Q, --no-qrcode", "do not issue QRcode in logging", () => hideQRCode = true)
    .option("-R, --remove-orphans", "remove cached accessories for which plugin is not loaded", () => cleanCachedAccessories = true)
    .option("-T, --no-timestamp", "do not issue timestamps in logging", () => Logger.setTimestampEnabled(false))
    .option("-U, --user-storage-path [path]", "look for homebridge user files at [path] instead of the default location (~/.homebridge)", path => User.setStoragePath(path))
    .parse(process.argv);

  // Initialize HAP-NodeJS with a custom persist directory
  init(User.persistPath());

  const options: HomebridgeOptions = {
    cleanCachedAccessories: cleanCachedAccessories,
    insecureAccess: insecureAccess,
    hideQRCode: hideQRCode,
    customPluginPath: customPluginPath,
  };

  const server = new Server(options);

  const signalHandler = (signal: Signals, signalNum: number): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    log.info("Got %s, shutting down Homebridge...", signal);

    server.teardown();
    setTimeout(() => process.exit(128 + signalNum), 5000);
  };
  process.on("SIGINT", signalHandler.bind(undefined, "SIGINT", 2));
  process.on("SIGTERM", signalHandler.bind(undefined, "SIGTERM", 15));

  const errorHandler = (error: Error): void => {
    if (error.stack) {
      log.error(error.stack);
    }

    if (!shuttingDown) {
      process.kill(process.pid, "SIGTERM");
    }
  };
  process.on("uncaughtException", errorHandler);
  server.start().catch(errorHandler);
}
