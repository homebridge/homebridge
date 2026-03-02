"use strict";
/* global NodeJS */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = cli;
const node_process_1 = __importDefault(require("node:process"));
const hap_nodejs_1 = require("@homebridge/hap-nodejs");
const commander_1 = require("commander");
const semver_1 = require("semver");
const logger_js_1 = require("./logger.js");
const server_js_1 = require("./server.js");
const user_js_1 = require("./user.js");
const version_js_1 = __importStar(require("./version.js"));
require("source-map-support/register.js");
const log = logger_js_1.Logger.internal;
const requiredNodeVersion = (0, version_js_1.getRequiredNodeVersion)();
if (requiredNodeVersion && !(0, semver_1.satisfies)(node_process_1.default.version, requiredNodeVersion)) {
    log.warn(`Homebridge requires a Node.js version of ${requiredNodeVersion} which does \
not satisfy the current Node.js version of ${node_process_1.default.version}. You may need to upgrade your installation of Node.js - see https://homebridge.io/w/JTKEF`);
}
function cli() {
    let insecureAccess = false;
    let hideQRCode = false;
    let keepOrphans = false;
    let customPluginPath;
    let strictPluginResolution = false;
    let noLogTimestamps = false;
    let debugModeEnabled = false;
    let forceColourLogging = false;
    let customStoragePath;
    let shuttingDown = false;
    const program = new commander_1.Command();
    program
        .version((0, version_js_1.default)())
        .allowExcessArguments()
        .option('-C, --color', 'force color in logging', () => forceColourLogging = true)
        .option('-D, --debug', 'turn on debug level logging', () => debugModeEnabled = true)
        .option('-I, --insecure', 'allow unauthenticated requests (for easier hacking)', () => insecureAccess = true)
        .option('-P, --plugin-path [path]', 'look for plugins installed at [path] as well as the default locations ([path] can also point to a single plugin)', path => customPluginPath = path)
        .option('-Q, --no-qrcode', 'do not issue QRcode in logging', () => hideQRCode = true)
        .option('-K, --keep-orphans', 'keep cached accessories for which the associated plugin is not loaded', () => keepOrphans = true)
        .option('-T, --no-timestamp', 'do not issue timestamps in logging', () => noLogTimestamps = true)
        .option('-U, --user-storage-path [path]', 'look for homebridge user files at [path] instead of the default location (~/.homebridge)', path => customStoragePath = path)
        .option('--strict-plugin-resolution', 'only load plugins from the --plugin-path if set, otherwise from the primary global node_modules', () => strictPluginResolution = true)
        .parse(node_process_1.default.argv);
    if (noLogTimestamps) {
        logger_js_1.Logger.setTimestampEnabled(false);
    }
    if (debugModeEnabled) {
        logger_js_1.Logger.setDebugEnabled(true);
    }
    if (forceColourLogging) {
        logger_js_1.Logger.forceColor();
    }
    if (customStoragePath) {
        user_js_1.User.setStoragePath(customStoragePath);
    }
    // Initialize HAP-NodeJS with a custom persist directory
    hap_nodejs_1.HAPStorage.setCustomStoragePath(user_js_1.User.persistPath());
    const options = {
        keepOrphanedCachedAccessories: keepOrphans,
        insecureAccess,
        hideQRCode,
        customPluginPath,
        noLogTimestamps,
        debugModeEnabled,
        forceColourLogging,
        customStoragePath,
        strictPluginResolution,
    };
    const server = new server_js_1.Server(options);
    const signalHandler = (signal, signalNum) => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        log.info('Got %s, shutting down Homebridge...', signal);
        setTimeout(() => node_process_1.default.exit(128 + signalNum), 5000);
        void server.teardown();
    };
    node_process_1.default.on('SIGINT', signalHandler.bind(undefined, 'SIGINT', 2));
    node_process_1.default.on('SIGTERM', signalHandler.bind(undefined, 'SIGTERM', 15));
    const errorHandler = (error) => {
        if (error.stack) {
            log.error(error.stack);
        }
        if (!shuttingDown) {
            node_process_1.default.kill(node_process_1.default.pid, 'SIGTERM');
        }
    };
    node_process_1.default.on('uncaughtException', errorHandler);
    server.start().catch(errorHandler);
}
//# sourceMappingURL=cli.js.map