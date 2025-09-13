import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, join, resolve } from 'node:path';
import process from 'node:process';
import { Logger } from './logger.js';
import { Plugin } from './plugin.js';
const log = Logger.internal;
const require = createRequire(import.meta.url);
const paths = require.resolve.paths('');
/**
 * Utility which exposes methods to search for installed Homebridge plugins
 */
export class PluginManager {
    // name must be prefixed with 'homebridge-' or '@scope/homebridge-'
    static PLUGIN_IDENTIFIER_PATTERN = /^((@[\w-]+(\.[\w-]+)*)\/)?(homebridge-[\w-]+)$/;
    api;
    searchPaths = new Set(); // unique set of search paths we will use to discover installed plugins
    strictPluginResolution = false;
    activePlugins;
    disabledPlugins;
    plugins = new Map();
    // we have some plugins which simply pass a wrong or misspelled plugin name to the api calls, this translation tries to mitigate this
    pluginIdentifierTranslation = new Map();
    accessoryToPluginMap = new Map();
    platformToPluginMap = new Map();
    currentInitializingPlugin; // used to match registering plugins, see handleRegisterAccessory and handleRegisterPlatform
    constructor(api, options) {
        this.api = api;
        if (options) {
            if (options.customPluginPath) {
                this.searchPaths.add(resolve(process.cwd(), options.customPluginPath));
            }
            this.strictPluginResolution = options.strictPluginResolution || false;
            this.activePlugins = options.activePlugins;
            this.disabledPlugins = Array.isArray(options.disabledPlugins) ? options.disabledPlugins : undefined;
        }
        this.api.on("registerAccessory" /* InternalAPIEvent.REGISTER_ACCESSORY */, this.handleRegisterAccessory.bind(this));
        this.api.on("registerPlatform" /* InternalAPIEvent.REGISTER_PLATFORM */, this.handleRegisterPlatform.bind(this));
    }
    static isQualifiedPluginIdentifier(identifier) {
        return PluginManager.PLUGIN_IDENTIFIER_PATTERN.test(identifier);
    }
    static extractPluginName(name) {
        return name.match(PluginManager.PLUGIN_IDENTIFIER_PATTERN)[4];
    }
    static extractPluginScope(name) {
        return name.match(PluginManager.PLUGIN_IDENTIFIER_PATTERN)[2];
    }
    static getAccessoryName(identifier) {
        if (!identifier.includes('.')) {
            return identifier;
        }
        return identifier.split('.')[1];
    }
    static getPlatformName(identifier) {
        if (!identifier.includes('.')) {
            return identifier;
        }
        return identifier.split('.')[1];
    }
    static getPluginIdentifier(identifier) {
        return identifier.split('.')[0];
    }
    async initializeInstalledPlugins() {
        log.info('---');
        this.loadInstalledPlugins();
        for (const [identifier, plugin] of this.plugins) {
            try {
                await plugin.load();
            }
            catch (error) {
                log.error('====================');
                log.error(`ERROR LOADING PLUGIN ${identifier}:`);
                log.error(error.stack);
                log.error('====================');
                this.plugins.delete(identifier);
                continue;
            }
            if (this.disabledPlugins && this.disabledPlugins.includes(plugin.getPluginIdentifier())) {
                plugin.disabled = true;
            }
            if (plugin.disabled) {
                log.warn(`Disabled plugin: ${identifier}@${plugin.version}`);
            }
            else {
                log.info(`Loaded plugin: ${identifier}@${plugin.version}`);
            }
            await this.initializePlugin(plugin, identifier);
            log.info('---');
        }
        this.currentInitializingPlugin = undefined;
    }
    async initializePlugin(plugin, identifier) {
        try {
            this.currentInitializingPlugin = plugin;
            await plugin.initialize(this.api); // call the plugin's initializer and pass it our API instance
        }
        catch (error) {
            log.error('====================');
            log.error(`ERROR INITIALIZING PLUGIN ${identifier}:`);
            log.error(error.stack);
            log.error('====================');
            this.plugins.delete(identifier);
        }
    }
    handleRegisterAccessory(name, constructor, pluginIdentifier) {
        if (!this.currentInitializingPlugin) {
            throw new Error(`Unexpected accessory registration. Plugin ${pluginIdentifier ? `'${pluginIdentifier}' ` : ''}tried to register outside the initializer function!`);
        }
        if (pluginIdentifier && pluginIdentifier !== this.currentInitializingPlugin.getPluginIdentifier()) {
            log.info(`Plugin '${this.currentInitializingPlugin.getPluginIdentifier()}' tried to register with an incorrect plugin identifier: '${pluginIdentifier}'. Please report this to the developer!`);
            this.pluginIdentifierTranslation.set(pluginIdentifier, this.currentInitializingPlugin.getPluginIdentifier());
        }
        this.currentInitializingPlugin.registerAccessory(name, constructor);
        let plugins = this.accessoryToPluginMap.get(name);
        if (!plugins) {
            plugins = [];
            this.accessoryToPluginMap.set(name, plugins);
        }
        plugins.push(this.currentInitializingPlugin);
    }
    handleRegisterPlatform(name, constructor, pluginIdentifier) {
        if (!this.currentInitializingPlugin) {
            throw new Error(`Unexpected platform registration. Plugin ${pluginIdentifier ? `'${pluginIdentifier}' ` : ''}tried to register outside the initializer function!`);
        }
        if (pluginIdentifier && pluginIdentifier !== this.currentInitializingPlugin.getPluginIdentifier()) {
            log.debug(`Plugin '${this.currentInitializingPlugin.getPluginIdentifier()}' tried to register with an incorrect plugin identifier: '${pluginIdentifier}'. Please report this to the developer!`);
            this.pluginIdentifierTranslation.set(pluginIdentifier, this.currentInitializingPlugin.getPluginIdentifier());
        }
        this.currentInitializingPlugin.registerPlatform(name, constructor);
        let plugins = this.platformToPluginMap.get(name);
        if (!plugins) {
            plugins = [];
            this.platformToPluginMap.set(name, plugins);
        }
        plugins.push(this.currentInitializingPlugin);
    }
    getPluginForAccessory(accessoryIdentifier) {
        let plugin;
        if (!accessoryIdentifier.includes('.')) { // see if it matches exactly one accessory
            let found = this.accessoryToPluginMap.get(accessoryIdentifier);
            if (!found) {
                throw new Error(`No plugin was found for the accessory "${accessoryIdentifier}" in your config.json. Please make sure the corresponding plugin is installed correctly.`);
            }
            if (found.length > 1) {
                const options = found.map(plugin => `${plugin.getPluginIdentifier()}.${accessoryIdentifier}`).join(', ');
                // check if only one of the multiple platforms is not disabled
                found = found.filter(plugin => !plugin.disabled);
                if (found.length !== 1) {
                    throw new Error(`The requested accessory '${accessoryIdentifier}' has been registered multiple times. Please be more specific by writing one of: ${options}`);
                }
            }
            plugin = found[0];
            accessoryIdentifier = `${plugin.getPluginIdentifier()}.${accessoryIdentifier}`;
        }
        else {
            const pluginIdentifier = PluginManager.getPluginIdentifier(accessoryIdentifier);
            if (!this.hasPluginRegistered(pluginIdentifier)) {
                throw new Error(`The requested plugin '${pluginIdentifier}' was not registered.`);
            }
            plugin = this.getPlugin(pluginIdentifier);
        }
        return plugin;
    }
    getPluginForPlatform(platformIdentifier) {
        let plugin;
        if (!platformIdentifier.includes('.')) { // see if it matches exactly one platform
            let found = this.platformToPluginMap.get(platformIdentifier);
            if (!found) {
                throw new Error(`No plugin was found for the platform "${platformIdentifier}" in your config.json. Please make sure the corresponding plugin is installed correctly.`);
            }
            if (found.length > 1) {
                const options = found.map(plugin => `${plugin.getPluginIdentifier()}.${platformIdentifier}`).join(', ');
                // check if only one of the multiple platforms is not disabled
                found = found.filter(plugin => !plugin.disabled);
                if (found.length !== 1) {
                    throw new Error(`The requested platform '${platformIdentifier}' has been registered multiple times. Please be more specific by writing one of: ${options}`);
                }
            }
            plugin = found[0];
            platformIdentifier = `${plugin.getPluginIdentifier()}.${platformIdentifier}`;
        }
        else {
            const pluginIdentifier = PluginManager.getPluginIdentifier(platformIdentifier);
            if (!this.hasPluginRegistered(pluginIdentifier)) {
                throw new Error(`The requested plugin '${pluginIdentifier}' was not registered.`);
            }
            plugin = this.getPlugin(pluginIdentifier);
        }
        return plugin;
    }
    hasPluginRegistered(pluginIdentifier) {
        return this.plugins.has(pluginIdentifier) || this.pluginIdentifierTranslation.has(pluginIdentifier);
    }
    getPlugin(pluginIdentifier) {
        const plugin = this.plugins.get(pluginIdentifier);
        if (plugin) {
            return plugin;
        }
        else {
            const translation = this.pluginIdentifierTranslation.get(pluginIdentifier);
            if (translation) {
                return this.plugins.get(translation);
            }
        }
        return undefined;
    }
    getPluginByActiveDynamicPlatform(platformName) {
        const found = (this.platformToPluginMap.get(platformName) || [])
            .filter(plugin => !!plugin.getActiveDynamicPlatform(platformName));
        if (found.length === 0) {
            return undefined;
        }
        else if (found.length > 1) {
            const plugins = found.map(plugin => plugin.getPluginIdentifier()).join(', ');
            throw new Error(`'${platformName}' is an ambiguous platform name. It was registered by multiple plugins: ${plugins}`);
        }
        else {
            return found[0];
        }
    }
    /**
     * Gets all plugins installed on the local system
     */
    loadInstalledPlugins() {
        this.loadDefaultPaths();
        this.searchPaths.forEach((searchPath) => {
            if (!existsSync(searchPath)) { // just because this path is in require.main.paths doesn't mean it necessarily exists!
                return;
            }
            if (existsSync(join(searchPath, 'package.json'))) { // does this path point inside a single plugin and not a directory containing plugins?
                try {
                    this.loadPlugin(searchPath);
                }
                catch (error) {
                    log.warn(error.message);
                }
            }
            else { // read through each directory in this node_modules folder
                const relativePluginPaths = readdirSync(searchPath) // search for directories only
                    .filter((relativePath) => {
                    try {
                        return statSync(resolve(searchPath, relativePath)).isDirectory();
                    }
                    catch (error) {
                        log.debug(`Ignoring path ${resolve(searchPath, relativePath)} - ${error.message}`);
                        return false;
                    }
                });
                // expand out @scoped plugins
                relativePluginPaths.slice()
                    .filter(path => path.charAt(0) === '@') // is it a scope directory?
                    .forEach((scopeDirectory) => {
                    // remove scopeDirectory from the path list
                    const index = relativePluginPaths.indexOf(scopeDirectory);
                    relativePluginPaths.splice(index, 1);
                    const absolutePath = join(searchPath, scopeDirectory);
                    readdirSync(absolutePath)
                        .filter(name => PluginManager.isQualifiedPluginIdentifier(name))
                        .filter((name) => {
                        try {
                            return statSync(resolve(absolutePath, name)).isDirectory();
                        }
                        catch (error) {
                            log.debug(`Ignoring path ${resolve(absolutePath, name)} - ${error.message}`);
                            return false;
                        }
                    })
                        .forEach(name => relativePluginPaths.push(`${scopeDirectory}/${name}`));
                });
                relativePluginPaths
                    .filter((pluginIdentifier) => {
                    return PluginManager.isQualifiedPluginIdentifier(pluginIdentifier) // needs to be a valid homebridge plugin name
                        && (!this.activePlugins || this.activePlugins.includes(pluginIdentifier)); // check if activePlugins is restricted and if so is the plugin is contained
                })
                    .forEach((pluginIdentifier) => {
                    try {
                        const absolutePath = resolve(searchPath, pluginIdentifier);
                        this.loadPlugin(absolutePath);
                    }
                    catch (error) {
                        log.warn(error.message);
                    }
                });
            }
        });
        if (this.plugins.size === 0) {
            log.warn('No plugins found.');
        }
    }
    loadPlugin(absolutePath) {
        const packageJson = PluginManager.loadPackageJSON(absolutePath);
        const identifier = packageJson.name;
        const name = PluginManager.extractPluginName(identifier);
        const scope = PluginManager.extractPluginScope(identifier); // possibly undefined
        const alreadyInstalled = this.plugins.get(identifier); // check if there is already a plugin with the same Identifier
        if (alreadyInstalled) {
            throw new Error(`Warning: skipping plugin found at '${absolutePath}' since we already loaded the same plugin from '${alreadyInstalled.getPluginPath()}'.`);
        }
        const plugin = new Plugin(name, absolutePath, packageJson, scope);
        this.plugins.set(identifier, plugin);
        return plugin;
    }
    static loadPackageJSON(pluginPath) {
        const packageJsonPath = join(pluginPath, 'package.json');
        let packageJson;
        if (!existsSync(packageJsonPath)) {
            throw new Error(`Plugin ${pluginPath} does not contain a package.json.`);
        }
        try {
            packageJson = JSON.parse(readFileSync(packageJsonPath, { encoding: 'utf8' })); // attempt to parse package.json
        }
        catch (error) {
            throw new Error(`Plugin ${pluginPath} contains an invalid package.json. Error: ${error}`);
        }
        if (!packageJson.name || !PluginManager.isQualifiedPluginIdentifier(packageJson.name)) {
            throw new Error(`Plugin ${pluginPath} does not have a package name that begins with 'homebridge-' or '@scope/homebridge-.`);
        }
        // verify that it's tagged with the correct keyword
        if (!packageJson.keywords || !packageJson.keywords.includes('homebridge-plugin')) {
            throw new Error(`Plugin ${pluginPath} package.json does not contain the keyword 'homebridge-plugin'.`);
        }
        return packageJson;
    }
    loadDefaultPaths() {
        if (this.strictPluginResolution) {
            // if strict plugin resolution is enabled:
            // * only use custom plugin path, if set;
            // * otherwise add the current npm global prefix (e.g. /usr/local/lib/node_modules)
            if (this.searchPaths.size === 0) {
                this.addNpmPrefixToSearchPaths();
            }
            return;
        }
        if (paths) {
            // add the paths used by require()
            paths.forEach(path => this.searchPaths.add(path));
        }
        // THIS SECTION FROM: https://github.com/yeoman/environment/blob/master/lib/resolver.js
        // Adding global npm directories
        // We tried using npm to get the global modules path, but it hasn't work out
        // because of bugs in the parsable implementation of `ls` command and mostly
        // performance issues. So, we go with our best bet for now.
        if (process.env.NODE_PATH) {
            process.env
                .NODE_PATH
                .split(delimiter)
                .filter(path => !!path) // trim out empty values
                .forEach(path => this.searchPaths.add(path));
        }
        else {
            // Default paths for non-windows systems
            if (process.platform !== 'win32') {
                this.searchPaths.add('/usr/local/lib/node_modules');
                this.searchPaths.add('/usr/lib/node_modules');
            }
            this.addNpmPrefixToSearchPaths();
        }
    }
    addNpmPrefixToSearchPaths() {
        if (process.platform === 'win32') {
            this.searchPaths.add(join(process.env.APPDATA, 'npm/node_modules'));
        }
        else {
            this.searchPaths.add(execSync('/bin/echo -n "$(npm -g prefix)/lib/node_modules"', {
                env: Object.assign({
                    npm_config_loglevel: 'silent',
                    npm_update_notifier: 'false',
                }, process.env),
            }).toString('utf8'));
        }
    }
}
//# sourceMappingURL=pluginManager.js.map