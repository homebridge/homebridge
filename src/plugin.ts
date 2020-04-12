import path from "path";
import { satisfies } from "semver";
import getVersion from "./version";
import { Logger } from "./logger";
import {
  AccessoryName,
  AccessoryPlugin,
  AccessoryPluginConstructor,
  API,
  PlatformName,
  PlatformPlugin,
  PlatformPluginConstructor,
  PluginIdentifier,
  PluginInitializer,
  PluginName,
} from "./api";
import { PackageJSON } from "./pluginManager";
import { PlatformAccessory } from "./platformAccessory";
import { AccessoryConfig, PlatformConfig } from "./server";

const log = Logger.internal;

/**
 * Represents a loaded Homebridge plugin.
 */
export class Plugin {

  private readonly pluginName: PluginName;
  private readonly scope?: string; // npm package scope
  private readonly pluginPath: string; // like "/usr/local/lib/node_modules/homebridge-lockitron"
  private readonly packageJson: PackageJSON;

  private pluginInitializer?: PluginInitializer; // default exported function from the plugin that initializes it

  private readonly registeredAccessories: Map<AccessoryName, AccessoryPluginConstructor> = new Map();
  private readonly registeredPlatforms: Map<PlatformName, PlatformPluginConstructor> = new Map();

  private readonly activePlatformPlugins: Map<PlatformName, PlatformPlugin> = new Map();

  constructor(name: PluginName, path: string, packageJSON: PackageJSON, scope?: string) {
    this.pluginName = name;
    this.pluginPath = path;
    this.packageJson = packageJSON;
    this.scope = scope;
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

  public createAccessory(name: AccessoryName, displayName: string, config: AccessoryConfig): AccessoryPlugin {
    const constructor = this.registeredAccessories.get(name);
    if (!constructor) {
      throw new Error(`The requested accessory '${name}' was not registered by the plugin '${this.getPluginIdentifier()}'.`);
    }

    const logger = Logger.withPrefix(displayName);
    logger("Initializing %s accessory...", name);

    return new constructor(logger, config);
  }

  public createPlatforms(name: PlatformName, displayName: string, config: PlatformConfig, api: API): PlatformPlugin {
    const constructor = this.registeredPlatforms.get(name);
    if (!constructor) {
      throw new Error(`The requested platform '${name}' was not registered by the plugin '${this.getPluginIdentifier()}'.`);
    }
    if (this.activePlatformPlugins.has(name)) {
      throw new Error(`The platform '${name}' from the plugin '${this.getPluginIdentifier()}' was already initialized!`);
    }

    const logger = Logger.withPrefix(displayName);
    logger("Initializing %s platform...", name);

    const platform = new constructor(logger, config, api);
    if (platform.configureAccessory !== undefined) {
      this.activePlatformPlugins.set(name, platform);
    }

    return platform;
  }

  public configurePlatformAccessory(accessory: PlatformAccessory): boolean {
    const platform = this.activePlatformPlugins.get(accessory._associatedPlatform!);
    if (!platform) {
      return false;
    } else {
      platform.configureAccessory(accessory);
      return true;
    }
  }

  public load(): void {
    const packageJson = this.packageJson;

    // very temporary fix for first wave of plugins
    if (packageJson.peerDependencies && (!packageJson.engines || !packageJson.engines.homebridge)) {
      packageJson.engines = this.packageJson.engines || {};
      packageJson.engines.homebridge = packageJson.peerDependencies.homebridge;
    }

    // pluck out the HomeBridge version requirement
    if (!packageJson.engines || !packageJson.engines.homebridge) {
      throw new Error(`Plugin ${this.pluginPath} does not contain the 'homebridge' package in 'engines'.`);
    }

    const versionRequired = packageJson.engines.homebridge;
    const nodeVersionRequired = packageJson.engines.node;

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

    // figure out the main module - index.js unless otherwise specified
    const main = this.packageJson.main || "./index.js";
    const mainPath = path.join(this.pluginPath, main);

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
