
# Homebridge

Homebridge is a lightweight NodeJS server you can run on your home network that emulates the iOS HomeKit API. It includes a set of "shims" (found in the [accessories](accessories/) and [platforms](platforms/) folders) that provide a basic bridge from HomeKit to various 3rd-party APIs provided by manufacturers of "smart home" devices.

Since Siri supports devices added through HomeKit, this means that with Homebridge you can ask Siri to control devices that don't have any support for HomeKit at all. For instance, using the included shims, you can say things like:

 * _Siri, unlock the front door._ ([Lockitron](https://lockitron.com))
 * _Siri, open the garage door._ ([LiftMaster MyQ](https://www.myliftmaster.com))
 * _Siri, turn on the Leaf._ ([Carwings](http://www.nissanusa.com/innovations/carwings.article.html))
 * _Siri, turn off the Speakers._ ([Sonos](http://www.sonos.com))
 * _Siri, turn on the Dehumidifier._ ([WeMo](http://www.belkin.com/us/Products/home-automation/c/wemo-home-automation/))
 * _Siri, turn on Away Mode._ ([Xfinity Home](http://www.comcast.com/home-security.html))
 * _Siri, turn on the living room lights._ ([Wink](http://www.wink.com), [SmartThings](http://www.smartthings.com), [X10](http://github.com/edc1591/rest-mochad), [Philips Hue](http://meethue.com))
 * _Siri, set the movie scene._ ([Logitech Harmony](http://myharmony.com/))

If you would like to support any other devices, please write a shim and create a pull request and I'd be happy to add it to this official list.

# Shim types
There are 2 types of shims supported in Homebridge.

* Accessory - Individual device
* Platform - A full bridge to another system

## Accessories

Accessories are individual devices you would like to bridge to HomeKit. You set them up by declaring them individually in your `config.json` file. Generally, you specify them by `name` or `id` and which system they use.

## Platforms

Platforms bridge entire systems to HomeKit. Platforms can be things like Wink or SmartThings or Vera. By adding a platform to your `config.json`, Homebridge will automatically detect all of your devices for you.

All you have to do is add the right config options so Homebridge can authenticate and communicate with your other system, and voila, your devices will be available to HomeKit via Homebridge.

# Why?

Technically, the device manufacturers should be the ones implementing the HomeKit API. And I'm sure they will - eventually. When they do, these shims will be obsolete, and I hope that happens soon. In the meantime, this server is a fun way to get a taste of the future, for those who just can't bear to wait until "real" HomeKit devices are on the market.

# Credit

Homebridge itself is basically just a set of shims and a README. The actual HomeKit API work was done by [KhaosT](http://twitter.com/khaost) in his [HAP-NodeJS](https://github.com/KhaosT/HAP-NodeJS) project. Additionally, many of the shims benefit from amazing NodeJS projects out there like `sonos` and `wemo` that implement all the interesting functionality.

# Before you Begin

I would call this project a "novelty" in its current form, and is for **intrepid hackers only**. To make any of this work, you'll need:

 * An app on your iOS device that can manage your HomeKit database.
 * An always-running server (like a Raspberry Pi) on which you can install NodeJS.
 * Knowledge of Git submodules and npm.

You'll also need some patience, as Siri can be very strict about sentence structure, and occasionally she will forget about HomeKit altogether. But it's not surprising that HomeKit isn't rock solid, since almost no one can actually use it today besides developers who are creating hardware accessories for it. There are, to my knowledge, exactly zero licensed HomeKit devices on the market right now, so Apple can easily get away with this all being a work in progress.

# Getting Started

OK, if you're still excited enough about ordering Siri to make your coffee (which, who wouldn't be!) then here's how to set things up. First, clone this repo:

    $ git clone https://github.com/nfarina/homebridge.git
    $ cd homebridge
    $ npm install

**Node**: You'll need to have NodeJS version 0.12.x or better installed for required submodule `HAP-NodeJS` to load.

Now you should be able to run the homebridge server:

    $ cd homebridge
    $ npm run start
    Starting Homebridge server...
    Couldn't find a config.json file [snip]

The server won't do anything until you've created a `config.json` file containing your home devices (or _accessories_ in HomeKit parlance) or platforms you wish to make available to iOS. You can start by copying and modifying the included `config-sample.json` file which includes declarations for all supported accessories and platforms.

Once you've added your devices and/or platforms, you should be able to run the server again and see them initialize:

    $ npm run start
    Starting Homebridge server...
    Loading 6 accessories...
    [Speakers] Initializing 'Sonos' accessory...
    [Coffee Maker] Initializing 'WeMo' accessory...
    [Speakers] Initializing 'Sonos' accessory...
    [Coffee Maker] Initializing 'WeMo' accessory...
    [Wink] Initializing Wink platform...
    [Wink] Fetching Wink devices.
    [Wink] Initializing device with name Living Room Lamp...

Your server is now ready to receive commands from iOS.

# Adding your devices to iOS

HomeKit is actually not an app; it's a "database" similar to HealthKit and PassKit. But where HealthKit has the companion _Health_ app and PassKit has _Passbook_, Apple has supplied no app for managing your HomeKit database (at least [not yet](http://9to5mac.com/2015/05/20/apples-planned-ios-9-home-app-uses-virtual-rooms-to-manage-homekit-accessories/)). However, the HomeKit API is open for developers to write their own apps for adding devices to HomeKit.

Fortunately, there are now a few apps in the App Store that can manage your HomeKit devices. The most comprehensive one I've used is [MyTouchHome](https://itunes.apple.com/us/app/mytouchhome/id965142360?mt=8&at=11lvmd&ct=mhweb) which costs $2.

There are also some free apps that work OK. Try [Insteon+](https://itunes.apple.com/US/app/id919270334?mt=8) or [Lutron](https://itunes.apple.com/us/app/lutron-app-for-caseta-wireless/id886753021?mt=8) or a number of others.

If you are a member of the iOS developer program, I highly recommend Apple's [HomeKit Catalog](https://developer.apple.com/library/ios/samplecode/HomeKitCatalog/Introduction/Intro.html) app, as it is reliable and comprehensive and free (and open source).

## Adding HomeKit Accessories

Once you've gotten a HomeKit app running on your iOS device, you can use it to add your Homebridge devices. The app should "discover" the single accessory "Homebridge", assuming that you're still running the Homebridge server and you're on the same Wifi network. Adding this accessory will automatically add all accessories and platforms defined in `config.json`.

When you attempt to add Homebridge, it will ask for a "PIN code". The default code is `031-45-154` (but this can be changed, see `config-sample.json`). This process will create some files in the `persist` directory of the Homebridge server, which stores the pairing relationship.

# Interacting with your Devices

Once your device has been added to HomeKit, you should be able to tell Siri to control your devices. However, realize that Siri is a cloud service, and iOS may need some time to synchronize your device information with iCloud.

One final thing to remember is that Siri will almost always prefer its default phrase handling over HomeKit devices. For instance, if you name your Sonos device "Radio" and try saying "Siri, turn on the Radio" then Siri will probably start playing an iTunes Radio station on your phone. Even if you name it "Sonos" and say "Siri, turn on the Sonos", Siri will probably just launch the Sonos app instead. This is why, for instance, the suggested `name` for the Sonos shim in `config-samples.json` is "Speakers".

# Final Notes

HomeKit is definitely amazing when it works. Speaking to Siri is often much quicker and easier than launching whatever app your device manufacturer provides.

I welcome any suggestions or pull requests, but keep in mind that it's likely not possible to support all the things you might want to do with a device through HomeKit. For instance, you might want to hack the Sonos shim to play the specific kind of music you want and that's great, but it might not be appropriate to merge those specific changes into this repository. The shims here should be mostly simple "canonical examples" and easily hackable by others.

Good luck!
