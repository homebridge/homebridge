var path = require('path');
var http = require('http');
var express = require('express');
var jsxtransform = require('express-jsxtransform');
var autoamd = require('./util/autoamd');
var io = require('socket.io');
var diffsync = require('diffsync');
var Plugin = require('./Plugin').Plugin;
var User = require('./User').User;

'use strict';

module.exports = {
  Server: Server
}

function Server() {
  this._plugins = {}; // plugins[name] = plugin
  this._httpServer = null; // http.Server
  this._dataAdapter = new diffsync.InMemoryDataAdapter(); // our "database"
  this._diffsyncServer = null; // diffsync.Server
  
  // load and validate plugins - check for valid package.json, etc.
  Plugin.installed().forEach(function(plugin) {
    
    // add it to our dict for easy lookup later
    this._plugins[plugin.name()] = plugin;
    
    // attempt to load it
    try {
      plugin.load();
    }
    catch (err) {
      console.error(err);
      plugin.loadError = err;
    }
    
  }.bind(this));
}
  
Server.prototype.run = function() {

  // setting up express and socket.io
  var app = express();

  // our web assets are all located in a sibling folder 'public'
  var root = path.dirname(__dirname);
  var pub = path.join(root, 'public');
   
  // middleware to convert our JS (written in CommonJS style) to AMD (require.js style)
  app.use(autoamd('/public/js/'));

  // middleware to compile JSX on the fly
  app.use(jsxtransform());

  // middleware to serve static files in the public directory
  app.use('/public', express.static(pub));

  // match any path without a period (assuming period means you're asking for a static file)
  app.get(/^[^\.]*$/, function(req, res){
    res.sendFile(path.join(pub, 'index.html'));
  });

  // HTTP web server
  this._httpServer = http.createServer(app);

  // diffsync server
  this._diffsyncServer = new diffsync.Server(this._dataAdapter, io(this._httpServer));
  
  // grab our global "root" data object and fill it out with inital data for the browser
  this._dataAdapter.getData("root", this._onRootLoaded.bind(this));
}

Server.prototype._onRootLoaded = function(err, root) {

  // we've loaded our "root" object from the DB - now fill it out before we make it available
  // to clients.

  root.plugins = Object.keys(this._plugins).map(function(name) {
    var plugin = this._plugins[name];
    var dict = { name: name };
    if (plugin.loadError)
      dict.loadError = loadError;
    
    dict.providers = plugin.providers.map(function(provider) {
      return {
        name: provider.name,
        title: provider.title,
        config: provider.config,
      }
    });
    
    return dict;
  }.bind(this));
  
  root.providers = root.providers || [];
  
  root.notifications = [];

  // if we're using browser-refresh for development, pass on the refresh script URL for the browser to load
  root.browserRefreshURL = process.env.BROWSER_REFRESH_URL;

  // start the server!
  this._httpServer.listen(4000, this._onHttpServerListen.bind(this));
}

Server.prototype._onHttpServerListen = function() {
  
  // we are now fully online - if we're using browser-refresh to auto-reload the browser during
  // development, then it expects to receive this signal
  if (process.send)
    process.send('online');
}

// Forces diffsync to persist the latest version of the data under the given id (which may have been
// changed without its knowledge), and notify any connected clients about the change.
Server.prototype._forceSync = function(id) {
  this._diffsyncServer.transport.to(id).emit(diffsync.COMMANDS.remoteUpdateIncoming, null);
}