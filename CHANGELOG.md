# Change Log

All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/).

## v1.2.5 (2020-12-28)

### Bug Fixes

* Updated HAP-NodeJS to [v0.8.5](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.8.5) incorporating
fixes made to the `ciao` mDNS library.  
  Refer to the release notes of HAP-NodeJS for more techicnal details.

## v1.2.4 (2020-12-05)

### Bug Fixes

* Updated the mdns library `ciao` to [v1.1.0](https://github.com/homebridge/ciao/releases/tag/v1.1.0)
introducing further stability improvements.

## v1.2.3 (2020-09-21)

### Bug Fixes

* Updated the mdns library `ciao` to the latest version
    * Includes general bug fixes and stability improvements
    * Improved compatibility with machines running avahi
    * Fixed handling of updated ip addresses
    * Fixes for Darwin system running in a VM

## v1.2.2 (2020-09-16)

### Bug Fixes

* Added a warning when a plugin takes too long to load and prevents homebridge from starting.
* Update hap-nodejs to v0.8.2 resolving some advertising issues on some uncommon platforms

#### For Developers

* Updated the typing of the accessory context to be any again to allow less strict typing. Though we encourage you to write your own Type Definition for better type safety!

## v1.2.1 (2020-09-15)

### Bug Fixes

* Fixed a bug related to mdns discovery where on some machines (FreeBSD and some containerized installs) the accessory is not correctly advertised on the local network

## v1.2.0 (2020-09-14)

### Notable Changes

* Updated [HAP-Nodejs](https://github.com/homebridge/HAP-NodeJS) to v0.8.0 (see [HAP-NodeJS release notes](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.8.0)).  
This includes the rewritten bonjour/mdns library `ciao`, which improves Accessory discovery on the local network ([#2619](https://github.com/homebridge/homebridge/issues/2619)).
* Add ability to type an accessory context using generics ([2664](https://github.com/homebridge/homebridge/pull/2664))

## v1.1.6 (2020-09-07)

### Bug Fixes

* Fixed an incompatibility introduced in v1.1.3 with the `commander ` library

## v1.1.3 (2020-09-03)

### Bug Fixes

* Updated [HAP-Nodejs](https://github.com/homebridge/HAP-NodeJS) to v0.7.9 (see [HAP-NodeJS release notes](https://github.com/homebridge/HAP-NodeJS/releases)):
  * IP addresses for camera streaming endpoints are automatically and more reliably set
  * Added latest changes made to iOS 14 beta 4 and 5

## v1.1.2 (2020-08-12)

### Bug Fixes

* [#2646](https://github.com/homebridge/homebridge/pull/2646) - Fixed an issue with scoped plugin registration / cached accessory restoration.

## v1.1.1 (2020-06-17)

### Bug Fixes

* Updated [HAP-Nodejs](https://github.com/homebridge/HAP-NodeJS) to v0.7.4 (see [v0.7.4 release notes](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.7.4))

## v1.1.0 (2020-05-17)

*Reminder: Node.js v10.17.0 or later is **required** to run Homebridge.*

### Notable Changes

* Bumped API version to `2.6` with the following changes:
    * AccessoryPlugins and Accessory objects returned by StaticPlatformPlugins can now define the optional 
        `getControllers` method to configure controllers like the RemoteController or CameraController
* Updated [HAP-Nodejs](https://github.com/homebridge/HAP-NodeJS) to v0.7.3.
    * Moved to the built in Node.js crypto library for *chacha20-poly1305* encryption and decryption. This gives a 10x performance boost when doing crypto.
    * All debuggers are now prefixed with the library name, `HAP-NodeJS:`.
    * [v0.7.0 Release Notes](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.7.0)
    * [v0.7.1 Release Notes](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.7.1)
    * [v0.7.2 Release Notes](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.7.2)
    * [v0.7.3 Release Notes](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.7.3)

### Bug Fixes

* [#2551](https://github.com/homebridge/homebridge/issues/2551) Fixed a breaking change to the `identify` event on PlatformAccessory.

### For Developers

**Plugins Using TypeScript:** Homebridge now only exports *types* that are safe to use in your code and won't result in the `homebridge` library being a runtime dependency. If you have been using types correctly then you will not be impacted by this change.

## v1.0.4 (2020-04-30)

### Bug Fixes

* Fixed a crash that could occur if a plugin called `updateReachability` before the accessory was added to the bridge (https://github.com/devbobo/homebridge-arlo/issues/40#issuecomment-620928214)
* Fixed a crash that could occur while pairing when running plugins (like homebridge-nest) which register a AccessoryInformation service that already has added a Identify listener of HAP-NodeJS (https://github.com/homebridge/homebridge/issues/2548)
* Fixed mdns advertising to include all (and only) reachable addresses for the given machine

## v1.0.3 (2020-04-29)

* Some users were seemingly unable to pair new homebridge instances or encountered "no response" for all of their accessories if plugins chose to supply an empty serial number for their accessory information. This is now resolved.
* Added a check that plugins can't expose a accessory with an empty set of services (which would also cause HomeKit reject the accessory)

## v1.0.2 (2020-04-28)

### Bug Fixes

* [#2527](https://github.com/homebridge/homebridge/pull/2527) Improve cached accessory resolution.
* [#2528](https://github.com/homebridge/homebridge/pull/2528) Removing orphaned cached accessories is now the default behavior.
    * The `-R` flag was deprecated. A new `-K`/`--keep-orphans` flag was introduced to disable this behavior.

## v1.0.1 (2020-04-27)

### Notable Changes

* [#2522](https://github.com/homebridge/homebridge/pull/2522) Allow plugins that have strict Homebridge version requirements to still load, instead an error message will be posted in the Homebridge logs letting users know they may face issues using the current version of the plugin.

## v1.0.0 (2020-04-27)

### Breaking Changes

* **The minimum Node.js version required is now `v10.17.0`.**
* **Important notice:** The update to the underlying HAP-NodeJS library brings many fixes to the HomeKit Accessory Protocol. One of those is the permission management of people you may have added to your Home. It is strongly recommended that you remove every person added to your Home and then invite them back into your home. This will ensure that permissions for all people in your home are downgraded correctly.
* [#2481](https://github.com/homebridge/homebridge/pull/2481) - Platforms will no longer load unless they have been explicitly configured in the `config.json`
* [#2482](https://github.com/homebridge/homebridge/pull/2482) - Dropped support for the `BridgeSetupManager`

If you encounter any issues in v1.0.0 you can rollback to v0.4.53 using this command:

```
sudo npm install -g --unsafe-perm homebridge@0.4.53
```

### Notable Changes

* [#2476](https://github.com/homebridge/homebridge/pull/2476) - Project converted to Typescript by [@Supereg](https://github.com/Supereg)
* Homebridge API version was bumped to `2.5` with the following additions:
    * The signatures of `registerAccessory` and `registerPlatform` have been adjusted. The plugin name, which was passed as the first argument, can now be left out and will be determined automatically by homebridge.
    * The `PlatformAccessory` class received a new method `configureController` which can be used to access the new Controller API (used for Apple TV Remotes and Cameras) introduced with HAP-NodeJS 0.6.0
    * Cameras can now be added to the bridge using a `DynamicPlatformPlugin` and the methods `configureCameraSource` or `configureController` of the `PlatformAccessory` (removing the need to create an external accessory)
    * The hidden service and primary service properties are now properly restored for cached accessories
* [#2391](https://github.com/homebridge/homebridge/pull/2391) - [HAP-NodeJS](https://github.com/homebridge/HAP-NodeJS) 
updated to 0.6.0 with some changes highlighted here:
    * HAP-NodeJS was converted to Typescript as well (thanks to [@hassankhan](https://github.com/hassankhan))
    * Support for exposing Cameras through a Bridge was added
    * Support for Apple TV Remotes (with and without Siri Voice transmission) using the new RemoteController API
    * Introduction of the new CameraController API which improves on the existing API and opens the way for a possible future introduction of an API for HomeKit Secure Video
    * Introduced new APIs to mark a service as primary service
    * Added new characteristic property `adminOnlyAccess` to limit certain access rights to the home-owner
    * Added new services and characteristics for:
        * HomeKit Routers (`WiFiRouter` and `WiFiSatellite` services)
        * HomeKit Secure Video (`CameraOperatingMode` and `CameraEventRecordingManagement` services)
        * `AccessControl` service
        * `SmartSpeaker` service
        * `PowerManagement` service
        * `TransferTransportManagement` service
    * Updated to HAP Protocol Version 1.1.0:
        * Support of the HomeKit Data Stream (HDS) protocol (used by Remotes and Secure Video)
        * Support for Timed Writes and Write Responses
    * Fixed a bug in the encryption layer, which would sometimes encrypt events in the wrong order causing corrupted responses. 
        This issue typically affected service which expose their state using 'target' characteristics 
        and 'current' characteristics like Doors, Locks and Windows.
    * Improved HAP specification compatibility, while noting the following changes affecting compatibility:
        * For `/characteristics` `PUT` request the HAP server will return `204 No Content` if all characteristic writes succeeded and `207 Multi-Status` if at least one write failed or when a write-response is delivered.
        * For `/characteristics` `GET` request the HAP server will return `200 Success` if all characteristic reads  succeeded and `207 Multi-Status` if at least one write failed. 
        * The HAP server will now return short UUIDs for Apple predefined services and characteristics for the `/accessories` route.
    * Many, many more bug fixes and improvements.

### Other Changes

* Homebridge now exports TypeScript types that can be used in the development of plugins.
    * See the [homebridge-examples](https://github.com/homebridge/homebridge-examples) repo for examples of how to do this.
    * We also have create a [plugin template](https://github.com/homebridge/homebridge-plugin-template) you can use as a base for your own plugins.

## v0.4.53 (2020-03-18)

### Notable Changes

* Added the ability to use [scoped npm](https://docs.npmjs.com/using-npm/scope.html) modules as Homebridge plugins. This means plugin developers can now publish Homebridge plugins to npm under their own user or npm organisation, such as `@username/homebridge-plugin`.
