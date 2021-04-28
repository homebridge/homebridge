import {
  AccessoryIdentifier,
  AccessoryName,
  AccessoryPluginConstructor,
  HomebridgeAPI,
  InternalAPIEvent,
  PlatformIdentifier,
  PlatformName,
  PlatformPluginConstructor,
  PluginIdentifier,
  PluginName,
} from "./api";
import path from "path";
import fs from "fs";
import { Plugin } from "./plugin";
import { Logger } from "./logger";
import { execSync } from "child_process";

const log = Logger.internal;

export interface PackageJSON { // incomplete type for package.json (just stuff we use here)
  name: string;
  version: string;
  keywords?: string[];

  main?: string;
  /**
   * When set as module, it marks .js file to be treated as ESM. 
   * See https://nodejs.org/dist/latest-v14.x/docs/api/esm.html#esm_enabling
   */
  type?: "module" | "commonjs"; 

  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface PluginManagerOptions {
  /**
   * Additional path to search for plugins in. Specified relative to the current working directory.
   */
  customPluginPath?: string;
  /**
   * When defined, only plugins specified here will be initialized.
   */
  activePlugins?: PluginIdentifier[];
  /**
   * Plugins that are marked as disabled and whos corresponding config blocks should be ignored
   */
  disabledPlugins?: PluginIdentifier[];
}

/**
 * Utility which exposes methods to search for installed Homebridge plugins
 */
export class PluginManager {

  // name must be prefixed with 'homebridge-' or '@scope/homebridge-'
  private static readonly PLUGIN_IDENTIFIER_PATTERN = /^((@[\w-]*)\/)?(homebridge-[\w-]*)$/;

  private readonly api: HomebridgeAPI;

  private readonly searchPaths: Set<string> = new Set(); // unique set of search paths we will use to discover installed plugins
  private readonly activePlugins?: PluginIdentifier[];
  private readonly disabledPlugins?: PluginIdentifier[];

  private readonly plugins: Map<PluginIdentifier, Plugin> = new Map();
  // we have some plugins which simply pass a wrong or misspelled plugin name to the api calls, this translation tries to mitigate this
  private readonly pluginIdentifierTranslation: Map<PluginIdentifier, PluginIdentifier> = new Map();
  private readonly accessoryToPluginMap: Map<AccessoryName, Plugin[]> = new Map();
  private readonly platformToPluginMap: Map<PlatformName, Plugin[]> = new Map();

  private currentInitializingPlugin?: Plugin; // used to match registering plugins, see handleRegisterAccessory and handleRegisterPlatform

  constructor(api: HomebridgeAPI, options?: PluginManagerOptions) {
    this.api = api;

    if (options) {
      if (options.customPluginPath) {
        this.searchPaths.add(path.resolve(process.cwd(), options.customPluginPath));
      }

      this.activePlugins = options.activePlugins;
      this.disabledPlugins = Array.isArray(options.disabledPlugins) ? options.disabledPlugins : undefined;
    }

    this.api.on(InternalAPIEvent.REGISTER_ACCESSORY, this.handleRegisterAccessory.bind(this));
    this.api.on(InternalAPIEvent.REGISTER_PLATFORM, this.handleRegisterPlatform.bind(this));
  }

  public static isQualifiedPluginIdentifier(identifier: string): boolean {
    return PluginManager.PLUGIN_IDENTIFIER_PATTERN.test(identifier);
  }

  public static extractPluginName(name: string): PluginName { // extract plugin name without @scope/ prefix
    return name.match(PluginManager.PLUGIN_IDENTIFIER_PATTERN)![3];
  }

  public static extractPluginScope(name: string): string { // extract the "@scope" of a npm module name
    return name.match(PluginManager.PLUGIN_IDENTIFIER_PATTERN)![2];
  }

  public static getAccessoryName(identifier: AccessoryIdentifier): AccessoryName {
    if (identifier.indexOf(".") === -1) {
      return identifier;
    }

    return identifier.split(".")[1];
  }

  public static getPlatformName(identifier: PlatformIdentifier): PlatformIdentifier {
    if (identifier.indexOf(".") === -1) {
      return identifier;
    }

    return identifier.split(".")[1];
  }

  public static getPluginIdentifier(identifier: AccessoryIdentifier | PlatformIdentifier): PluginIdentifier {
    return identifier.split(".")[0];
  }

  public async initializeInstalledPlugins(): Promise<void> {
    log.info("---");

    this.loadInstalledPlugins();

    for(const [identifier, plugin] of this.plugins) {
      try {
        await plugin.load();
      } catch (error) {
        log.error("====================");
        log.error(`ERROR LOADING PLUGIN ${identifier}:`);
        log.error(error.stack);
        log.error("====================");

        this.plugins.delete(identifier);
        return;
      }

      if (this.disabledPlugins && this.disabledPlugins.includes(plugin.getPluginIdentifier())) {
        plugin.disabled = true;
      }

      if (plugin.disabled) {
        log.warn(`Disabled plugin: ${identifier}@${plugin.version}`);
      } else {
        log.info(`Loaded plugin: ${identifier}@${plugin.version}`);
      }

      await this.initializePlugin(plugin, identifier);

      log.info("---");
    }

    this.currentInitializingPlugin = undefined;
  }

  public async initializePlugin(plugin: Plugin, identifier: string): Promise<void> {
    try {
      this.currentInitializingPlugin = plugin;
      await plugin.initialize(this.api); // call the plugin's initializer and pass it our API instance
    } catch (error) {
      log.error("====================");
      log.error(`ERROR INITIALIZING PLUGIN ${identifier}:`);
      log.error(error.stack);
      log.error("====================");

      this.plugins.delete(identifier);
      return;
    }
  }

  private handleRegisterAccessory(name: AccessoryName, constructor: AccessoryPluginConstructor, pluginIdentifier?: PluginIdentifier): void {
    if (!this.currentInitializingPlugin) {
      throw new Error(`Unexpected accessory registration. Plugin ${pluginIdentifier? `'${pluginIdentifier}' `: ""}tried to register outside the initializer function!`);
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

  private handleRegisterPlatform(name: PlatformName, constructor: PlatformPluginConstructor, pluginIdentifier?: PluginIdentifier): void {
    if (!this.currentInitializingPlugin) {
      throw new Error(`Unexpected platform registration. Plugin ${pluginIdentifier? `'${pluginIdentifier}' `: ""}tried to register outside the initializer function!`);
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

  public getPluginForAccessory(accessoryIdentifier: AccessoryIdentifier | AccessoryName): Plugin {
    let plugin: Plugin;
    if (accessoryIdentifier.indexOf(".") === -1) { // see if it matches exactly one accessory
      let found = this.accessoryToPluginMap.get(accessoryIdentifier);

      if (!found) {
        throw new Error(`No plugin was found for the accessory "${accessoryIdentifier}" in your config.json. Please make sure the corresponding plugin is installed correctly.`);
      }

      if (found.length > 1) {
        const options = found.map(plugin => plugin.getPluginIdentifier() + "." + accessoryIdentifier).join(", ");
        // check if only one of the multiple platforms is not disabled
        found = found.filter(plugin => !plugin.disabled);
        if (found.length !== 1) {
          throw new Error(`The requested accessory '${accessoryIdentifier}' has been registered multiple times. Please be more specific by writing one of: ${options}`);
        }
      } 

      plugin = found[0];
      accessoryIdentifier = plugin.getPluginIdentifier() + "." + accessoryIdentifier;

    } else {
      const pluginIdentifier = PluginManager.getPluginIdentifier(accessoryIdentifier);
      if (!this.hasPluginRegistered(pluginIdentifier)) {
        throw new Error(`The requested plugin '${pluginIdentifier}' was not registered.`);
      }

      plugin = this.getPlugin(pluginIdentifier)!;
    }

    return plugin;
  }

  public getPluginForPlatform(platformIdentifier: PlatformIdentifier | PlatformName): Plugin {
    let plugin: Plugin;
    if (platformIdentifier.indexOf(".") === -1) { // see if it matches exactly one platform
      let found = this.platformToPluginMap.get(platformIdentifier);

      if(!found) {
        throw new Error(`No plugin was found for the platform "${platformIdentifier}" in your config.json. Please make sure the corresponding plugin is installed correctly.`);
      }

      if (found.length > 1) {
        const options = found.map(plugin => plugin.getPluginIdentifier() + "." + platformIdentifier).join(", ");
        // check if only one of the multiple platforms is not disabled
        found = found.filter(plugin => !plugin.disabled);
        if (found.length !== 1) {
          throw new Error(`The requested platform '${platformIdentifier}' has been registered multiple times. Please be more specific by writing one of: ${options}`);
        }
      }

      plugin = found[0];
      platformIdentifier = plugin.getPluginIdentifier() + "." + platformIdentifier;

    } else {
      const pluginIdentifier = PluginManager.getPluginIdentifier(platformIdentifier);
      if (!this.hasPluginRegistered(pluginIdentifier)) {
        throw new Error(`The requested plugin '${pluginIdentifier}' was not registered.`);
      }

      plugin = this.getPlugin(pluginIdentifier)!;
    }

    return plugin;
  }

  public hasPluginRegistered(pluginIdentifier: PluginIdentifier): boolean {
    return this.plugins.has(pluginIdentifier) || this.pluginIdentifierTranslation.has(pluginIdentifier);
  }

  public getPlugin(pluginIdentifier: PluginIdentifier): Plugin | undefined {
    const plugin = this.plugins.get(pluginIdentifier);
    if (plugin) {
      return plugin;
    } else {
      const translation = this.pluginIdentifierTranslation.get(pluginIdentifier);
      if (translation) {
        return this.plugins.get(translation);
      }
    }

    return undefined;
  }

  public getPluginByActiveDynamicPlatform(platformName: PlatformName): Plugin | undefined {
    const found = (this.platformToPluginMap.get(platformName) || [])
      .filter(plugin => !!plugin.getActiveDynamicPlatform(platformName));

    if (found.length === 0) {
      return undefined;
    } else if (found.length > 1) {
      const plugins = found.map(plugin => plugin.getPluginIdentifier()).join(", ");
      throw new Error(`'${platformName}' is an ambiguous platform name. It was registered by multiple plugins: ${plugins}`);
    } else {
      return found[0];
    }
  }

  /**
   * Gets all plugins installed on the local system
   */
  private loadInstalledPlugins(): void {
    this.loadDefaultPaths();

    this.searchPaths.forEach(searchPath => { // search for plugins among all known paths
      if (!fs.existsSync(searchPath)) { // just because this path is in require.main.paths doesn't mean it necessarily exists!
        return;
      }

      if (fs.existsSync(path.join(searchPath, "package.json"))) { // does this path point inside a single plugin and not a directory containing plugins?
        try {
          this.loadPlugin(searchPath);
        } catch (error) {
          log.warn(error.message);
          return;
        }
      } else { // read through each directory in this node_modules folder
        const relativePluginPaths = fs.readdirSync(searchPath) // search for directories only
          .filter(relativePath => {
            try {
              return fs.statSync(path.resolve(searchPath, relativePath)).isDirectory();
            } catch (e) {
              log.debug(`Ignoring path ${path.resolve(searchPath, relativePath)} - ${e.message}`);
              return false;
            }
          });

        // expand out @scoped plugins
        relativePluginPaths.slice()
          .filter(path => path.charAt(0) === "@") // is it a scope directory?
          .forEach(scopeDirectory => {
            // remove scopeDirectory from the path list
            const index = relativePluginPaths.indexOf(scopeDirectory);
            relativePluginPaths.splice(index, 1);

            const absolutePath = path.join(searchPath, scopeDirectory);
            fs.readdirSync(absolutePath)
              .filter(name => PluginManager.isQualifiedPluginIdentifier(name))
              .filter(name => {
                try {
                  return fs.statSync(path.resolve(absolutePath, name)).isDirectory();
                } catch (e) {
                  log.debug(`Ignoring path ${path.resolve(absolutePath, name)} - ${e.message}`);
                  return false;
                }
              })
              .forEach(name => relativePluginPaths.push(scopeDirectory + "/" + name));
          });

        relativePluginPaths
          .filter(pluginIdentifier => {
            return PluginManager.isQualifiedPluginIdentifier(pluginIdentifier) // needs to be a valid homebridge plugin name
              && (!this.activePlugins || this.activePlugins.includes(pluginIdentifier)); // check if activePlugins is restricted and if so if the plugin is contained
          })
          .forEach(pluginIdentifier => {
            try {
              const absolutePath = path.resolve(searchPath, pluginIdentifier);
              this.loadPlugin(absolutePath);
            } catch (error) {
              log.warn(error.message);
              return;
            }
          });
      }
    });

    if (this.plugins.size === 0) {
      log.warn("No plugins found. See the README for information on installing plugins.");
    }
  }

  public loadPlugin(absolutePath: string): Plugin {
    const packageJson: PackageJSON = PluginManager.loadPackageJSON(absolutePath);

    const identifier: PluginIdentifier = packageJson.name;
    const name: PluginName = PluginManager.extractPluginName(identifier);
    const scope = PluginManager.extractPluginScope(identifier); // possibly undefined

    const alreadyInstalled = this.plugins.get(identifier); // check if there is already a plugin with the same Identifier
    if (alreadyInstalled) {
      throw new Error(`Warning: skipping plugin found at '${absolutePath}' since we already loaded the same plugin from '${alreadyInstalled.getPluginPath()}'.`);
    }

    const plugin = new Plugin(name, absolutePath, packageJson, scope);
    this.plugins.set(identifier, plugin);
    return plugin;
  }

  private static loadPackageJSON(pluginPath: string): PackageJSON {
    const packageJsonPath = path.join(pluginPath, "package.json");
    let packageJson: PackageJSON;

    if (!fs.existsSync(packageJsonPath)) {
      throw new Error(`Plugin ${pluginPath} does not contain a package.json.`);
    }

    try {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: "utf8" })); // attempt to parse package.json
    } catch (err) {
      throw new Error(`Plugin ${pluginPath} contains an invalid package.json. Error: ${err}`);
    }

    if (!packageJson.name || !PluginManager.isQualifiedPluginIdentifier(packageJson.name)) {
      throw new Error(`Plugin ${pluginPath} does not have a package name that begins with 'homebridge-' or '@scope/homebridge-.`);
    }

    // verify that it's tagged with the correct keyword
    if (!packageJson.keywords || !packageJson.keywords.includes("homebridge-plugin")) {
      throw new Error(`Plugin ${pluginPath} package.json does not contain the keyword 'homebridge-plugin'.`);
    }

    return packageJson;
  }

  private loadDefaultPaths(): void {
    if (require.main) {
      // add the paths used by require()
      require.main.paths.forEach(path => this.searchPaths.add(path));
    }

    // THIS SECTION FROM: https://github.com/yeoman/environment/blob/master/lib/resolver.js

    // Adding global npm directories
    // We tried using npm to get the global modules path, but it haven't work out
    // because of bugs in the parsable implementation of `ls` command and mostly
    // performance issues. So, we go with our best bet for now.
    if (process.env.NODE_PATH) {
      process.env.NODE_PATH
        .split(path.delimiter)
        .filter(path => !!path) // trim out empty values
        .forEach(path => this.searchPaths.add(path));
    } else {
      // Default paths for each system
      if (process.platform === "win32") {
        this.searchPaths.add(path.join(process.env.APPDATA!, "npm/node_modules"));
      } else {
        this.searchPaths.add("/usr/local/lib/node_modules");
        this.searchPaths.add("/usr/lib/node_modules");
        this.searchPaths.add(execSync("/bin/echo -n \"$(npm --no-update-notifier -g prefix)/lib/node_modules\"").toString("utf8"));
      }
    }
  }

}
