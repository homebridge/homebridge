import assert from 'node:assert';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { satisfies } from 'semver';
import { Logger } from './logger.js';
import { PluginManager } from './pluginManager.js';
import getVersion from './version.js';
const log = Logger.internal;
/**
 * Represents a loaded Homebridge plugin.
 */
export class Plugin {
    pluginName;
    scope; // npm package scope
    pluginPath; // like "/usr/local/lib/node_modules/homebridge-lockitron"
    disabled = false; // mark the plugin as disabled
    // ------------------ package.json content ------------------
    version;
    main;
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
        const name = PluginManager.getAccessoryName(accessoryIdentifier);
        const constructor = this.registeredAccessories.get(name);
        if (!constructor) {
            throw new Error(`The requested accessory '${name}' was not registered by the plugin '${this.getPluginIdentifier()}'.`);
        }
        return constructor;
    }
    getPlatformConstructor(platformIdentifier) {
        const name = PluginManager.getPlatformName(platformIdentifier);
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
        const name = PluginManager.getPlatformName(platformIdentifier);
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
        assert(context, 'Reached illegal state. Plugin state is undefined!');
        this.loadContext = undefined; // free up memory
        // pluck out the Homebridge version requirement
        if (!context.engines || !context.engines.homebridge) {
            throw new Error(`Plugin ${this.pluginPath} does not contain the 'homebridge' package in 'engines'.`);
        }
        const versionRequired = context.engines.homebridge;
        const nodeVersionRequired = context.engines.node;
        // make sure the version is satisfied by the currently running version of Homebridge
        if (!satisfies(getVersion(), versionRequired, { includePrerelease: true })) {
            // TODO - change this back to an error
            log.warn(`The plugin "${this.pluginName}" requires a Homebridge version of ${versionRequired} which does \
not satisfy the current Homebridge version of v${getVersion()}. You may need to update this plugin (or Homebridge) to a newer version. \
You may face unexpected issues or stability problems running this plugin.`);
        }
        // make sure the version is satisfied by the currently running version of Node
        if (nodeVersionRequired && !satisfies(process.version, nodeVersionRequired)) {
            log.warn(`The plugin "${this.pluginName}" requires a Node.js version of ${nodeVersionRequired} which does \
not satisfy the current Node.js version of ${process.version}. You may need to upgrade your installation of Node.js - see https://homebridge.io/w/JTKEF`);
        }
        const dependencies = context.dependencies || {};
        if (dependencies.homebridge || dependencies['hap-nodejs']) {
            log.error(`The plugin "${this.pluginName}" defines 'homebridge' and/or 'hap-nodejs' in their 'dependencies' section, \
meaning they carry an additional copy of homebridge and hap-nodejs. This not only wastes disk space, but also can cause \
major incompatibility issues and thus is considered bad practice. Please inform the developer to update their plugin!`);
        }
        const mainPath = join(this.pluginPath, this.main);
        // try to import it and grab the exported initialization hook
        // pathToFileURL(specifier).href to turn a path into a "file url"
        // see https://github.com/nodejs/node/issues/31710
        const pluginModules = (await import(pathToFileURL(mainPath).href)).default;
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
}
//# sourceMappingURL=plugin.js.map