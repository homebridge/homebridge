var path = require('path');
var fs = require('fs');
var semver = require('semver');
var User = require('./user').User;
var version = require('./version');

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
  this.pluginPath = pluginPath; // like "/usr/local/lib/node_modules/plugin-lockitron"
  
  // these are exports pulled from the loaded plugin module
  this.accessory = null; // single exposed accessory
  this.platform = null; // single exposed platform
  this.accessories = []; // array of exposed accessories
  this.platforms = []; // array of exposed platforms
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
    
  // pluck out the HomeBridge version requirement
  if (!pjson.peerDepdendencies || !pjson.peerDepdendencies.homebridge) {
    throw new Error("Plugin " + this.pluginPath + " does not contain the 'homebridge' package in 'peerDepdendencies'.");
  }
  
  var versionRequired = pjson.peerDepdendencies.homebridge;

  // make sure the version is satisfied by the currently running version of HomeBridge
  if (!semver.satisfies(version, versionRequired)) {
    throw new Error("Plugin " + this.pluginPath + " requires a HomeBridge version of " + versionRequired + " which does not satisfy the current HomeBridge version of " + version + ". You may need to upgrade your installation of HomeBridge.");
  }
  
  // figure out the main module - index.js unless otherwise specified
  var main = pjson.main || "./index.js";

  var mainPath = path.join(this.pluginPath, main);
  
  // try to require() it
  var pluginModule = require(mainPath);
  
  // extract all exposed accessories and platforms
  this.accessories = pluginModule.accessories || {};
  this.platforms = pluginModule.platforms || {};
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
  
  // search for plugins among all known paths, in order
  for (var index in Plugin.paths) {
    var requirePath = Plugin.paths[index];
    
    // just because this path is in require.main.paths doesn't mean it necessarily exists!
    if (!fs.existsSync(requirePath))
      continue;
    
    var names = fs.readdirSync(requirePath);
    
    // read through each directory in this node_modules folder
    for (var index2 in names) {
      var name = names[index2];
    
      // reconstruct full path
      var pluginPath = path.join(requirePath, name);
    
      // we only care about directories
      if (!fs.statSync(pluginPath).isDirectory()) continue;
      
      // does this module contain a package.json?
      try {
        // throws an Error if this isn't a homebridge plugin
        Plugin.loadPackageJSON(pluginPath);
      }
      catch (err) {
        // swallow error and skip this module
        continue;
      }
      
      // add it to the return list
      if (!pluginsByName[name]) {
        pluginsByName[name] = true;
        plugins.push(new Plugin(pluginPath));
      }
    }
  }
  
  return plugins;
}
