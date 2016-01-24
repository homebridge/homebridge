
[![Slack Status](https://homebridge-slackin.herokuapp.com/badge.svg)](https://homebridge-slackin.herokuapp.com)

# Homebridge

![](https://media.giphy.com/media/10l79ICohTu4iQ/giphy.gif)

Homebridge is a lightweight NodeJS server you can run on your home network that emulates the iOS HomeKit API. It supports Plugins, which are community-contributed modules that provide a basic bridge from HomeKit to various 3rd-party APIs provided by manufacturers of "smart home" devices. 

Since Siri supports devices added through HomeKit, this means that with Homebridge you can ask Siri to control devices that don't have any support for HomeKit at all. For instance, using just some of the available plugins, you can say:

 * _Siri, unlock the back door._ [pictured above]
 * _Siri, open the garage door._
 * _Siri, turn on the coffee maker._ 
 * _Siri, turn on the living room lights._
 * _Siri, good morning!_

You can explore all available plugins at the NPM website by [searching for the keyword `homebridge-plugin`](https://www.npmjs.com/search?q=homebridge-plugin).

# Community

If you're having an issue with a particular plugin, open an issue in that plugin's Github repository. If you're having an issue with Homebridge itself, feel free to open issues and PRs here.

You can also chat with us in our nascent [Slack instance](http://homebridge-slackin.herokuapp.com).

# Installation

**Note:** If you're running on Linux, you'll need to make sure you have the `libavahi-compat-libdnssd-dev` package installed. If you're running on a Raspberry Pi, you should have a look at the [Wiki](https://github.com/nfarina/homebridge/wiki/Running-HomeBridge-on-a-Raspberry-Pi).

Homebridge is published through [NPM](https://www.npmjs.com/package/homebridge) and should be installed "globally" by typing:

    sudo npm install -g homebridge

Now you should be able to run Homebridge:

    $ homebridge
    No plugins found. See the README for information on installing plugins.

Homebridge will complain if you don't have any Plugins installed, since it will essentially be useless, although you can still "pair" with it. See the next section "Installing Plugins" for more info.

Once you've installed a Plugin or two, you can run Homebridge again:

    $ homebridge
    Couldn't find a config.json file [snip]

However, Homebridge won't do anything until you've created a `config.json` file containing your accessories and/or platforms. You can start by copying and modifying the included `config-sample.json` file which includes declarations for some example accessories and platforms. Each Plugin will have its own expected configuration; the documentation for Plugins should give you some real-world examples for that plugin.

**NOTE**: Your `config.json` file MUST live in your home directory inside `.homebridge`. The full error message will contain the exact path where your config is expected to be found.

**REALLY IMPORTANT**: You must use a "plain text" editor to create or modify `config.json`. Do NOT use apps like TextEdit on Mac or Wordpad on Windows; these apps will corrupt the formatting of the file in hard-to-debug ways. I suggest using the free [Atom text editor](http://atom.io).

Once you've added your config file, you should be able to run Homebridge again:

    $ homebridge
    Loaded plugin: homebridge-lockitron
    Registering accessory 'Lockitron'
    ---
    Loaded config.json with 1 accessories and 0 platforms.
    ---
    Loading 0 platforms...
    Loading 1 accessories...
    [Back Door] Initializing Lockitron accessory...

Homebridge is now ready to receive commands from iOS.

# Installing Plugins

Plugins are NodeJS modules published through NPM and tagged with the keyword `homebridge-plugin`. They must have a name with the prefix `homebridge-`, like **homebridge-mysmartlock**.

Plugins can publish Accessories and/or Platforms. Accessories are individual devices, like a smart switch or a garage door. Platforms act like a single device but can expose a set of devices, like a house full of smart lightbulbs.

You install Plugins the same way you installed Homebridge - as a global NPM module. For example:

    sudo npm install -g homebridge-lockitron

You can explore all available plugins at the NPM website by [searching for the keyword `homebridge-plugin`](https://www.npmjs.com/search?q=homebridge-plugin).

**IMPORTANT**: Many of the plugins that Homebridge used to include with its default installation have been moved to the single plugin [homebridge-legacy-plugins](https://www.npmjs.com/package/homebridge-legacy-plugins).

# Adding Homebridge to iOS

HomeKit is actually not an app; it's a "database" similar to HealthKit and PassKit. But where HealthKit has the companion _Health_ app and PassKit has _Passbook_, Apple has supplied no app for managing your HomeKit database (at least [not yet](http://9to5mac.com/2015/05/20/apples-planned-ios-9-home-app-uses-virtual-rooms-to-manage-homekit-accessories/)). However, the HomeKit API is open for developers to write their own apps for adding devices to HomeKit.

Fortunately, there are now a few apps in the App Store that can manage your HomeKit devices. The most comprehensive one I've used is [MyTouchHome](https://itunes.apple.com/us/app/mytouchhome/id965142360?mt=8&at=11lvmd&ct=mhweb) which costs $2.

There are also some free apps that work OK. Try [Insteon+](https://itunes.apple.com/US/app/id919270334?mt=8) or [Lutron](https://itunes.apple.com/us/app/lutron-app-for-caseta-wireless/id886753021?mt=8) or a number of others.

If you are a member of the iOS developer program, I highly recommend Apple's [HomeKit Catalog](https://developer.apple.com/library/ios/samplecode/HomeKitCatalog/Introduction/Intro.html) app, as it is reliable and comprehensive and free (and open source).

Once you've gotten a HomeKit app running on your iOS device, it should "discover" the single accessory "Homebridge", assuming that you're still running Homebridge and you're on the same Wifi network. Adding this accessory will automatically add all accessories and platforms defined in `config.json`.

When you attempt to add Homebridge, it will ask for a "PIN code". The default code is `031-45-154` (but this can be changed, see `config-sample.json`).

# Interacting with your Devices

Once your device has been added to HomeKit, you should be able to tell Siri to control your devices. However, realize that Siri is a cloud service, and iOS may need some time to synchronize your device information with iCloud.

One final thing to remember is that Siri will almost always prefer its default phrase handling over HomeKit devices. For instance, if you name your Sonos device "Radio" and try saying "Siri, turn on the Radio" then Siri will probably start playing an iTunes Radio station on your phone. Even if you name it "Sonos" and say "Siri, turn on the Sonos", Siri will probably just launch the Sonos app instead. This is why, for instance, the suggested `name` for the Sonos accessory is "Speakers".

# Writing Plugins

We don't have a lot of documentation right now for creating plugins, but there are many existing plugins you can study.

The best place to start is the included [Example Plugins](https://github.com/nfarina/homebridge/tree/master/example-plugins). Right now this contains a single plugin that registers a fake door lock Accessory. This will show you how to use the Homebridge Plugin API.

For more example on how to construct HomeKit Services and Characteristics, see the many Accessories in the [Legacy Plugins](https://github.com/nfarina/homebridge-legacy-plugins/tree/master/accessories) repository.

You can also view the [full list of supported HomeKit Services and Characteristics in the HAP-NodeJS protocol repository](https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js).

There isn't currently an example for how to publish a Platform (which allows the user to bridge many discovered devices at once, like a house full of smart lightbulbs), but the process is almost identical to registering an Accessory. Simply modify the example `index.js` in [homebridge-lockitron](https://github.com/nfarina/homebridge/tree/master/example-plugins/homebridge-lockitron) to say something like:

    homebridge.registerPlatform("homebridge-myplugin", "MyPlatform", MyPlatform);

See more examples on how to create Platform classes in the [Legacy Plugins](https://github.com/nfarina/homebridge-legacy-plugins/tree/master/platforms) repository.

# Common Issues

### My iOS App Can't Find Homebridge

Two reasons why Homebridge may not be discoverable:

  1. Homebridge server thinks it's been paired with, but iOS thinks otherwise. Fix: deleted `persist/` directory which is next to your `config.json`.

  2. iOS device has gotten your Homebridge `username` (looks like a MAC address) "stuck" somehow, where it's in the database but inactive. Fix: change your `username` in the "bridge" section of `config.json` to be some new value.

### Errors on startup

The following errors are experienced when starting Homebridge and can be safely ignored. The cost of removing the issue at the core of the errors isn't worth the effort.

```
*** WARNING *** The program 'nodejs' uses the Apple Bonjour compatibility layer of Avahi
*** WARNING *** Please fix your application to use the native API of Avahi!
*** WARNING *** For more information see http://0pointerde/avahi-compat?s=libdns_sd&e=nodejs
*** WARNING *** The program 'nodejs' called 'DNSServiceRegister()' which is not supported (or only supported partially) in the Apple Bonjour compatibility layer of Avahi
*** WARNING *** Please fix your application to use the native API of Avahi!
*** WARNING *** For more information see http://0pointerde/avahi-compat?s=libdns_sd&e=nodejs&f=DNSServiceRegister
```

# Why Homebridge?

Technically, the device manufacturers should be the ones implementing the HomeKit API. And I'm sure they will - eventually. When they do, this project will be obsolete, and I hope that happens soon. In the meantime, Homebridge is a fun way to get a taste of the future, for those who just can't bear to wait until "real" HomeKit devices are on the market.

# Credit

The original HomeKit API work was done by [KhaosT](http://twitter.com/khaost) in his [HAP-NodeJS](https://github.com/KhaosT/HAP-NodeJS) project.
