import { fork } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import { Logger } from './logger.js';
import { User } from './user.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// eslint-disable-next-line no-restricted-syntax
export var ChildProcessMessageEventType;
(function (ChildProcessMessageEventType) {
    /**
     * Sent from the child process when it is ready to accept config
     */
    ChildProcessMessageEventType["READY"] = "ready";
    /**
     * Sent to the child process with a ChildProcessLoadEventData payload
     */
    ChildProcessMessageEventType["LOAD"] = "load";
    /**
     * Sent from the child process once it has loaded the plugin
     */
    ChildProcessMessageEventType["LOADED"] = "loaded";
    /**
     * Sent to the child process telling it to start
     */
    ChildProcessMessageEventType["START"] = "start";
    /**
     * Sent from the child process when the bridge is online
     */
    ChildProcessMessageEventType["ONLINE"] = "online";
    /**
     * Sent from the child when it wants to request port allocation for an external accessory
     */
    ChildProcessMessageEventType["PORT_REQUEST"] = "portRequest";
    /**
     * Sent from the parent with the port allocation response
     */
    ChildProcessMessageEventType["PORT_ALLOCATED"] = "portAllocated";
    /**
     * Sent from the child to update its current status
     */
    ChildProcessMessageEventType["STATUS_UPDATE"] = "status";
})(ChildProcessMessageEventType || (ChildProcessMessageEventType = {}));
// eslint-disable-next-line no-restricted-syntax
export var ChildBridgeStatus;
(function (ChildBridgeStatus) {
    /**
     * When the child bridge is loading, or restarting
     */
    ChildBridgeStatus["PENDING"] = "pending";
    /**
     * The child bridge is online and has published it's accessory
     */
    ChildBridgeStatus["OK"] = "ok";
    /**
     * The bridge is shutting down, or the process ended unexpectedly
     */
    ChildBridgeStatus["DOWN"] = "down";
})(ChildBridgeStatus || (ChildBridgeStatus = {}));
/**
 * Manages the child processes of platforms/accessories being exposed as separate forked bridges.
 * A child bridge runs a single platform or accessory.
 */
export class ChildBridgeService {
    type;
    identifier;
    plugin;
    bridgeConfig;
    homebridgeConfig;
    homebridgeOptions;
    api;
    ipcService;
    externalPortService;
    child;
    args = [];
    processEnv = {};
    shuttingDown = false;
    lastBridgeStatus = "pending" /* ChildBridgeStatus.PENDING */;
    pairedStatus = null;
    manuallyStopped = false;
    setupUri = null;
    pluginConfig = [];
    log;
    displayName;
    restartCount = 0;
    maxRestarts = 4;
    constructor(type, identifier, plugin, bridgeConfig, homebridgeConfig, homebridgeOptions, api, ipcService, externalPortService) {
        this.type = type;
        this.identifier = identifier;
        this.plugin = plugin;
        this.bridgeConfig = bridgeConfig;
        this.homebridgeConfig = homebridgeConfig;
        this.homebridgeOptions = homebridgeOptions;
        this.api = api;
        this.ipcService = ipcService;
        this.externalPortService = externalPortService;
        this.log = Logger.withPrefix(this.plugin.getPluginIdentifier());
        this.api.on('shutdown', () => {
            this.shuttingDown = true;
            this.teardown();
        });
        // make sure we don't hit the max listeners limit
        this.api.setMaxListeners(this.api.getMaxListeners() + 1);
    }
    /**
     * Start the child bridge service
     */
    start() {
        this.setProcessFlags();
        this.setProcessEnv();
        this.startChildProcess();
        // set display name
        if (this.pluginConfig.length > 1 || this.pluginConfig.length === 0) {
            this.displayName = this.plugin.getPluginIdentifier();
        }
        else {
            this.displayName = this.pluginConfig[0]?.name || this.plugin.getPluginIdentifier();
        }
        // re-configured log with display name
        this.log = Logger.withPrefix(this.displayName);
    }
    /**
     * Add a config block to a child bridge.
     * Platform child bridges can only contain one config block.
     * @param config
     */
    addConfig(config) {
        this.pluginConfig.push(config);
    }
    get bridgeStatus() {
        return this.lastBridgeStatus;
    }
    set bridgeStatus(value) {
        this.lastBridgeStatus = value;
        this.sendStatusUpdate();
    }
    /**
     * Start the child bridge process
     */
    startChildProcess() {
        this.bridgeStatus = "pending" /* ChildBridgeStatus.PENDING */;
        this.child = fork(resolve(__dirname, 'childBridgeFork.js'), this.args, this.processEnv);
        this.child.stdout?.on('data', (data) => {
            process.stdout.write(data);
        });
        this.child.stderr?.on('data', (data) => {
            process.stderr.write(data);
        });
        this.child.on('error', (e) => {
            this.bridgeStatus = "down" /* ChildBridgeStatus.DOWN */;
            this.log.error('Child bridge process error', e);
        });
        this.child.once('close', (code, signal) => {
            this.handleProcessClose(code, signal);
        });
        // handle incoming ipc messages from the child process
        this.child.on('message', (message) => {
            if (typeof message !== 'object' || !message.id) {
                return;
            }
            switch (message.id) {
                case "ready" /* ChildProcessMessageEventType.READY */: {
                    this.log(`Child bridge starting${this.child?.pid ? ` (pid ${this.child.pid})` : ''}...`);
                    this.loadPlugin();
                    break;
                }
                case "loaded" /* ChildProcessMessageEventType.LOADED */: {
                    const version = message.data.version;
                    if (this.pluginConfig.length > 1) {
                        this.log.success(`Child bridge started successfully with ${this.pluginConfig.length} accessories (plugin v${version}).`);
                    }
                    else {
                        this.log.success(`Child bridge started successfully (plugin v${version}).`);
                    }
                    this.startBridge();
                    break;
                }
                case "online" /* ChildProcessMessageEventType.ONLINE */: {
                    this.bridgeStatus = "ok" /* ChildBridgeStatus.OK */;
                    break;
                }
                case "portRequest" /* ChildProcessMessageEventType.PORT_REQUEST */: {
                    this.handlePortRequest(message.data);
                    break;
                }
                case "status" /* ChildProcessMessageEventType.STATUS_UPDATE */: {
                    this.pairedStatus = message.data.paired;
                    this.setupUri = message.data.setupUri;
                    this.sendStatusUpdate();
                    break;
                }
            }
        });
    }
    /**
     * Called when the child bridge process exits, if Homebridge is not shutting down, it will restart the process
     * @param code
     * @param signal
     */
    handleProcessClose(code, signal) {
        const isLikelyPluginCrash = code === 1 && signal === null;
        this.log.warn(`Child bridge ended (code ${code}, signal ${signal}).${isLikelyPluginCrash
            ? ' The child bridge ended unexpectedly, which is normally due to the plugin not catching its errors properly. Please report this to the plugin developer by clicking on the'
                + ' \'Report An Issue\' option in the plugin menu dropdown from the Homebridge UI. If there are related logs shown above, please include them in your report.'
            : ''}`);
        if (isLikelyPluginCrash) {
            if (this.restartCount < this.maxRestarts) {
                this.bridgeStatus = "pending" /* ChildBridgeStatus.PENDING */;
                this.restartCount += 1;
                const delay = this.restartCount * 10; // first attempt after 10 seconds, second after 20 seconds, etc.
                this.log(`Child bridge will automatically restart in ${delay} seconds (restart attempt ${this.restartCount} of ${this.maxRestarts}).`);
                setTimeout(() => {
                    if (!this.shuttingDown) {
                        this.startChildProcess();
                    }
                }, delay * 1000);
            }
            else {
                this.bridgeStatus = "down" /* ChildBridgeStatus.DOWN */;
                this.manuallyStopped = true;
                this.log.error(`Child bridge will no longer restart after failing ${this.maxRestarts + 1} times, you will need to manually start this child bridge from the Homebridge UI.`);
            }
            return;
        }
        if (!this.shuttingDown) {
            this.bridgeStatus = "down" /* ChildBridgeStatus.DOWN */;
            this.restartCount = 0;
            this.startChildProcess();
        }
    }
    /**
     * Helper function to send a message to the child process
     * @param type
     * @param data
     */
    sendMessage(type, data) {
        if (this.child && this.child.connected) {
            this.child.send({
                id: type,
                data,
            });
        }
    }
    /**
     * Some plugins may make use of the homebridge process flags
     * These will be passed through to the forked process
     */
    setProcessFlags() {
        if (this.bridgeConfig.debugModeEnabled) {
            this.args.push('-D');
        }
        if (this.homebridgeOptions.forceColourLogging) {
            this.args.push('-C');
        }
        if (this.homebridgeOptions.insecureAccess) {
            this.args.push('-I');
        }
        if (this.homebridgeOptions.noLogTimestamps) {
            this.args.push('-T');
        }
        if (this.homebridgeOptions.keepOrphanedCachedAccessories) {
            this.args.push('-K');
        }
        if (this.homebridgeOptions.customStoragePath) {
            this.args.push('-U', this.homebridgeOptions.customStoragePath);
        }
        if (this.homebridgeOptions.customPluginPath) {
            this.args.push('-P', this.homebridgeOptions.customPluginPath);
        }
    }
    /**
     * Set environment variables for the child process
     */
    setProcessEnv() {
        this.processEnv = {
            env: {
                ...process.env,
                DEBUG: `${process.env.DEBUG || ''} ${this.bridgeConfig.env?.DEBUG || ''}`.trim(),
                NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} ${this.bridgeConfig.env?.NODE_OPTIONS || ''}`.trim(),
            },
            silent: true,
        };
    }
    /**
     * Tell the child process to load the given plugin
     */
    loadPlugin() {
        const bridgeConfig = {
            name: this.bridgeConfig.name || this.displayName || this.plugin.getPluginIdentifier(),
            port: this.bridgeConfig.port,
            username: this.bridgeConfig.username,
            advertiser: this.homebridgeConfig.bridge.advertiser,
            pin: this.bridgeConfig.pin || this.homebridgeConfig.bridge.pin,
            bind: this.homebridgeConfig.bridge.bind,
            setupID: this.bridgeConfig.setupID,
            manufacturer: this.bridgeConfig.manufacturer || this.homebridgeConfig.bridge.manufacturer,
            model: this.bridgeConfig.model || this.homebridgeConfig.bridge.model,
            firmwareRevision: this.bridgeConfig.firmwareRevision || this.homebridgeConfig.bridge.firmwareRevision,
            serialNumber: this.bridgeConfig.serialNumber || this.bridgeConfig.username,
        };
        const bridgeOptions = {
            cachedAccessoriesDir: User.cachedAccessoryPath(),
            cachedAccessoriesItemName: `cachedAccessories.${this.bridgeConfig.username.replace(/:/g, '').toUpperCase()}`,
        };
        // shallow copy the homebridge options to the bridge options object
        Object.assign(bridgeOptions, this.homebridgeOptions);
        this.sendMessage("load" /* ChildProcessMessageEventType.LOAD */, {
            type: this.type,
            identifier: this.identifier,
            pluginPath: this.plugin.getPluginPath(),
            pluginConfig: this.pluginConfig,
            bridgeConfig,
            bridgeOptions,
            homebridgeConfig: {
                bridge: this.homebridgeConfig.bridge,
                ports: this.homebridgeConfig.ports,
                disabledPlugins: [], // not used by child bridges
                accessories: [], // not used by child bridges
                platforms: [], // not used by child bridges
            },
        });
    }
    /**
     * Tell the child bridge to start broadcasting
     */
    startBridge() {
        this.sendMessage("start" /* ChildProcessMessageEventType.START */);
    }
    /**
     * Handle external port requests from child
     */
    async handlePortRequest(request) {
        const port = await this.externalPortService.requestPort(request.username);
        this.sendMessage("portAllocated" /* ChildProcessMessageEventType.PORT_ALLOCATED */, {
            username: request.username,
            port,
        });
    }
    /**
     * Send sigterm to the child bridge
     */
    teardown() {
        if (this.child && this.child.connected) {
            this.bridgeStatus = "down" /* ChildBridgeStatus.DOWN */;
            this.child.kill('SIGTERM');
        }
    }
    /**
     * Trigger sending child bridge metadata to the process parent via IPC
     */
    sendStatusUpdate() {
        this.ipcService.sendMessage("childBridgeStatusUpdate" /* IpcOutgoingEvent.CHILD_BRIDGE_STATUS_UPDATE */, this.getMetadata());
    }
    /**
     * Restarts the child bridge process
     */
    restartChildBridge() {
        if (this.manuallyStopped) {
            this.restartCount = 0;
            this.startChildBridge();
        }
        else {
            this.log.warn('Child bridge restarting...');
            this.refreshConfig();
            this.teardown();
        }
    }
    /**
     * Stops the child bridge, not starting it again
     */
    stopChildBridge() {
        if (!this.shuttingDown) {
            this.log.warn('Child bridge stopping, will not restart.');
            this.shuttingDown = true;
            this.manuallyStopped = true;
            this.restartCount = 0;
            this.bridgeStatus = "down" /* ChildBridgeStatus.DOWN */;
            this.child?.removeAllListeners('close');
            this.teardown();
        }
        else {
            this.log.warn('Child bridge already shutting down or stopped.');
        }
    }
    /**
     * Starts the child bridge, only if it was manually stopped and is no longer running
     */
    startChildBridge() {
        if (this.manuallyStopped && this.bridgeStatus === "down" /* ChildBridgeStatus.DOWN */ && (!this.child || !this.child.connected)) {
            this.refreshConfig();
            this.startChildProcess();
            this.shuttingDown = false;
            this.manuallyStopped = false;
        }
        else {
            this.log.warn('Child bridge cannot be started, it is still running or was not manually stopped.');
        }
    }
    /**
     * Read the config.json file from disk and refresh the plugin config block for just this plugin
     */
    async refreshConfig() {
        try {
            const homebridgeConfig = await fs.readJson(User.configPath());
            if (this.type === "platform" /* PluginType.PLATFORM */) {
                const config = homebridgeConfig.platforms?.filter(x => x.platform === this.identifier && x._bridge?.username === this.bridgeConfig.username);
                if (config.length) {
                    this.pluginConfig = config;
                    this.bridgeConfig = this.pluginConfig[0]._bridge || this.bridgeConfig;
                }
                else {
                    this.log.warn('Platform config could not be found, using existing config.');
                }
            }
            else if (this.type === "accessory" /* PluginType.ACCESSORY */) {
                const config = homebridgeConfig.accessories?.filter(x => x.accessory === this.identifier && x._bridge?.username === this.bridgeConfig.username);
                if (config.length) {
                    this.pluginConfig = config;
                    this.bridgeConfig = this.pluginConfig[0]._bridge || this.bridgeConfig;
                }
                else {
                    this.log.warn('Accessory config could not be found, using existing config.');
                }
            }
        }
        catch (error) {
            this.log.error('Failed to refresh plugin config:', error.message);
        }
    }
    /**
     * Returns metadata about this child bridge
     */
    getMetadata() {
        return {
            status: this.bridgeStatus,
            paired: this.pairedStatus,
            setupUri: this.setupUri,
            username: this.bridgeConfig.username,
            port: this.bridgeConfig.port,
            pin: this.bridgeConfig.pin || this.homebridgeConfig.bridge.pin,
            name: this.bridgeConfig.name || this.displayName || this.plugin.getPluginIdentifier(),
            plugin: this.plugin.getPluginIdentifier(),
            identifier: this.identifier,
            pid: this.child?.pid,
            manuallyStopped: this.manuallyStopped,
        };
    }
}
//# sourceMappingURL=childBridgeService.js.map