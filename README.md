<p align="center">
  <a href="https://github.com/homebridge/homebridge"><img src="https://raw.githubusercontent.com/homebridge/branding/master/logos/homebridge-color-round-stylized.png" height="140"></a>
</p>

<span align="center">

# Homebridge

<a href="https://www.npmjs.com/package/homebridge"><img title="npm version" src="https://badgen.net/npm/v/homebridge" ></a>
<a href="https://www.npmjs.com/package/homebridge"><img title="npm downloads" src="https://badgen.net/npm/dt/homebridge" ></a>

</span>

<img src="https://media.giphy.com/media/10l79ICohTu4iQ/giphy.gif" align="right" alt="Unlocking Door">

**Homebridge** is a lightweight NodeJS server you can run on your home network that emulates the iOS HomeKit API. It supports Plugins, which are community-contributed modules that provide a basic bridge from HomeKit to various 3rd-party APIs provided by manufacturers of "smart home" devices. 

Since Siri supports devices added through HomeKit, this means that with Homebridge you can ask Siri to control devices that don't have any support for HomeKit at all. For instance, using just some of the available plugins, you can say:

 * _Siri, unlock the back door._ [pictured to the right]
 * _Siri, open the garage door._
 * _Siri, turn on the coffee maker._ 
 * _Siri, turn on the living room lights._
 * _Siri, good morning!_

You can explore all available plugins at the NPM website by [searching for the keyword `homebridge-plugin`](https://www.npmjs.com/search?q=homebridge-plugin).

##  Community

The official Homebridge Discord server and Reddit community are where users can discuss Homebridge and ask for help.

<span align="center">

[![Homebridge Discord](https://discordapp.com/api/guilds/432663330281226270/widget.png?style=banner2)](https://discord.gg/kqNCe2D) [![Homebridge Reddit](.github/homebridge-reddit.svg?sanitize=true)](https://www.reddit.com/r/homebridge/)

</span>

HomeKit communities can also be found on both [Discord](https://discord.gg/RcV7fa8) and [Reddit](https://www.reddit.com/r/homekit).

## Installation

The [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) contains step-by-step instruction on how to install Node.js and setup Homebridge as a service so it automatically starts on boot:

* [Setup Homebridge on a Raspberry Pi (Raspbian)](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Raspbian)
* [Setup Homebridge on Debian or Ubuntu Linux](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Debian-or-Ubuntu-Linux)
* [Setup Homebridge on macOS](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-macOS)
* [Setup Homebridge on Windows 10](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Windows-10)
* [Setup Homebridge on Docker (Linux)](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Docker)
* [Other Platforms](https://github.com/homebridge/homebridge/wiki/Other-Platforms)

#### Quick Overview

1. **Node v10.17.0 or greater is required.** Check by running: `node -v`. The plugins you use may require newer versions.
2. Install Homebridge using: `npm install -g --unsafe-perm homebridge`
3. Install the plugins using: `npm install -g <plugin-name>`
4. Create the `config.json` file.

#### Installation Details

Homebridge is published through [NPM](https://www.npmjs.com/package/homebridge) and should be installed "globally" by typing:

```console
sudo npm install -g --unsafe-perm homebridge
```

Now you should be able to run Homebridge:

```console
$ homebridge
No plugins found. See the README for information on installing plugins.
```

Homebridge will complain if you don't have any Plugins installed, since it will essentially be useless, although you can still "pair" with it. See the next section "Installing Plugins" for more info.

Once you've installed a Plugin or two, you can run Homebridge again:

```console
$ homebridge
Couldn't find a config.json file [snip]
```

However, Homebridge won't do anything until you've created a `config.json` file containing your accessories and/or platforms. You can start by copying and modifying the included `config-sample.json` file which includes declarations for some example accessories and platforms. Each Plugin will have its own expected configuration; the documentation for Plugins should give you some real-world examples for that plugin.

**NOTE**: Your `config.json` file MUST be inside of `.homebridge`, which is inside of your home folder. On macOS and Linux, the full path for your `config.json` would be `~/.homebridge/config.json`. Any error messages will contain the exact path where your config is expected to be found.

**REALLY IMPORTANT**: You must use a "plain text" editor to create or modify `config.json`. Do NOT use apps like TextEdit on macOS or Wordpad on Windows. Apps like these will corrupt the formatting of the file in hard-to-debug ways, making improper `"` signs is an example. I suggest using the free [Atom text editor](http://atom.io).

Once you've added your config file, you should be able to run Homebridge again:

```console
$ homebridge
Loaded plugin: homebridge-lockitron
Registering accessory 'Lockitron'
---
Loaded config.json with 1 accessories and 0 platforms.
---
Loading 0 platforms...
Loading 1 accessories...
[Back Door] Initializing Lockitron accessory...
```

Homebridge is now ready to receive commands from iOS.

## Installing Plugins

Plugins are NodeJS modules published through NPM and tagged with the keyword `homebridge-plugin`. They must have a name with the prefix `homebridge-`, like **homebridge-mysmartlock**.

Plugins can publish Accessories and/or Platforms. Accessories are individual devices, like a smart switch or a garage door. Platforms act like a single device but can expose a set of devices, like a house full of smart lightbulbs.

You install Plugins the same way you installed Homebridge - as a global NPM module. For example:

```console
sudo npm install -g homebridge-lockitron
```

You can explore all available plugins at the NPM website by [searching for the keyword `homebridge-plugin`](https://www.npmjs.com/search?q=homebridge-plugin).

## Adding Homebridge to iOS

HomeKit itself is actually not an app; it's a "database" similar to HealthKit and PassKit. Where HealthKit has the companion _Health_ app and PassKit has the _Wallet_ app, HomeKit has the _Home_ app, introduced with iOS 10.

If you are a member of the iOS developer program, you might also find Apple's [HomeKit Catalog](https://developer.apple.com/library/ios/samplecode/HomeKitCatalog/Introduction/Intro.html) app to be useful, as it provides straightforward and comprehensive management of all HomeKit database "objects".

Using the Home app, or most other HomeKit apps, you should be able to add the single accessory "Homebridge", assuming that you're still running Homebridge and you're on the same Wifi network. Adding this accessory will automatically add all accessories and platforms defined in `config.json`.

When you attempt to add Homebridge, it will ask for a "PIN code". The default code is `031-45-154` (but this can be changed, see `config-sample.json`).

## Interacting with your Devices

Once your device has been added to HomeKit, you should be able to tell Siri to control your devices. However, realize that Siri is a cloud service, and iOS may need some time to synchronize your device information with iCloud.

One final thing to remember is that Siri will almost always prefer its default phrase handling over HomeKit devices. For instance, if you name your Sonos device "Radio" and try saying "Siri, turn on the Radio" then Siri will probably start playing an iTunes Radio station on your phone. Even if you name it "Sonos" and say "Siri, turn on the Sonos", Siri will probably just launch the Sonos app instead. This is why, for instance, the suggested `name` for the Sonos accessory is "Speakers".

## Writing Plugins

For a great introduction to writing plugins with some example code, check out [Frédéric Barthelet's excellent blog post](https://blog.theodo.com/2017/08/make-siri-perfect-home-companion-devices-not-supported-apple-homekit/).

There are two basic types of plugins:
* Single accessories: controls, for example, a single light bulb.
* Platform accessories: a "meta" accessory that controls many sub-accessories. For example, a bridge that translates to many other devices on a specialized channel.

There are many existing plugins you can study; you might start with the included [Example Plugins](https://github.com/homebridge/homebridge/tree/master/example-plugins). Right now this contains a single plugin that registers a platform that offers fake light accessories. This is a good example of how to use the Homebridge Plugin API. You can also find an example plugin that [publishes an individual accessory](https://github.com/homebridge/homebridge/tree/6500912f54a70ff479e63e2b72760ab589fa558a/example-plugins/homebridge-lockitron).

For more example on how to construct HomeKit Services and Characteristics, see the many Accessories in the [Legacy Plugins](https://github.com/nfarina/homebridge-legacy-plugins/tree/master/accessories) repository.

You can also view the [full list of supported HomeKit Services and Characteristics in the HAP-NodeJS protocol repository](https://github.com/KhaosT/HAP-NodeJS/blob/master/src/lib/gen/HomeKit.ts).

See more examples on how to create Platform classes in the [Legacy Plugins](https://github.com/nfarina/homebridge-legacy-plugins/tree/master/platforms) repository.

## Writing Plugins (ES6/TypeScript)

Your plugin may need to perform a lot of asynchronous communication with 3rd-party services. To avoid "callback hell", you might try using next-generation JavaScript features like **async/await**.

Check out the [`homebridge-tesla`](https://github.com/nfarina/homebridge-tesla) plugin for an example of how to write code in [TypeScript](https://github.com/nfarina/homebridge-tesla) or [ES6+Flow](https://github.com/nfarina/homebridge-tesla/tree/c9ddde85f60790614e5dd1960897a56cb93fde13) and transpile with [Babel](https://babeljs.io) and [Rollup](http://rollupjs.org) for distribution.

## Plugin Development

When writing your plugin, you'll want Homebridge to load it from your development directory instead of publishing it to `npm` each time. You can tell Homebridge to look for your plugin at a specific location using the command-line parameter `-P`. For example, if you are in the Homebridge directory (as checked out from Github), you might type:

```shell
DEBUG=* ./bin/homebridge -D -P ../my-great-plugin/
```

This will start up Homebridge and load your in-development plugin from a nearby directory. Note that you can also direct Homebridge to load your configuration from somewhere besides the default `~/.homebridge`, for example:

```shell
DEBUG=* ./bin/homebridge -D -U ~/.homebridge-dev -P ../my-great-plugin/
```

This is very useful when you are already using your development machine to host a "real" Homebridge instance (with all your accessories) that you don't want to disturb.

## Common Issues

### My iOS App Can't Find Homebridge

Two reasons why Homebridge may not be discoverable:

  1. Homebridge server thinks it's been paired with, but iOS thinks otherwise. Fix: deleted `persist/` directory which is next to your `config.json`.

  2. iOS device has gotten your Homebridge `username` (looks like a MAC address) "stuck" somehow, where it's in the database but inactive. Fix: change your `username` in the "bridge" section of `config.json` to be some new value.
  
  3. iOS DNS cache has gone stale or gotten misconfigured. Fix: Turn airplane mode on and back off to flush the DNS cache. (This is a temporary fix, but can be repeated when the problem recurs. No permanent fix is as yet known/confirmed. If you're experiencing this as a recurrent issue, it likely affects other bonjour and .local DNS resolution services, for which cycling airplane mode will also temporarily resolve.)

### Limitations

 * One installation of Homebridge can only expose 150 accessories due to a HomeKit limit. You can however run multiple Homebridge instances by pointing them to different config and persistence paths (see issue #827).
 * Once an accessory has been added to the Home app, changing its name via Homebridge won't be automatically reflected in iOS. You must change it via the Home app as well.

## Why Homebridge?

Technically, the device manufacturers should be the ones implementing the HomeKit API. And I'm sure they will - eventually. When they do, this project will be obsolete, and I hope that happens soon. In the meantime, Homebridge is a fun way to get a taste of the future, for those who just can't bear to wait until "real" HomeKit devices are on the market.

## Credit

Homebridge was originally created by [Nick Farina](https://twitter.com/nfarina).

The original HomeKit API work was done by [Khaos Tian](https://twitter.com/khaost) in his [HAP-NodeJS](https://github.com/KhaosT/HAP-NodeJS) project.
