<p align="center">
  <a href="https://homebridge.io"><img src="https://raw.githubusercontent.com/homebridge/branding/latest/logos/homebridge-color-round-stylized.png" height="140"></a>
</p>

<span align="center">

# Homebridge

<a href="https://www.npmjs.com/package/homebridge"><img title="npm version" src="https://badgen.net/npm/v/homebridge?label=stable"></a>
<a href="https://github.com/homebridge/homebridge/wiki/Homebridge-Beta-Testing"><img title="npm version" src="https://badgen.net/npm/v/homebridge/beta?label=beta"></a>
<a href="https://www.npmjs.com/package/homebridge"><img title="npm downloads" src="https://badgen.net/npm/dt/homebridge"></a>
<a href="https://github.com/homebridge/homebridge/actions/workflows/build.yml"><img title="Node Build" src="https://github.com/homebridge/homebridge/actions/workflows/build.yml/badge.svg"></a>

</span>

<img src="https://media.giphy.com/media/10l79ICohTu4iQ/giphy.gif" align="right" alt="Unlocking Door">

**Homebridge** is a lightweight Node.js server you can run on your home network that emulates the iOS HomeKit API. It supports Plugins, which are community-contributed modules that provide a basic bridge from HomeKit to various 3rd-party APIs provided by manufacturers of "smart home" devices. 

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

<img align="left" src="https://user-images.githubusercontent.com/3979615/59594350-07b45b80-9137-11e9-85fd-e75093ba91a4.png" alt="raspbian" height="75" width="75"/>

### Raspberry Pi

[Official Homebridge Raspberry Pi Image](https://github.com/homebridge/homebridge-raspbian-image/wiki/Getting-Started) <br> [Install Homebridge on Raspbian](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Raspbian)

---

<img align="left" src="https://user-images.githubusercontent.com/3979615/59595664-93c78280-9139-11e9-83dc-4d6f9405e788.png" alt="linux" height="75" width="75"/>

### Linux

[Debian or Ubuntu Linux](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Debian-or-Ubuntu-Linux) |
[Red Hat, CentOS or Fedora Linux](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Red-Hat%2C-CentOS-or-Fedora-Linux) | [Arch / Manjaro Linux|Install Homebridge on Arch Linux](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Arch-Linux) <br>

---

<img align="left" src="https://user-images.githubusercontent.com/3979615/59594157-b015f000-9136-11e9-93cb-c9d9773ec9e8.png" alt="macos" height="75" width="75"/>

### macOS

[Install Homebridge on macOS](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-macOS)

---

<img align="left" src="https://user-images.githubusercontent.com/3979615/59593218-e0f52580-9134-11e9-8b77-585755af5d99.png" alt="windows" height="75" width="75"/>

### Windows 10 / 11

[Install Homebridge on Windows 10 / 11 Using Hyper V](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Windows-10-Using-Hyper-V)

---

<img align="left" src="https://user-images.githubusercontent.com/3979615/59594527-56fa8c00-9137-11e9-937b-32092dfcff41.png" alt="docker" height="75" width="75"/>

### Docker

[Install Homebridge on Docker](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Docker)  <br> [Synology](https://github.com/homebridge/docker-homebridge/wiki/Homebridge-on-Synology) | [Unraid](https://github.com/homebridge/docker-homebridge/wiki/Homebridge-on-Unraid) | [QNAP](https://github.com/homebridge/docker-homebridge/wiki/Homebridge-on-QNAP) | [TrueNAS Scale](https://github.com/homebridge/docker-homebridge/wiki/Homebridge-on-TrueNAS-Scale)

---

<img align="left" src="https://user-images.githubusercontent.com/3979615/78118531-dc46f700-7452-11ea-95e5-977f79d1904f.png" alt="docker" height="75" width="75"/>

### Synology DSM

[Install Homebridge on Synology DSM 7](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Synology-DSM)

### Other Platforms

[Other Platforms](https://github.com/homebridge/homebridge/wiki/Other-Platforms)

## Adding Homebridge to iOS

1. Open the Home <img src="https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png" height="16.42px"> app on your device.
2. Tap the Home tab, then tap <img src="https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png" height="16.42px">.
3. Tap *Add Accessory*, then scan the QR code shown in the Homebridge UI or your Homebridge logs.

If the bridge does not have any accessories yet, you may receive a message saying *Additional Set-up Required*, this is ok, as you add plugins they will show up in the Home app without the need to pair again (except for Cameras and TVs).

Cameras and most TV devices are exposed as separate accessories and each needs to be paired separately. See [this wiki article](https://github.com/homebridge/homebridge/wiki/Connecting-Homebridge-To-HomeKit#how-to-add-homebridge-cameras--tvs) for instructions.

## Interacting with your Devices

Once your device has been added to HomeKit, you should be able to tell Siri to control your devices. However, realize that Siri is a cloud service, and iOS may need some time to synchronize your device information with iCloud.

One final thing to remember is that Siri will almost always prefer its default phrase handling over HomeKit devices. For instance, if you name your Sonos device "Radio" and try saying "Siri, turn on the Radio" then Siri will probably start playing an iTunes Radio station on your phone. Even if you name it "Sonos" and say "Siri, turn on the Sonos", Siri will probably just launch the Sonos app instead. This is why, for instance, the suggested `name` for the Sonos accessory is "Speakers".

## Plugin Development

The https://developers.homebridge.io website contains the Homebridge API reference, available service and characteristic types, and plugin examples.

The [Homebridge Plugin Template](https://github.com/homebridge/homebridge-plugin-template) project provides a base you can use to create your own *platform* plugin.

There are many existing plugins you can study; you might start with the [Homebridge Example Plugins](https://github.com/homebridge/homebridge-examples) or a plugin that already implements the device type you need.

When writing your plugin, you'll want Homebridge to load it from your development directory instead of publishing it to `npm` each time. Run this command inside your plugin project folder so your global installation of Homebridge can discover it:


```shell
npm link
```

*You can undo this using the `npm unlink` command.*

Then start Homebridge in debug mode:

```shell
homebridge -D
```

This will start up Homebridge and load your in-development plugin. Note that you can also direct Homebridge to load your configuration from somewhere besides the default `~/.homebridge`, for example:

```shell
homebridge -D -U ~/.homebridge-dev
```

This is very useful when you are already using your development machine to host a "real" Homebridge instance (with all your accessories) that you don't want to disturb.

## Common Issues

### Home App Says Accessory Already Added

To fix this, [Reset Homebridge](https://github.com/homebridge/homebridge/wiki/Connecting-Homebridge-To-HomeKit#how-to-reset-homebridge).

### My iOS App Can't Find Homebridge

Try the following:

  1. Swap between the `Bonjour HAP` and `Ciao` mDNS Advertiser options. See [the wiki](https://github.com/homebridge/homebridge/wiki/mDNS-Options) for more details.
  2. iOS DNS cache has gone stale or gotten misconfigured. To fix this, turn airplane mode on and back off to flush the DNS cache. 

### Limitations

 * One bridge can only expose 150 accessories due to a HomeKit limit. You can however run your plugins as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) or run [Multiple Homebridge Instances](https://github.com/oznu/homebridge-config-ui-x/wiki/Homebridge-Service-Command#multiple-instances) to get around this limitation.
 * Once an accessory has been added to the Home app, changing its name via Homebridge won't be automatically reflected in iOS. You must change it via the Home app as well.

## Why Homebridge?

Technically, the device manufacturers should be the ones implementing the HomeKit API. And I'm sure they will - eventually. When they do, this project will be obsolete, and I hope that happens soon. In the meantime, Homebridge is a fun way to get a taste of the future, for those who just can't bear to wait until "real" HomeKit devices are on the market.

## Credit

Homebridge was originally created by [Nick Farina](https://twitter.com/nfarina).

The original HomeKit API work was done by [Khaos Tian](https://twitter.com/khaost) in his [HAP-NodeJS](https://github.com/homebridge/HAP-NodeJS) project.
