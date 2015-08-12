
# Branch in Progress

This branch contains an in-progress ground-up rewrite of Homebridge that looks more like what we want in the [roadmap](/nfarina/homebridge/wiki/Roadmap).

To play with Homebridge today, follow the instructions in the [master branch](/nfarina/homebridge).

## Installing

Install Homebridge using [npm](https://npmjs.com):

```sh
npm install -g homebridge
```

## Running

You can run Homebridge easily from the command line:

```sh
> homebridge
```

Homebridge will automatically load any plugins installed globally from npm.

## Development

To run Homebridge from source, simply execute the `homebridge` script in the `bin` folder:

```sh
> ./bin/homebridge
```

Remember to `npm install` dependencies first!

Homebridge also supports the excellent [browser-refresh](https://github.com/patrick-steele-idem/browser-refresh) module for assisting with development. Simply install it globally and use it in place of `node` when running homebridge:

```sh
> sudo npm install -g browser-refresh
> browser-refresh ./bin/homebridge
```

## Plugins

Homebridge does nothing by itself; in order to expose your home to HomeKit, you'll need to install one or more Homebridge Plugins. A Plugin is an npm module that connects with Homebridge and registers "Providers" for devices in your home.

Plugins must be published to npm and tagged with `homebridge-plugin`. The package name must contain the prefix `homebridge-`. For example, a valid package might be `homebridge-lockitron`.

Plugins are automatically discovered in your global `node_modules` path. You can add additional plugin search paths via the command line. For example, you can load all plugins in the `example-plugins` folder:

```sh
> ./bin/homebridge -P example-plugins/
```
