import path from "path";
import { satisfies } from "semver";
import getVersion from "./version";
import { Logger } from "./logger";
import {
  AccessoryIdentifier,
  AccessoryName,
  AccessoryPluginConstructor,
  API,
  PlatformIdentifier,
  PlatformName,
  PlatformPlugin,
  PlatformPluginConstructor,
  PluginIdentifier,
  PluginInitializer,
  PluginName,
} from "./api";
import { PackageJSON, PluginManager } from "./pluginManager";

const log = Logger.internal;

/**
 * Represents a loaded Homebridge plugin.
 */
export class Plugin {

  private readonly pluginName: PluginName;
  private readonly scope?: string; // npm package scope
  private readonly pluginPath: string; // like "/usr/local/lib/node_modules/homebridge-lockitron"

  // ------------------ package.json content ------------------
  readonly version: string;
  private readonly main: string;
  private readonly engines?: Record<string, string>;
  // ----------------------------------------------------------

  private pluginInitializer?: PluginInitializer; // default exported function from the plugin that initializes it

  private readonly registeredAccessories: Map<AccessoryName, AccessoryPluginConstructor> = new Map();
  private readonly registeredPlatforms: Map<PlatformName, PlatformPluginConstructor> = new Map();

  private readonly activePlatformPlugins: Map<PlatformName, PlatformPlugin[]> = new Map();

  constructor(name: PluginName, path: string, packageJSON: PackageJSON, scope?: string) {
    this.pluginName = name;
    this.scope = scope;
    this.pluginPath = path;

    this.version = packageJSON.version || "0.0.0";
    this.main = packageJSON.main || "./index.js"; // figure out the main module - index.js unless otherwise specified

    // very temporary fix for first wave of plugins
    if (packageJSON.peerDependencies && (!packageJSON.engines || !packageJSON.engines.homebridge)) {
      packageJSON.engines = packageJSON.engines || {};
      packageJSON.engines.homebridge = packageJSON.peerDependencies.homebridge;
    }
    this.engines = packageJSON.engines;
  }

  public getPluginIdentifier(): PluginIdentifier { // return full plugin name with scope prefix
    return (this.scope? this.scope + "/": "") + this.pluginName;
  }

  public getPluginPath(): string {
    return this.pluginPath;
  }

  public registerAccessory(name: AccessoryName, constructor: AccessoryPluginConstructor): void {
    if (this.registeredAccessories.has(name)) {
      throw new Error(`Plugin '${this.getPluginIdentifier()}' tried to register an accessory '${name}' which has already been registered!`);
    }

    log.info("Registering accessory '%s'", this.getPluginIdentifier() + "." + name);

    this.registeredAccessories.set(name, constructor);
  }

  public registerPlatform(name: PlatformName, constructor: PlatformPluginConstructor): void {
    if (this.registeredPlatforms.has(name)) {
      throw new Error(`Plugin '${this.getPluginIdentifier()}' tried to register a platform '${name}' which has already been registered!`);
    }

    log.info("Registering platform '%s'", this.getPluginIdentifier() + "." + name);

    this.registeredPlatforms.set(name, constructor);
  }

  public getAccessoryConstructor(accessoryIdentifier: AccessoryIdentifier | AccessoryName): AccessoryPluginConstructor {
    const name: AccessoryName = PluginManager.getAccessoryName(accessoryIdentifier);

    const constructor = this.registeredAccessories.get(name);
    if (!constructor) {
      throw new Error(`The requested accessory '${name}' was not registered by the plugin '${this.getPluginIdentifier()}'.`);
    }

    return constructor;
  }

  public getPlatformConstructor(platformIdentifier: PlatformIdentifier | PlatformName): PlatformPluginConstructor {
    const name: PlatformName = PluginManager.getPlatformName(platformIdentifier);

    const constructor = this.registeredPlatforms.get(name);
    if (!constructor) {
      throw new Error(`The requested platform '${name}' was not registered by the plugin '${this.getPluginIdentifier()}'.`);
    }

    if (this.activePlatformPlugins.has(name)) {
      log.error("The platform " + name + " from the plugin " + this.getPluginIdentifier() + " seems to be configured " +
        "multiple times in your config.json. This behaviour was deprecated in homebridge v1.0.0 and will be removed in v2.0.0!");
    }

    return constructor;
  }

  public assignPlatformPlugin(platformIdentifier: PlatformIdentifier | PlatformName, platformPlugin: PlatformPlugin): void {
    const name: PlatformName = PluginManager.getPlatformName(platformIdentifier);

    let platforms = this.activePlatformPlugins.get(name);
    if (!platforms) {
      platforms = [];
      this.activePlatformPlugins.set(name, platforms);
    }

    // the last platform published should be at the first position for easy access
    // we just try to mimic pre 1.0.0 behavior
    platforms.unshift(platformPlugin);
  }

  public getActivePlatforms(platformName: PlatformName): PlatformPlugin[] | undefined {
    return this.activePlatformPlugins.get(platformName);
  }

  public load(): void {
    // pluck out the HomeBridge version requirement
    if (!this.engines || !this.engines.homebridge) {
      throw new Error(`Plugin ${this.pluginPath} does not contain the 'homebridge' package in 'engines'.`);
    }

    const versionRequired = this.engines.homebridge;
    const nodeVersionRequired = this.engines.node;

    // make sure the version is satisfied by the currently running version of HomeBridge
    if (!satisfies(getVersion(), versionRequired, { includePrerelease: true })) {
      throw new Error(`Plugin ${this.pluginPath} requires a HomeBridge version of ${versionRequired} which does \
not satisfy the current HomeBridge version of ${getVersion()}. You may need to upgrade your installation of HomeBridge.`);
    }

    // make sure the version is satisfied by the currently running version of Node
    if (nodeVersionRequired && !satisfies(process.version, nodeVersionRequired)) {
      log.warn(`Plugin ${this.pluginPath} requires Node version of ${nodeVersionRequired} which does \
not satisfy the current Node version of ${process.version}. You may need to upgrade your installation of Node.`);
    }

    const mainPath = path.join(this.pluginPath, this.main);

    // try to require() it and grab the exported initialization hook
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pluginModules = require(mainPath);

    if (typeof pluginModules === "function") {
      this.pluginInitializer = pluginModules;
    } else if (pluginModules && typeof pluginModules.default === "function") {
      this.pluginInitializer = pluginModules.default;
    } else {
      throw new Error(`Plugin ${this.pluginPath} does not export a initializer function from main.`);
    }
  }

  public initialize(api: API): void {
    if (!this.pluginInitializer) {
      throw new Error("Tried to initialize a plugin which hasn't been loaded yet!");
    }

    this.pluginInitializer(api);
  }


}
