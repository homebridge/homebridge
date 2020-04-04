import path from "path";
import fs from "fs";
import { satisfies } from "semver";
import getVersion from "./version";
import { Logger } from "./logger";
import { PluginIdentifier, PluginInitializer, PluginName } from "./api";

const log = Logger.internal;

interface PackageJSON { // incomplete type for package.json (just stuff we use here)
    name: string;
    keywords?: string[];

    main?: string;

    engines?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
}

/**
 * Represents a loaded Homebridge plugin.
 */
export class Plugin {

    private readonly pluginName: PluginName;
    private readonly scope?: string; // npm package scope
    private readonly pluginPath: string; // like "/usr/local/lib/node_modules/homebridge-lockitron"
    private readonly packageJson: PackageJSON;

    public initializer?: PluginInitializer; // default exported function from the plugin that initializes it

    constructor(name: PluginName, path: string, packageJSON: PackageJSON, scope?: string) {
      this.pluginName = name;
      this.pluginPath = path;
      this.packageJson = packageJSON;
      this.scope = scope;
    }

    public name(): PluginIdentifier { // return full plugin name with scope prefix
      return (this.scope? this.scope + "/": "") + this.pluginName;
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
        throw new Error(`Plugin ${this.pluginPath} requires a HomeBridge version of ${versionRequired} which does 
            not satisfy the current HomeBridge version of ${getVersion()}. You may need to upgrade your installation of HomeBridge.`);
      }

      // make sure the version is satisfied by the currently running version of Node
      if (nodeVersionRequired && !satisfies(process.version, nodeVersionRequired)) {
        log.warn(`Plugin ${this.pluginPath} requires Node version of ${nodeVersionRequired} which does 
            not satisfy the current Node version of ${process.version}. You may need to upgrade your installation of Node.`);
      }

      // figure out the main module - index.js unless otherwise specified
      const main = this.packageJson.main || "./index.js";
      const mainPath = path.join(this.pluginPath, main);

      // try to require() it and grab the exported initialization hook
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pluginModules = require(mainPath);

      if (typeof pluginModules === "function") {
        this.initializer = pluginModules;
      } else if (pluginModules && typeof pluginModules.default === "function") {
        this.initializer = pluginModules.default;
      } else {
        throw new Error(`Plugin ${this.pluginPath} does not export a initializer function from main.`);
      }
    }


}

/**
 * Utility which exposes methods to search for installed Homebridge plugins
 */
export class PluginManager {

    // name must be prefixed with 'homebridge-' or '@scope/homebridge-'
    private static readonly PLUGIN_NAME_PATTERN = /^((@[\w-]*)\/)?(homebridge-[\w-]*)$/;

    private static readonly paths = PluginManager.getDefaultPaths(); // All search paths we will use to discover installed plugins
    private static readonly installedPlugins: Map<PluginName, Plugin> = new Map();

    public static isQualifiedPluginName(name: string): boolean {
      return PluginManager.PLUGIN_NAME_PATTERN.test(name);
    }

    public static extractPluginName(name: string): PluginName { // extract plugin name without @scope/ prefix
      return name.match(PluginManager.PLUGIN_NAME_PATTERN)![3];
    }

    public static extractPluginScope(name: string): string { // extract the "@scope" of a npm module name
      return name.match(PluginManager.PLUGIN_NAME_PATTERN)![2];
    }

    public static addPluginPath(...pluginPath: string[]): void {
      PluginManager.paths.unshift(path.resolve(process.cwd(), ...pluginPath));
    }

    public static getDefaultPaths(): string[] {
      let paths: string[] = [];

      if (require.main) {
        // add the paths used by require()
        paths = paths.concat(require.main.paths);
      }

      // THIS SECTION FROM: https://github.com/yeoman/environment/blob/master/lib/resolver.js

      // Adding global npm directories
      // We tried using npm to get the global modules path, but it haven't work out
      // because of bugs in the parsable implementation of `ls` command and mostly
      // performance issues. So, we go with our best bet for now.
      if (process.env.NODE_PATH) {
        paths = process.env.NODE_PATH
          .split(path.delimiter)
          .filter(path => !!path) // trim out empty values
          .concat(paths);
      } else {
        // Default paths for each system
        if (process.platform === "win32") {
          paths.push(path.join(process.env.APPDATA!, "npm/node_modules"));
        } else {
          paths.push("/usr/local/lib/node_modules");
          paths.push("/usr/lib/node_modules");
          const exec = require("child_process").execSync;
          paths.push(exec("/bin/echo -n \"$(npm --no-update-notifier -g prefix)/lib/node_modules\"").toString("utf8"));
        }
      }

      return paths;
    }

    public static loadPackageJSON(pluginPath: string): PackageJSON {
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

      if (!packageJson.name || !PluginManager.isQualifiedPluginName(packageJson.name)) {
        throw new Error(`Plugin ${pluginPath} does not have a package name that begins with 'homebridge-' or '@scope/homebridge-.`);
      }

      // verify that it's tagged with the correct keyword
      if (!packageJson.keywords || !packageJson.keywords.includes("homebridge-plugin")) {
        throw new Error(`Plugin ${pluginPath} package.json does not contain the keyword 'homebridge-plugin'.`);
      }

      return packageJson;
    }

    public static installed(): Plugin[] { // Gets all plugins installed on the local system
      const plugins: Plugin[] = [];
      const searchedPaths: string[] = []; // don't search the same paths twice

      // search for plugins among all known paths
      PluginManager.paths.forEach(searchPath => {
        if (searchedPaths.includes(searchPath)) {
          return;
        }

        searchedPaths.push(searchPath);
        if (!fs.existsSync(searchPath)) { // just because this path is in require.main.paths doesn't mean it necessarily exists!
          return;
        }

        if (fs.existsSync(path.join(searchPath, "package.json"))) { // does this path point inside a single plugin and not a directory containing plugins?
          try {
            const plugin = PluginManager.loadPlugin(searchPath);
            plugins.push(plugin);
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
              const index = relativePluginPaths.indexOf(scopeDirectory); // remove scopeDirectory from the path list
              relativePluginPaths.splice(index, 1);

              const absolutePath = path.join(searchPath, scopeDirectory);
              fs.readdirSync(absolutePath)
                .filter(name => fs.statSync(path.resolve(absolutePath, name)).isDirectory())
                .forEach(name => relativePluginPaths.push(path.join(scopeDirectory, name)));
            });

          relativePluginPaths
            .filter(relativePath => {
              const name = path.basename(relativePath); // we could have a dirname like "@somescope/homebridge-my-plugin"
              return PluginManager.isQualifiedPluginName(name);
            })
            .forEach(relativePath => {
              try {
                const absolutePath = path.resolve(searchPath, relativePath);
                const plugin = PluginManager.loadPlugin(absolutePath);

                plugins.push(plugin);
              } catch (error) {
                log.warn(error.message);
                return;
              }
            });
        }
      });

      return plugins;
    }

    private static loadPlugin(absolutePath: string): Plugin {
      const packageJson: PackageJSON = PluginManager.loadPackageJSON(absolutePath);
      const name: PluginName = PluginManager.extractPluginName(packageJson.name);
      const scope = PluginManager.extractPluginScope(packageJson.name); // possibly undefined

      if (PluginManager.installedPlugins.has(name)) {
        throw new Error(`Warning: skipping plugin found at '${absolutePath}' since we already loaded the same plugin from '${PluginManager.installedPlugins.get(name)}'.`);
      }

      const plugin = new Plugin(name, absolutePath, packageJson, scope);
      PluginManager.installedPlugins.set(name, plugin);
      return plugin;
    }

}
