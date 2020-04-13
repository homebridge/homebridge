import {
  AccessoryIdentifier,
  AccessoryName,
  AccessoryPlugin,
  AccessoryPluginConstructor,
  HomebridgeAPI,
  InternalAPIEvent,
  PlatformIdentifier,
  PlatformName,
  PlatformPlugin,
  PlatformPluginConstructor,
  PluginIdentifier,
  PluginName,
} from "./api";
import path from "path";
import fs from "fs";
import { Plugin } from "./plugin";
import { Logger } from "./logger";
import { execSync } from "child_process";
import { PlatformAccessory } from "./platformAccessory";
import { AccessoryConfig, PlatformConfig } from "./server";

const log = Logger.internal;

export interface PackageJSON { // incomplete type for package.json (just stuff we use here)
  name: string;
  keywords?: string[];

  main?: string;

  engines?: Record<string, string>;
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

  private readonly plugins: Map<PluginIdentifier, Plugin> = new Map();
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
    }

    this.loadDefaultPaths();

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
    return identifier.split(".")[1];
  }

  public static getPlatformName(identifier: PlatformIdentifier): PlatformIdentifier {
    return identifier.split(".")[1];
  }

  public static getPluginName(identifier: AccessoryIdentifier | PlatformIdentifier): PluginName {
    return identifier.split(".")[0];
  }

  public initializeInstalledPlugins(): void {
    this.loadInstalledPlugins();

    this.plugins.forEach((plugin: Plugin, identifier: PluginIdentifier) => {
      try {
        plugin.load();
      } catch (error) {
        log.error("====================");
        log.error(`ERROR LOADING PLUGIN ${identifier}:`);
        log.error(error.stack);
        log.error("====================");

        this.plugins.delete(identifier);
        return;
      }

      log.info(`Loaded plugin: ${identifier}`);

      try {
        this.currentInitializingPlugin = plugin;
        plugin.initialize(this.api); // call the plugin's initializer and pass it our API instance
      } catch (error) {
        log.error("====================");
        log.error(`ERROR INITIALIZING PLUGIN ${identifier}:`);
        log.error(error.stack);
        log.error("====================");

        this.plugins.delete(identifier);
        return;
      }

      log.info("---");
    });

    this.currentInitializingPlugin = undefined;
  }

  private handleRegisterAccessory(name: AccessoryName, constructor: AccessoryPluginConstructor, pluginIdentifier?: PluginIdentifier): void {
    if (!this.currentInitializingPlugin) {
      throw new Error(`Unexpected accessory registration. Plugin ${pluginIdentifier? `'${pluginIdentifier}' `: ""}tried to register outside the initializer function!`);
    }

    if (pluginIdentifier && pluginIdentifier !== this.currentInitializingPlugin.getPluginIdentifier()) {
      log.error(`Plugin '${this.currentInitializingPlugin.getPluginIdentifier()}' tried to register with an incorrect plugin identifier: '${pluginIdentifier}'`);
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
      log.error(`Plugin '${this.currentInitializingPlugin.getPluginIdentifier()}' tried to register with an incorrect plugin identifier: '${pluginIdentifier}'`);
    }

    this.currentInitializingPlugin.registerPlatform(name, constructor);

    let plugins = this.platformToPluginMap.get(name);
    if (!plugins) {
      plugins = [];
      this.platformToPluginMap.set(name, plugins);
    }
    plugins.push(this.currentInitializingPlugin);
  }

  public createAccessory(accessoryIdentifier: AccessoryIdentifier | AccessoryName, displayName: string, config: AccessoryConfig): AccessoryPlugin {
    let plugin: Plugin;
    console.log("found  identifier: " + accessoryIdentifier);
    if (accessoryIdentifier.indexOf(".") === -1) { // see if it matches exactly one accessory
      const found = this.accessoryToPluginMap.get(accessoryIdentifier);

      if (!found) {
        throw new Error(`The requested accessory '${accessoryIdentifier}' was not registered by any plugin.`);
      } else if (found.length > 1) {
        const options = found.map(plugin => plugin.getPluginIdentifier() + "." + accessoryIdentifier).join(", ");
        throw new Error(`The requested accessory '${accessoryIdentifier}' has been registered multiple times. Please be more specific by writing one of: ${options}`);
      } else {
        plugin = found[0];
        accessoryIdentifier = plugin.getPluginIdentifier() + "." + accessoryIdentifier;
      }
    } else {
      const pluginName = PluginManager.getPluginName(accessoryIdentifier);
      if (!this.plugins.has(pluginName)) {
        throw new Error(`The requested plugin '${pluginName}' was not registered.`);
      }

      plugin = this.plugins.get(pluginName)!;
    }

    return plugin.createAccessory(PluginManager.getAccessoryName(accessoryIdentifier), displayName, config);
  }

  public createPlatform(platformIdentifier: PlatformIdentifier | PlatformName, displayName: string, config: PlatformConfig): PlatformPlugin {
    let plugin: Plugin;
    if (platformIdentifier.indexOf(".") === -1) { // see if it matches exactly one platform
      const found = this.platformToPluginMap.get(platformIdentifier);

      if (!found) {
        throw new Error(`The requested platform '${platformIdentifier}' was not registered by any plugin.`);
      } else if (found.length > 1) {
        const options = found.map(plugin => plugin.getPluginIdentifier() + "." + platformIdentifier).join(", ");
        throw new Error(`The requested platform '${platformIdentifier}' has been registered multiple times. Please be more specific by writing one of: ${options}`);
      } else {
        plugin = found[0];
        platformIdentifier = plugin.getPluginIdentifier() + "." + platformIdentifier;
      }
    } else {
      const pluginName = PluginManager.getPluginName(platformIdentifier);
      if (!this.plugins.has(pluginName)) {
        throw new Error(`The requested plugin '${pluginName}' was not registered.`);
      }

      plugin = this.plugins.get(pluginName)!;
    }

    return plugin.createPlatforms(PluginManager.getPlatformName(platformIdentifier), displayName, config, this.api);
  }

  /**
   * Tries to call the configureAccessory handler of the associated Platform.
   * Returns true if the Platform for the given accessory was found.
   *
   * @param accessory {PlatformAccessory} the accessory to configure
   */
  public configurePlatformAccessory(accessory: PlatformAccessory): boolean {
    const plugin = this.plugins.get(accessory._associatedPlugin!);
    return !!plugin && plugin.configurePlatformAccessory(accessory);
  }

  private loadInstalledPlugins(): void{ // Gets all plugins installed on the local system
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
          .filter(relativePath => fs.statSync(path.resolve(searchPath, relativePath)).isDirectory());

        // expand out @scoped plugins
        relativePluginPaths.slice()
          .filter(path => path.charAt(0) === "@") // is it a scope directory?
          .forEach(scopeDirectory => {
            // remove scopeDirectory from the path list
            const index = relativePluginPaths.indexOf(scopeDirectory);
            relativePluginPaths.splice(index, 1);

            const absolutePath = path.join(searchPath, scopeDirectory);
            fs.readdirSync(absolutePath)
              .filter(name => fs.statSync(path.resolve(absolutePath, name)).isDirectory())
              .forEach(name => relativePluginPaths.push(path.join(scopeDirectory, name)));
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

  private loadPlugin(absolutePath: string): Plugin {
    const packageJson: PackageJSON = PluginManager.loadPackageJSON(absolutePath);

    const identifier: PluginIdentifier = packageJson.name;
    const name: PluginName = PluginManager.extractPluginName(identifier);
    const scope = PluginManager.extractPluginScope(identifier); // possibly undefined

    const alreadyInstalled = this.plugins.get(identifier); // check if there is already a plugin with the same Identifier
    if (alreadyInstalled) {
      throw new Error(`Warning: skipping plugin found at '${absolutePath}' since we already loaded the same plugin from '${alreadyInstalled.getPluginPath()}'.`);
    }

    const plugin = new Plugin(name, absolutePath, packageJson, scope);
    this.plugins.set(name, plugin);
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