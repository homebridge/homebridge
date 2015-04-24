
# HomeBridge

HomeBridge is a lightweight NodeJS server you can run on your home network that emulates the iOS HomeKit API. It includes a set of "shims" (found in the [accessories](accessories/) folder) that provide a basic bridge from HomeKit to various 3rd-party APIs provided by manufacturers of "smart home" devices.

Since Siri supports devices added through HomeKit, this means that with HomeBridge you can ask Siri to control devices that don't have any support for HomeKit at all. For instance, using the included shims, you can say things like:

 * _Siri, unlock the front door._ ([Lockitron](https://lockitron.com))
 * _Siri, open the garage door._ ([LiftMaster MyQ](https://www.myliftmaster.com))
 * _Siri, turn on the Leaf._ ([Carwings](http://www.nissanusa.com/innovations/carwings.article.html))
 * _Siri, turn off the Speakers._ ([Sonos](http://www.sonos.com))
 * _Siri, turn on the Dehumidifier._ ([WeMo](http://www.belkin.com/us/Products/home-automation/c/wemo-home-automation/))
 * _Siri, turn on Away Mode._ ([Xfinity Home](http://www.comcast.com/home-security.html))
 * _Siri, turn on the living room lights._ ([X10 via rest-mochad](http://github.com/edc1591/rest-mochad))

If you would like to support any other devices, please write a shim and create a pull request and I'd be happy to add it to this official list.

# Why?

Technically, the device manufacturers should be the ones implementing the HomeKit API. And I'm sure they will - eventually. When they do, these shims will be obsolete, and I hope that happens soon. In the meantime, this server is a fun way to get a taste of the future, for those who just can't bear to wait until "real" HomeKit devices are on the market.

# Credit

HomeBridge itself is basically just a set of shims and a README. The actual HomeKit API work was done by [KhaosT](http://twitter.com/khaost) in his [HAP-NodeJS](https://github.com/KhaosT/HAP-NodeJS) project. Additionally, many of the shims benefit from amazing NodeJS projects out there like `sonos` and `wemo` that implement all the interesting functionality.

# Before you Begin

I would call this project a "novelty" in its current form, and is for **experienced developers only**. To make any of this work, you'll need:

 * An Apple iOS Developer account ($99) and a registered bundle ID so you can build and run the HomeKit iOS app.
 * An always-running server (like a Raspberry Pi) on which you can install NodeJS.
 * Knowledge of Git submodules and npm.

You'll also need a lot of patience, as the iOS HomeKit service does not appear to be fully baked yet. For me, it works "most of the time", but often I'll tell Siri to do something like open the front door and she'll act like she's forgotten everything, saying things like "Change what?" over and over again while I freeze to death outside.

It's not surprising that HomeKit isn't rock solid, since almost no one can actually use it today besides developers who are creating hardware accessories for it. There are, to my knowledge, exactly zero HomeKit devices on the market right now, so Apple can easily get away with this all being a work in progress.

Additionally, the shims I've created implement the bare minimum of HomeKit needed to provide basic functionality like turning things off and on. I haven't written any kind of good feedback or error handling, and although they support changing state, they don't support reading the current state, so if you ask questions like "Is my door unlocked?" Siri will respond with the default of "Nope!" no matter what.

# Getting Started

OK, if you're still excited enough about ordering your home to make coffee for you (which, who wouldn't be!) then here's how to set things up. First, clone this repo and also init submodules to grab the [HAP-NodeJS](https://github.com/KhaosT/HAP-NodeJS) project which isn't in npm. You'll also need to run `npm rebuild` on HAP-NodeJS because the `node_modules` folder is already in the Git repo.

    $ git clone https://github.com/nfarina/homebridge.git
    $ cd homebridge
    $ git submodule init
    $ git submodule update
    $ npm install
    $ cd lib/HAP-NodeJS
    $ npm rebuild

Now you should be able to run the homebridge server:

    $ cd homebridge
    $ npm run start
    Starting HomeBridge server...
    Couldn't find a config.json file [snip]

The server won't do anything until you've created a `config.json` file containing your home devices (or _accessories_ in HomeKit parlance) you wish to make available to iOS.

One you've added your devices, you should be able to run the server again and see them initialize:

    $ npm run start
    Starting HomeBridge server...
    Loading 6 accessories...
    [Speakers] Initializing 'Sonos' accessory...
    [Coffee Maker] Initializing 'WeMo' accessory...

Your server is now ready to receive commands from iOS.

# Adding your devices to iOS

This part is a bit painful. HomeKit is actually not an app; it's a "database" similar to HealthKit and PassKit. But where HealthKit has the companion _Health_ app and PassKit has _Passbook_, Apple has supplied no app for managing your HomeKit database (yet). The HomeKit API is open for developers to write their own apps for adding devices to HomeKit, but there are no apps like that in the App Store (probably not an accident).

That means you'll need to build and run your own HomeKit iOS app using your Apple Developer account.

There are a few apps out there that let you manage your HomeKit database, but the best one I've found is [BetterHomeKit](https://github.com/KhaosT/HomeKit-Demo), also made by [KhaosT](http://twitter.com/khaost).

The tricky part is that, in order to run an app that uses HomeKit on your phone, you'll need to register your own unique App ID in the Apple Developer Portal, as if you were planning to submit this app to the App Store, and you'll need to enable the HomeKit "service" for that App ID in the Apple Developer Portal (similar to Game Center). You'll need to pick your own unique Bundle ID as well (like `com.yourdomain.HomeKitApp`), and actually _change_ the BetterHomeKit `Info.plist` to use that bundle ID instead of the default `org.oltica.BetterHomeKit`.

Once you've gotten the app running on your iOS device, you should be presented with a blank "Accessories" list with an Add ("+") button in the upper-right. When you press that button, your iOS device should "discover" the accessories defined in your `config.json` file, assuming that you're still running the HomeBridge server and you're on the same Wifi network.

When you attempt to add a device, it will ask for a "PIN code". The default code for _all_ HomeBridge accessories is `031-45-154`. Adding the device should create some files in the `persist` directory of the HomeBridge server, which stores the pairing relationship.

# Interacting with your Devices

Once your device has been added to HomeKit, it should appear in the Accessories screen in BetterHomeKit. You can play with some of the other HomeKit features like assigning accessories to Rooms, creating Zones, Triggers and Actions (although I haven't tested these myself so I can't explain if and how they work).

At this point, you should be able to tell Siri to control your devices. However, realize that Siri is a cloud service, and iOS may need some time to synchronize your device information with iCloud.

Also, keep in mind HomeKit is not very robust yet, and it is common for it to fail intermittently ("Sorry, I wasn't able to control your devices" etc.) then start working again for no reason. Also I've noticed that it will get cranky and stop working altogether sometimes. The usual voodoo applies here: reboot your device, or run the BetterHomeKit app and poke around, etc.

One final thing to remember is that Siri will almost always prefer its default phrase handling over HomeKit devices. For instance, if you name your Sonos device "Radio" and try saying "Siri, turn on the Radio" then Siri will probably start playing an iTunes Radio station on your phone. Even if you name it "Sonos" and say "Siri, turn on the Sonos", Siri will probably just launch the Sonos app instead. This is why, for instance, the suggested `name` for the Sonos shim in `config-samples.json` is "Speakers".

# Final Notes

HomeKit is definitely amazing when it works. Speaking to Siri is often much quicker and easier than launching whatever app your device manufacturer provides.

I welcome any suggestions or pull requests, but keep in mind that it's likely not possible to support all the things you might want to do with a device through HomeKit. For instance, you might want to hack the Sonos shim to play the specific kind of music you want and that's great, but it might not be appropriate to merge those specific changes into this repository. The shims here should be mostly simple "canonical examples" and easily hackable by others.

Good luck!
