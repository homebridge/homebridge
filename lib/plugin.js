var path = require('path');
var fs = require('fs');
var semver = require('semver');
var User = require('./user').User;
var version = require('./version');
var log = require("./logger")._system;

'use strict';

module.exports = {
  Plugin: Plugin
}

/**
 * Homebridge Plugin.
 *
 * Allows for discovering and loading installed Homebridge plugins.
 */

function Plugin(pluginPath) {
  this.pluginPath = pluginPath; // like "/usr/local/lib/node_modules/homebridge-lockitron"
  this.initializer; // exported function from the plugin that initializes it
}

Plugin.prototype.name = function() {
  return path.basename(this.pluginPath);
}

Plugin.prototype.load = function(options) {
  options = options || {};

  // does this plugin exist at all?
  if (!fs.existsSync(this.pluginPath)) {
    throw new Error("Plugin " + this.pluginPath + " was not found. Make sure the module '" + this.pluginPath + "' is installed.");
  }

  // attempt to load package.json
  var pjson = Plugin.loadPackageJSON(this.pluginPath);

  // very temporary fix for first wave of plugins
  if (pjson.peerDepdendencies && (!pjson.engines || !pjson.engines.homebridge)) {
    var engines = pjson.engines || {}
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

  // figure out the main module - index.js unless otherwise specified
  var main = pjson.main || "./index.js";

  var mainPath = path.join(this.pluginPath, main);

  // try to require() it and grab the exported initialization hook
  this.initializer = require(mainPath);
}

Plugin.loadPackageJSON = function(pluginPath) {
  // check for a package.json
  var pjsonPath = path.join(pluginPath, "package.json");
  var pjson = null;

  if (!fs.existsSync(pjsonPath)) {
    throw new Error("Plugin " + pluginPath + " does not contain a package.json.");
  }

  try {
    // attempt to parse package.json
    pjson = JSON.parse(fs.readFileSync(pjsonPath));
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

Plugin.getDefaultPaths = function() {
  var win32 = process.platform === 'win32';
  var paths = [];

  // add the paths used by require()
  paths = paths.concat(require.main.paths);

  // THIS SECTION FROM: https://github.com/yeoman/environment/blob/master/lib/resolver.js

  // Adding global npm directories
  // We tried using npm to get the global modules path, but it haven't work out
  // because of bugs in the parseable implementation of `ls` command and mostly
  // performance issues. So, we go with our best bet for now.
  if (process.env.NODE_PATH) {
    paths = process.env.NODE_PATH.split(path.delimiter)
      .filter(function(p) { return !!p; }) // trim out empty values
      .concat(paths);
  } else {
    // Default paths for each system
    if (win32) {
      paths.push(path.join(process.env.APPDATA, 'npm/node_modules'));
    } else {
      paths.push('/usr/local/lib/node_modules');
      paths.push('/usr/lib/node_modules');
      const exec = require('child_process').execSync;
      paths.push(exec('/bin/echo -n "$(npm -g prefix)/lib/node_modules"').toString('utf8'));
    }
  }
  return paths;
}

// All search paths we will use to discover installed plugins
Plugin.paths = Plugin.getDefaultPaths();

Plugin.addPluginPath = function(pluginPath) {
  Plugin.paths.unshift(path.resolve(process.cwd(), pluginPath));
}

// Gets all plugins installed on the local system
Plugin.installed = function() {

  var plugins = [];
  var pluginsByName = {}; // don't add duplicate plugins
  var searchedPaths = {}; // don't search the same paths twice

  // search for plugins among all known paths, in order
  for (var index in Plugin.paths) {
    var requirePath = Plugin.paths[index];

    // did we already search this path?
    if (searchedPaths[requirePath])
      continue;

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
        if (!fs.statSync(pluginPath).isDirectory()) continue;
      } catch (e) {
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
      if (!name) name = pjson.name;

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
