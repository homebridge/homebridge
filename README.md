
# Branch in Progress

This branch contains an in-progress ground-up rewrite of HomeBridge that looks more like what we want in the [roadmap](/nfarina/homebridge/wiki/Roadmap).

To play with HomeBridge today, follow the instructions in the [master branch](/nfarina/homebridge).

## Installing

Install HomeBridge using [npm](https://npmjs.com):

```sh
npm install -g homebridge
```

## Running

You can run HomeBridge easily from the command line:

```sh
> homebridge server
```

It will look for any locally-installed providers and load them up automatically.

## Providers

HomeBridge does nothing by itself; in order to expose your home to HomeKit, you'll need to install one or more HomeBridge "Providers." A Provider is an npm module that connects with HomeBridge and registers accessories for devices in your home.

Providers must be published to npm and tagged with `homebridge-provider`. The package name must contain the prefix `homebridge-`. For example, a valid package might be `homebridge-philips-hue`.

Providers are automatically discovered and loaded from your home directory inside the `.homebridge` folder. For instance, the Philips Hue Provider would be placed here:

```sh
~/.homebridge/providers/node_modules/homebridge-philips-hue
```

Right now you must copy providers manually (or symlink them from another location). The HomeBridge server will load and validate your Provider on startup. You can find an example Provider stub in [example-providers/homebridge-liftmaster]().

## Running from Source

You can run HomeBridge directly from source by cloning this repo and running the executable [bin/homebridge](). Remember to `npm install` dependencies first!