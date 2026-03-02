"use strict";
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
exports.Plugin = void 0;
const node_assert_1 = __importDefault(require("node:assert"));
const node_path_1 = require("node:path");
const node_process_1 = __importDefault(require("node:process"));
const node_url_1 = require("node:url");
const semver_1 = require("semver");
const logger_js_1 = require("./logger.js");
const pluginManager_js_1 = require("./pluginManager.js");
const version_js_1 = __importDefault(require("./version.js"));
const log = logger_js_1.Logger.internal;
/**
 * Represents a loaded Homebridge plugin.
 */
class Plugin {
    pluginName;
    scope; // npm package scope
    pluginPath; // like "/usr/local/lib/node_modules/homebridge-lockitron"
    disabled = false; // mark the plugin as disabled
    // ------------------ package.json content ------------------
    version;
    main;
    mainPath; // resolved path to the main module file
    loadContext;
    // ----------------------------------------------------------
    pluginInitializer; // default exported function from the plugin that initializes it
    registeredAccessories = new Map();
    registeredPlatforms = new Map();
    activeDynamicPlatforms = new Map();
    constructor(name, path, packageJSON, scope) {
        this.pluginName = name;
        this.scope = scope;
        this.pluginPath = path;
        this.version = packageJSON.version || '0.0.0';
        this.main = '';
        // figure out the main module
        // exports is available - https://nodejs.org/dist/latest-v14.x/docs/api/packages.html#packages_package_entry_points
        if (packageJSON.exports) {
            // main entrypoint - https://nodejs.org/dist/latest-v14.x/docs/api/packages.html#packages_main_entry_point_export
            if (typeof packageJSON.exports === 'string') {
                this.main = packageJSON.exports;
            }
            else { // subpath export - https://nodejs.org/dist/latest-v14.x/docs/api/packages.html#packages_subpath_exports
                // conditional exports - https://nodejs.org/dist/latest-v14.x/docs/api/packages.html#packages_conditional_exports
                const exports = packageJSON.exports.import || packageJSON.exports.require || packageJSON.exports.node || packageJSON.exports.default || packageJSON.exports['.'];
                // check if conditional export is nested
                if (typeof exports !== 'string') {
                    if (exports.import) {
                        this.main = exports.import;
                    }
                    else {
                        this.main = exports.require || exports.node || exports.default;
                    }
                }
                else {
                    this.main = exports;
                }
            }
        }
        // exports search was not successful, fallback to package.main, using index.js as fallback
        if (!this.main) {
            this.main = packageJSON.main || './index.js';
        }
        // very temporary fix for first wave of plugins
        if (packageJSON.peerDependencies && (!packageJSON.engines || !packageJSON.engines.homebridge)) {
            packageJSON.engines = packageJSON.engines || {};
            packageJSON.engines.homebridge = packageJSON.peerDependencies.homebridge;
        }
        this.loadContext = {
            engines: packageJSON.engines,
            dependencies: packageJSON.dependencies,
        };
    }
    getPluginIdentifier() {
        return (this.scope ? `${this.scope}/` : '') + this.pluginName;
    }
    getPluginPath() {
        return this.pluginPath;
    }
    registerAccessory(name, constructor) {
        if (this.registeredAccessories.has(name)) {
            throw new Error(`Plugin '${this.getPluginIdentifier()}' tried to register an accessory '${name}' which has already been registered!`);
        }
        if (!this.disabled) {
            log.info('Registering accessory \'%s\'', `${this.getPluginIdentifier()}.${name}`);
        }
        this.registeredAccessories.set(name, constructor);
    }
    registerPlatform(name, constructor) {
        if (this.registeredPlatforms.has(name)) {
            throw new Error(`Plugin '${this.getPluginIdentifier()}' tried to register a platform '${name}' which has already been registered!`);
        }
        if (!this.disabled) {
            log.info('Registering platform \'%s\'', `${this.getPluginIdentifier()}.${name}`);
        }
        this.registeredPlatforms.set(name, constructor);
    }
    getAccessoryConstructor(accessoryIdentifier) {
        const name = pluginManager_js_1.PluginManager.getAccessoryName(accessoryIdentifier);
        const constructor = this.registeredAccessories.get(name);
        if (!constructor) {
            throw new Error(`The requested accessory '${name}' was not registered by the plugin '${this.getPluginIdentifier()}'.`);
        }
        return constructor;
    }
    getPlatformConstructor(platformIdentifier) {
        const name = pluginManager_js_1.PluginManager.getPlatformName(platformIdentifier);
        const constructor = this.registeredPlatforms.get(name);
        if (!constructor) {
            throw new Error(`The requested platform '${name}' was not registered by the plugin '${this.getPluginIdentifier()}'.`);
        }
        // If it's a dynamic platform plugin, ensure it's not enabled multiple times.
        if (this.activeDynamicPlatforms.has(name)) {
            throw new Error(`The dynamic platform ${name} from the plugin ${this.getPluginIdentifier()} is configured `
                + 'times in your config.json.');
        }
        return constructor;
    }
    assignDynamicPlatform(platformIdentifier, platformPlugin) {
        const name = pluginManager_js_1.PluginManager.getPlatformName(platformIdentifier);
        let platforms = this.activeDynamicPlatforms.get(name);
        if (!platforms) {
            platforms = [];
            this.activeDynamicPlatforms.set(name, platforms);
        }
        // the last platform published should be at the first position for easy access
        // we just try to mimic pre 1.0.0 behavior
        platforms.unshift(platformPlugin);
    }
    getActiveDynamicPlatform(platformName) {
        const platforms = this.activeDynamicPlatforms.get(platformName);
        // we always use the last registered
        return platforms && platforms[0];
    }
    async load() {
        const context = this.loadContext;
        (0, node_assert_1.default)(context, 'Reached illegal state. Plugin state is undefined!');
        this.loadContext = undefined; // free up memory
        // pluck out the Homebridge version requirement
        if (!context.engines || !context.engines.homebridge) {
            throw new Error(`Plugin ${this.pluginPath} does not contain the 'homebridge' package in 'engines'.`);
        }
        const versionRequired = context.engines.homebridge;
        const nodeVersionRequired = context.engines.node;
        // make sure the version is satisfied by the currently running version of Homebridge
        if (!(0, semver_1.satisfies)((0, version_js_1.default)(), versionRequired, { includePrerelease: true })) {
            // TODO - change this back to an error
            log.warn(`The plugin "${this.pluginName}" requires a Homebridge version of ${versionRequired} which does \
not satisfy the current Homebridge version of v${(0, version_js_1.default)()}. You may need to update this plugin (or Homebridge) to a newer version. \
You may face unexpected issues or stability problems running this plugin.`);
        }
        // make sure the version is satisfied by the currently running version of Node
        if (nodeVersionRequired && !(0, semver_1.satisfies)(node_process_1.default.version, nodeVersionRequired)) {
            log.warn(`The plugin "${this.pluginName}" requires a Node.js version of ${nodeVersionRequired} which does \
not satisfy the current Node.js version of ${node_process_1.default.version}. You may need to upgrade your installation of Node.js - see https://homebridge.io/w/JTKEF`);
        }
        const dependencies = context.dependencies || {};
        if (dependencies.homebridge || dependencies['hap-nodejs'] || dependencies['@homebridge/hap-nodejs']) {
            log.error(`The plugin "${this.pluginName}" defines 'homebridge' and/or 'hap-nodejs' in their 'dependencies' section, \
meaning they carry an additional copy of homebridge and hap-nodejs. This not only wastes disk space, but also can cause \
major incompatibility issues and thus is considered bad practice. Please inform the developer to update their plugin!`);
        }
        const mainPath = (0, node_path_1.join)(this.pluginPath, this.main);
        this.mainPath = mainPath;
        // try to import it and grab the exported initialization hook
        // pathToFileURL(specifier).href to turn a path into a "file url"
        // see https://github.com/nodejs/node/issues/31710
        const pluginModules = (await Promise.resolve(`${(0, node_url_1.pathToFileURL)(mainPath).href}`).then(s => __importStar(require(s)))).default;
        if (typeof pluginModules === 'function') {
            this.pluginInitializer = pluginModules;
        }
        else if (pluginModules && typeof pluginModules.default === 'function') {
            this.pluginInitializer = pluginModules.default;
        }
        else {
            throw new Error(`Plugin ${this.pluginPath} does not export a initializer function from main.`);
        }
    }
    initialize(api) {
        if (!this.pluginInitializer) {
            throw new Error('Tried to initialize a plugin which hasn\'t been loaded yet!');
        }
        return this.pluginInitializer(api);
    }
    /**
     * Reload the plugin by invalidating the module cache and loading it again.
     * This allows for hot-reloading of plugins without restarting the entire Homebridge process.
     */
    async reload() {
        if (!this.mainPath) {
            throw new Error('Cannot reload plugin that has not been loaded yet!');
        }
        log.info(`Reloading plugin: ${this.getPluginIdentifier()}`);
        // Reset plugin state
        this.pluginInitializer = undefined;
        this.registeredAccessories.clear();
        this.registeredPlatforms.clear();
        this.activeDynamicPlatforms.clear();
        // For ESM modules, use a cache-busting query parameter to force re-import
        const pluginModules = (await Promise.resolve(`${(0, node_url_1.pathToFileURL)(this.mainPath).href + '?reload=' + Date.now()}`).then(s => __importStar(require(s)))).default;
        if (typeof pluginModules === 'function') {
            this.pluginInitializer = pluginModules;
        }
        else if (pluginModules && typeof pluginModules.default === 'function') {
            this.pluginInitializer = pluginModules.default;
        }
        else {
            throw new Error(`Plugin ${this.pluginPath} does not export a initializer function from main.`);
        }
        log.info(`Successfully reloaded plugin: ${this.getPluginIdentifier()}`);
    }
}
exports.Plugin = Plugin;
//# sourceMappingURL=plugin.js.map