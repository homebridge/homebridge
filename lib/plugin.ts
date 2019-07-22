import path from 'path';
import fs from 'fs';

import semver from 'semver';

import version from './version';
import { _system as log } from './logger';

/**
 * Homebridge Plugin.
 *
 * Allows for discovering and loading installed Homebridge plugins.
 */
export class Plugin {

    static paths = Plugin.getDefaultPaths();

    static loadPackageJSON(pluginPath: string) {
        // check for a package.json
        var pjsonPath = path.join(pluginPath, "package.json");
        var pjson = null;
        if (!fs.existsSync(pjsonPath)) {
            throw new Error("Plugin " + pluginPath + " does not contain a package.json.");
        }
        try {
            // attempt to parse package.json
            pjson = JSON.parse(fs.readFileSync(pjsonPath, 'utf8'));
        }
        catch (err) {
            throw new Error("Plugin " + pluginPath + " contains an invalid package.json. Error: " + err);
        }
        // make sure the name is prefixed with 'homebridge-'
        if (!pjson.name || pjson.name.indexOf('homebridge-') != 0) {
            throw new Error("Plugin " + pluginPath + " does not have a package name that begins with 'homebridge-'.");
        }
        // verify that it's tagged with the correct keyword
        if (!pjson.keywords || pjson.keywords.indexOf("homebridge-plugin") == -1) {
            throw new Error("Plugin " + pluginPath + " package.json does not contain the keyword 'homebridge-plugin'.");
        }
        return pjson;
    }

    static getDefaultPaths() {
        const win32 = process.platform === 'win32';
        let paths: string[] = [];
        // add the paths used by require()
        paths = paths.concat(require.main!.paths);
        // THIS SECTION FROM: https://github.com/yeoman/environment/blob/master/lib/resolver.js
        // Adding global npm directories
        // We tried using npm to get the global modules path, but it haven't work out
        // because of bugs in the parseable implementation of `ls` command and mostly
        // performance issues. So, we go with our best bet for now.
        if (process.env.NODE_PATH) {
            paths = process.env.NODE_PATH.split(path.delimiter)
                .filter(function(p) { return !!p; }) // trim out empty values
                .concat(paths);
        }
        else {
            // Default paths for each system
            if (win32) {
                paths.push(path.join(process.env.APPDATA!, 'npm/node_modules'));
            }
            else {
                paths.push('/usr/local/lib/node_modules');
                paths.push('/usr/lib/node_modules');
                const exec = require('child_process').execSync;
                paths.push(exec('/bin/echo -n "$(npm --no-update-notifier -g prefix)/lib/node_modules"').toString('utf8'));
            }
        }
        return paths;
    }

    static addPluginPath(pluginPath: string) {
        Plugin.paths.unshift(path.resolve(process.cwd(), pluginPath));
    }

    // Gets all plugins installed on the local system
    static installed() {
        var plugins: Plugin[] = [];
        var pluginsByName: Record<string, string> = {}; // don't add duplicate plugins
        var searchedPaths: Record<string, boolean> = {}; // don't search the same paths twice
        // search for plugins among all known paths, in order
        for (var index in Plugin.paths) {
            var requirePath = Plugin.paths[index];
            // did we already search this path?
            if (searchedPaths[requirePath]) {
                continue;
            }
            searchedPaths[requirePath] = true;
            // just because this path is in require.main.paths doesn't mean it necessarily exists!
            if (!fs.existsSync(requirePath))
                continue;
            var names = fs.readdirSync(requirePath);
            // does this path point inside a single plugin and not a directory containing plugins?
            if (fs.existsSync(path.join(requirePath, "package.json")))
                names = [""];
            // read through each directory in this node_modules folder
            for (var index2 in names) {
                var name = names[index2];
                // reconstruct full path
                var pluginPath = path.join(requirePath, name);
                try {
                    // we only care about directories
                    if (!fs.statSync(pluginPath).isDirectory())
                        continue;
                }
                catch (e) {
                    continue;
                }
                // does this module contain a package.json?
                var pjson;
                try {
                    // throws an Error if this isn't a homebridge plugin
                    pjson = Plugin.loadPackageJSON(pluginPath);
                }
                catch (err) {
                    // is this "trying" to be a homebridge plugin? if so let you know what went wrong.
                    if (!name || name.indexOf('homebridge-') == 0) {
                        log.warn(err.message);
                    }
                    // skip this module
                    continue;
                }
                // get actual name if this path points inside a single plugin
                if (!name)
                    name = pjson.name;
                // add it to the return list
                if (!pluginsByName[name]) {
                    pluginsByName[name] = pluginPath;
                    plugins.push(new Plugin(pluginPath));
                }
                else {
                    log.warn("Warning: skipping plugin found at '" + pluginPath + "' since we already loaded the same plugin from '" + pluginsByName[name] + "'.");
                }
            }
        }
        return plugins;
    }

    initializer: any;
    loadError?: Error;

    /**
     *
     * @param {string} pluginPath Like "/usr/local/lib/node_modules/homebridge-lockitron"
     */
    constructor(public pluginPath: string) {}

    name = () => {
        return path.basename(this.pluginPath);
    }

    load = (options: {} = {}) => {
        // does this plugin exist at all?
        if (!fs.existsSync(this.pluginPath)) {
            throw new Error("Plugin " + this.pluginPath + " was not found. Make sure the module '" + this.pluginPath + "' is installed.");
        }
        // attempt to load package.json
        var pjson = Plugin.loadPackageJSON(this.pluginPath);
        // very temporary fix for first wave of plugins
        if (pjson.peerDepdendencies && (!pjson.engines || !pjson.engines.homebridge)) {
            var engines = pjson.engines || {};
            engines.homebridge = pjson.peerDepdendencies.homebridge;
            pjson.engines = engines;
        }
        // pluck out the HomeBridge version requirement
        if (!pjson.engines || !pjson.engines.homebridge) {
            throw new Error("Plugin " + this.pluginPath + " does not contain the 'homebridge' package in 'engines'.");
        }
        var versionRequired = pjson.engines.homebridge;
        // make sure the version is satisfied by the currently running version of HomeBridge
        if (!semver.satisfies(version, versionRequired)) {
            throw new Error("Plugin " + this.pluginPath + " requires a HomeBridge version of " + versionRequired + " which does not satisfy the current HomeBridge version of " + version + ". You may need to upgrade your installation of HomeBridge.");
        }
        var nodeVersionRequired = pjson.engines.node;
        // make sure the version is satisfied by the currently running version of Node
        if (nodeVersionRequired && !semver.satisfies(process.version, nodeVersionRequired)) {
            log.warn("Plugin " + this.pluginPath + " requires Node version of " + nodeVersionRequired + " which does not satisfy the current Node version of " + process.version + ". You may need to upgrade your installation of Node.");
        }
        // figure out the main module - index.js unless otherwise specified
        var main = pjson.main || "./index.js";
        var mainPath = path.join(this.pluginPath, main);
        // try to require() it and grab the exported initialization hook
        var pluginModules = require(mainPath);
        if (typeof pluginModules === "function") {
            this.initializer = pluginModules;
        }
        else if (pluginModules && typeof pluginModules.default === "function") {
            this.initializer = pluginModules.default;
        }
        else {
            throw new Error("Plugin " + this.pluginPath + " does not export a initializer function from main.");
        }
    }
}
