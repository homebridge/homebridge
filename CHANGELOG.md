# Change Log

All notable changes to homebridge will be documented in this file.

## BETA

### Changed

- Allow for FirmwareRevision override in config
- Add GitHub labeler action
- Improve `README` installation docs
- Updated dependencies
- updated Discord Webhooks so notifications are seperated for `release` and `pre-release`

## v1.7.0 (2023-11-04)

*Reminder: Node.js v18.15.0 or later is **required** to run Homebridge.*

### Other Changes

- Update dependencies by @bwp91 in https://github.com/homebridge/homebridge/pull/3459 and https://github.com/homebridge/homebridge/pull/3460

## v1.6.1 (2023-04-30)

### Bug Fixes 🐛

- Fixed an issue with the `avahi` advertiser on Synology that resulted in homebridge not starting by @Supereg in https://github.com/homebridge/HAP-NodeJS/pull/1003
- Resolved an issue where developers weren't able to compile strict TypeScript projects against Homebridge

## v1.6.0 (2022-11-26)

### What's Changed

- Updated `hap-nodejs` to [v0.11.0](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.11.0) adding support for `systemd-resolved` mDNS advertisers and improved support for systems running avahi mDNS advertiser. The release also contains general bug fixes and improvements.
- Support resolved mDNS advertiser by @elyscape in https://github.com/homebridge/homebridge/pull/3260
- Update to provide compatibility with hap-nodejs 0.11.0 by @Supereg in https://github.com/homebridge/homebridge/pull/3263

### New Contributors

- @elyscape made their first contribution in https://github.com/homebridge/homebridge/pull/3260

## v1.5.1 (2022-10-25)

### Changes

- Upgrade hap-nodejs to [v0.10.4](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.10.4) containing minor bug fixes by @Supereg (https://github.com/homebridge/homebridge/commit/968ae0c501ed3fcafbaaef945b13e9d5dbef2c95)
- suppress warning generated from running npm -g prefix by @oznu (https://github.com/homebridge/homebridge/commit/2aa6fad3345f5bcfa2fc128f5d9ac110ec52ecfd)

## v1.5.0 (2022-06-22)

### Featured Changes

- Add support for stopping / starting a child bridge via the Homebridge UI @oznu [#3139](https://github.com/homebridge/homebridge/pull/3139)

### Other Changes

- Add support for package.json exports field @ShogunPanda [#3016](https://github.com/homebridge/homebridge/pull/3016), [#3165](https://github.com/homebridge/homebridge/pull/3165)

## v1.4.1 (2022-04-29)

### Featured Changes

- Upgraded HAP-NodeJS to [v0.10.2](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.10.2)
    - Fix an issue with network interface family detection when running Node.js 18 @oznu [#947](https://github.com/homebridge/HAP-NodeJS/pull/947)
    - Fixed memory leak with HomeKit DataStreams @Supereg [#943](https://github.com/homebridge/HAP-NodeJS/pull/943)
- Strict plugin resolution option added to Homebridge plugin @oznu [#3117](https://github.com/homebridge/homebridge/pull/3117) 
- Replace https://git.io URLs as the service is [being depreciated](https://github.blog/changelog/2022-04-25-git-io-deprecation/)

### Bug Fixes

This release upgrades various dependencies with bug fixes and security fixes.

## v1.4.0 (2022-01-22)

### Featured Changes

- HomeKit Secure Video @Supereg [#3056](https://github.com/homebridge/homebridge/pull/3056)
- New advertiser: Avahi/D-Bus API @adriancable

### Bug Fixes

- Fix ES Module loading with absolute path @seydx [#3070](https://github.com/homebridge/homebridge/pull/3070) 
- Fix casing of generated inline docs @Supereg [#3066](https://github.com/homebridge/homebridge/pull/3066)

## 1.3.9 (2021-12-29)

### Bug Fixes

- Fixed a crash occurring for any encrypted communication when running Node.js 17 on linux based machines [#3046](https://github.com/homebridge/homebridge/issues/3046)


## 1.3.8 (2021-10-22)

### Featured Changes

- PluginManager would abort plugin loading if one plugin encounters a loading error  [#3017](https://github.com/homebridge/homebridge/issues/3017)

### Other Changes

- Move to centrally managed Issue form templates and GitHub Action workflows [#3011](https://github.com/homebridge/homebridge/issues/3011)


## 1.3.6 (2021-11-10)

### Notable changes

- Added support for ESM modules and async plugin initializers [#2915](https://github.com/homebridge/homebridge/issues/2915)
- Upgraded HAP-NodeJS to [v0.9.7](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.9.7) providing bug fixes  [#3008](https://github.com/homebridge/homebridge/issues/3008)

## v1.3.5 (2021-10-08)

### Notable changes

This version adds new services and characteristics introduced with iOS 15.

- `AccessCode` and `NFCAccess` services and corresponding characteristics.
- Services related to the support of Siri enabled HomeKit devices:
    - The following services were newly added: `Assistant`, `SiriEndpoint`
    - The following services received new optional characteristics: `Siri` and `SmartSpeaker`

### Bug Fixes

This release upgrades various dependencies with bug fixes and security fixes.

This includes the `dns-packet` security vulnerability referenced under [CVE-2021-23386](https://github.com/advisories/GHSA-3wcq-x3mq-6r9p).
Only users who use the `bonjour` mdns advertiser are impacted by this vulnerability.

## v1.3.4 (2021-03-16)

### Bug Fixes

- Fixed a characteristic warning for Cameras or Video Doorbells, which might be emitted on startup under certain conditions.  
   _This warning had no impact on the functionality of Cameras_.

## v1.3.3 (2021-03-10)

### Bug Fixes

- [#2855](https://github.com/homebridge/homebridge/issues/2855) - Fixed an issue to handle the situation where Siri or a Home Hub sends unexpected values for the characteristic format type. This should fix the situations where accessories could be controlled from the Home app, but not via Siri and/or automations.

### Other Changes

- [#2856](https://github.com/homebridge/homebridge/issues/2856) - Gracefully handle duplicate UUID errors when restoring the accessory cache.
- Update [HAP-NodeJS](https://github.com/homebridge/HAP-NodeJS) to [v0.9.3](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.9.3).

## v1.3.2 (2021-03-04)

Please make sure you have done the following before updating:

- Read the full [release notes for v1.3.0](https://github.com/homebridge/homebridge/releases/tag/v1.3.0) if you have not already done so.

### Notable Changes

- [#2849](https://github.com/homebridge/homebridge/issues/2849) - Added the ability for more than one accessory of the same type to be added to a single child bridge. [See docs for more info](https://github.com/homebridge/homebridge/wiki/Child-Bridges#multiple-accessories-on-the-same-child-bridge).

### Other Changes

- Warnings about "slow" plugin characteristics will no longer be shown for external / unbridged accessories (typically Cameras or TVs) as these do not slow down the entire bridge.

## v1.3.1 (2021-02-23)

Please make sure you have done the following before updating:

- Read the full [release notes for v1.3.0](https://github.com/homebridge/homebridge/releases/tag/v1.3.0) if you have not already done so.
- Updated all existing plugins to their latest version.
- Create a [backup](https://github.com/homebridge/homebridge/wiki/Backup-and-Restore) of your Homebridge instance.
- Review the [mDNS Options](https://github.com/homebridge/homebridge/wiki/mDNS-Options) that you may need to adjust after updating to Homebridge v1.3.x.

### Notable Changes

- [#2820](https://github.com/homebridge/homebridge/issues/2820) - Automatically correct bad characteristic values provided by plugins in more cases, this should fix the vast majority of problems users were facing after upgrading to v1.3.0.
- [#2820](https://github.com/homebridge/homebridge/issues/2820) - Fix an issue where a child bridge would not load if another non-child-bridge plugin created a [circular reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value) on the plugin's config object at runtime.
- [#2799](https://github.com/homebridge/homebridge/issues/2799) - The [Current Temperature](https://developers.homebridge.io/#/characteristic/CurrentTemperature) characteristic now has a default minimum value of `-273.15` down from `0`.
- Characteristic warning messaging improvements.
- Update [HAP-NodeJS](https://github.com/homebridge/HAP-NodeJS) to [v0.9.2](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.9.2).

## v1.3.0 (2021-02-20)

### Pre-Update Checklist

Please make sure you have done the following before updating:

- Updated all existing plugins to their latest version.
- Create a [backup](https://github.com/homebridge/homebridge/wiki/Backup-and-Restore) of your Homebridge instance.
- Review the [mDNS Options](https://github.com/homebridge/homebridge/wiki/mDNS-Options) that you may need to adjust after updating to Homebridge v1.3.0.

### Adaptive Lighting

The new Adaptive Lightning feature introduced with iOS 14 can now be used by plugin developers. Most of the actively maintained plugins already secretly added support for it.

### Child Bridges

Child bridges allow any Homebridge platform or accessory to optionally run as its own independent accessory, separate from the main bridge, and in an isolated process. Running certain accessories in a child bridge can improve the general responsiveness and reliability of Homebridge.

Why you might run a child bridge:

- To isolate plugin code from the main bridge - in this mode the plugin will run in its own child process, preventing it from ever crashing the main bridge if a fatal exception occurs.
    - If the child bridge process does crash, Homebridge will automatically restart it, without impacting the main bridge or other plugins.
- To isolate slow plugins, preventing them from slowing down the main bridge or other plugins.
- To gain the ability to restart individual accessories after a config change or plugin update without having to restart the main bridge or other plugins. 
- To gain all the benefits of running multiple instances of Homebridge without the management overhead.

Child bridge support is available for all existing plugins. You can enable it via the Homebridge UI on an accessory/platform basis from the "Bridge Settings" menu item:

<p align="center">
<img src="https://user-images.githubusercontent.com/3979615/108302130-73e23f00-71f7-11eb-9b1a-5caa4465c532.png" width="600px">
</p>

Learn more about child bridges here: https://github.com/homebridge/homebridge/wiki/Child-Bridges

### mDNS Advertiser Selection

Homebridge v1.3.0 ships with two different Bonjour/mDNS advertisers which users can choose from, `Ciao` and `Bonjour HAP`.

- Homebridge v1.1.x shipped with `Bonjour HAP`
- Homebridge v1.2.x shipped with `Ciao`

The default for new users will be `Bonjour HAP`, you can swap between the two from the "Homebridge Settings" screen in the Homebridge UI:

<p align="center">
<img src="https://user-images.githubusercontent.com/3979615/108302458-21555280-71f8-11eb-8273-0e604ded60eb.png" width="600px">
</p>

See https://github.com/homebridge/homebridge/wiki/mDNS-Options for more information.

### Breaking Changes

The `"mdns"."interface"` option has been removed, please use `"bridge"."bind"` instead. This new option takes an array of interface names or IP addresses. You can also configure this option using the "Network Interfaces" option under the Homebridge Settings section of the UI.

See https://github.com/homebridge/homebridge/wiki/mDNS-Options for more information.

### Other Notable Changes

- Added the ability to disable individual plugins without having to remove their config from the `config.json` file.
- Homebridge will no longer crash if a plugin cannot be found for a certain accessory / platform config block.
- Improved stability with malfunctioning plugins or plugins which read/write handlers take too long to respond. You may have been there, where you whole Homebridge instance went down only because one plugin or accessory didn't behave properly. We have invested some time to reduce the possibility of such scenarios; or at least give hints where we can reliably detect that something gone wrong.
- Plugin characteristics are now strictly validated, if an invalid value is passed in the bridge will now force it to a known good value and show a warning in the logs, this should prevent some of the "Not Responding" issues users have faced in the past.

### Changes For Developers

- Added the ability to use promise-based characteristic getters and setters. Have a look at [characteristic.onGet](https://developers.homebridge.io/HAP-NodeJS/classes/characteristic.html#onget) and [characteristic.onSet](https://developers.homebridge.io/HAP-NodeJS/classes/characteristic.html#onset).
- Added support for Characteristics with Additional Authorization, by using [characteristic.setupAdditionalAuthorization](https://developers.homebridge.io/HAP-NodeJS/classes/characteristic.html#setupadditionalauthorization).
- For a more detailed list, have a look at the release notes of `HAP-NodeJS` [v0.9.0](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.9.0).
- Added an [API.versionGreaterOrEqual](https://developers.homebridge.io/homebridge/interfaces/api.html#versiongreaterorequal)
call to the homebridge API object.  
  This will from now on replace the float based API `version` number property.

### Compatibility

Homebridge v1.3.0 does not introduce breaking changes for the majority of existing plugins, while you may see [Characteristic Warnings](https://github.com/homebridge/homebridge/wiki/Characteristic-Warnings) in the logs, these are just issues that were already present prior to v1.3.0 - just hidden from view. You should update your plugins before updating Homebridge.

A large number of plugins have been tested during an extensive beta period, the results can be [viewed here](https://github.com/homebridge/homebridge/wiki/Homebridge-1.3.0-Release-Plugin-Testing-Status).

### Rolling Back

If for any reason Homebridge v1.3.0 is not working for you, you can roll back to a previous version of Homebridge easily using the Homebridge UI.

See https://github.com/homebridge/homebridge/wiki/How-To-Change-Homebridge-Version for more information.

<p align="center">
<img src="https://user-images.githubusercontent.com/64748380/102620583-d473d380-4103-11eb-827b-276a13503424.gif" width="600px">
</p>

## v1.2.5 (2020-12-28)

### Bug Fixes

- Updated HAP-NodeJS to [v0.8.5](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.8.5) incorporating fixes made to the `ciao` mDNS library.  
  Refer to the release notes of HAP-NodeJS for more technical details.

## v1.2.4 (2020-12-05)

### Bug Fixes

- Updated the mdns library `ciao` to [v1.1.0](https://github.com/homebridge/ciao/releases/tag/v1.1.0) introducing further stability improvements.

## v1.2.3 (2020-09-21)

### Bug Fixes

- Updated the mdns library `ciao` to the latest version
    - Includes general bug fixes and stability improvements
    - Improved compatibility with machines running avahi
    - Fixed handling of updated ip addresses
    - Fixes for Darwin system running in a VM

## v1.2.2 (2020-09-16)

### Bug Fixes

- Added a warning when a plugin takes too long to load and prevents homebridge from starting.
- Update hap-nodejs to v0.8.2 resolving some advertising issues on some uncommon platforms

#### For Developers

- Updated the typing of the accessory context to be any again to allow less strict typing. Though we encourage you to write your own Type Definition for better type safety!

## v1.2.1 (2020-09-15)

### Bug Fixes

- Fixed a bug related to mdns discovery where on some machines (FreeBSD and some containerized installs) the accessory is not correctly advertised on the local network

## v1.2.0 (2020-09-14)

### Notable Changes

- Updated [HAP-Nodejs](https://github.com/homebridge/HAP-NodeJS) to v0.8.0 (see [HAP-NodeJS release notes](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.8.0)).  
This includes the rewritten bonjour/mdns library `ciao`, which improves Accessory discovery on the local network ([#2619](https://github.com/homebridge/homebridge/issues/2619)).
- Add ability to type an accessory context using generics ([2664](https://github.com/homebridge/homebridge/pull/2664))

## v1.1.6 (2020-09-07)

### Bug Fixes

- Fixed an incompatibility introduced in v1.1.3 with the `commander ` library

## v1.1.3 (2020-09-03)

### Bug Fixes

- Updated [HAP-Nodejs](https://github.com/homebridge/HAP-NodeJS) to v0.7.9 (see [HAP-NodeJS release notes](https://github.com/homebridge/HAP-NodeJS/releases)):
  - IP addresses for camera streaming endpoints are automatically and more reliably set
  - Added latest changes made to iOS 14 beta 4 and 5

## v1.1.2 (2020-08-12)

### Bug Fixes

- [#2646](https://github.com/homebridge/homebridge/pull/2646) - Fixed an issue with scoped plugin registration / cached accessory restoration.

## v1.1.1 (2020-06-17)

### Bug Fixes

- Updated [HAP-Nodejs](https://github.com/homebridge/HAP-NodeJS) to v0.7.4 (see [v0.7.4 release notes](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.7.4))

## v1.1.0 (2020-05-17)

*Reminder: Node.js v10.17.0 or later is **required** to run Homebridge.*

### Notable Changes

- Bumped API version to `2.6` with the following changes:
    - AccessoryPlugins and Accessory objects returned by StaticPlatformPlugins can now define the optional 
        `getControllers` method to configure controllers like the RemoteController or CameraController
- Updated [HAP-Nodejs](https://github.com/homebridge/HAP-NodeJS) to v0.7.3.
    - Moved to the built-in Node.js crypto library for *chacha20-poly1305- encryption and decryption. This gives a 10x performance boost when doing crypto.
    - All debuggers are now prefixed with the library name, `HAP-NodeJS:`.
    - [v0.7.0 Release Notes](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.7.0)
    - [v0.7.1 Release Notes](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.7.1)
    - [v0.7.2 Release Notes](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.7.2)
    - [v0.7.3 Release Notes](https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.7.3)

### Bug Fixes

- [#2551](https://github.com/homebridge/homebridge/issues/2551) Fixed a breaking change to the `identify` event on PlatformAccessory.

### For Developers

**Plugins Using TypeScript:** Homebridge now only exports *types* that are safe to use in your code and won't result in the `homebridge` library being a runtime dependency. If you have been using types correctly then you will not be impacted by this change.

## v1.0.4 (2020-04-30)

### Bug Fixes

- Fixed a crash that could occur if a plugin called `updateReachability` before the accessory was added to the bridge (https://github.com/devbobo/homebridge-arlo/issues/40#issuecomment-620928214)
- Fixed a crash that could occur while pairing when running plugins (like homebridge-nest) which register a AccessoryInformation service that already has added an Identify listener of HAP-NodeJS (https://github.com/homebridge/homebridge/issues/2548)
- Fixed mdns advertising to include all (and only) reachable addresses for the given machine

## v1.0.3 (2020-04-29)

- Some users were seemingly unable to pair new homebridge instances or encountered "no response" for all of their accessories if plugins chose to supply an empty serial number for their accessory information. This is now resolved.
- Added a check that plugins can't expose an accessory with an empty set of services (which would also cause HomeKit reject the accessory)

## v1.0.2 (2020-04-28)

### Bug Fixes

- [#2527](https://github.com/homebridge/homebridge/pull/2527) Improve cached accessory resolution.
- [#2528](https://github.com/homebridge/homebridge/pull/2528) Removing orphaned cached accessories is now the default behavior.
    - The `-R` flag was deprecated. A new `-K`/`--keep-orphans` flag was introduced to disable this behavior.

## v1.0.1 (2020-04-27)

### Notable Changes

- [#2522](https://github.com/homebridge/homebridge/pull/2522) Allow plugins that have strict Homebridge version requirements to still load, instead an error message will be posted in the Homebridge logs letting users know they may face issues using the current version of the plugin.

## v1.0.0 (2020-04-27)

### Breaking Changes

- **The minimum Node.js version required is now `v10.17.0`.**
- **Important notice:** The update to the underlying HAP-NodeJS library brings many fixes to the HomeKit Accessory Protocol. One of those is the permission management of people you may have added to your Home. It is strongly recommended that you remove every person added to your Home and then invite them back into your home. This will ensure that permissions for all people in your home are downgraded correctly.
- [#2481](https://github.com/homebridge/homebridge/pull/2481) - Platforms will no longer load unless they have been explicitly configured in the `config.json`
- [#2482](https://github.com/homebridge/homebridge/pull/2482) - Dropped support for the `BridgeSetupManager`

If you encounter any issues in v1.0.0 you can roll back to v0.4.53 using this command:

```
sudo npm install -g --unsafe-perm homebridge@0.4.53
```

### Notable Changes

- [#2476](https://github.com/homebridge/homebridge/pull/2476) - Project converted to Typescript by [@Supereg](https://github.com/Supereg)
- Homebridge API version was bumped to `2.5` with the following additions:
    - The signatures of `registerAccessory` and `registerPlatform` have been adjusted. The plugin name, which was passed as the first argument, can now be left out and will be determined automatically by homebridge.
    - The `PlatformAccessory` class received a new method `configureController` which can be used to access the new Controller API (used for Apple TV Remotes and Cameras) introduced with HAP-NodeJS 0.6.0
    - Cameras can now be added to the bridge using a `DynamicPlatformPlugin` and the methods `configureCameraSource` or `configureController` of the `PlatformAccessory` (removing the need to create an external accessory)
    - The hidden service and primary service properties are now properly restored for cached accessories
- [#2391](https://github.com/homebridge/homebridge/pull/2391) - [HAP-NodeJS](https://github.com/homebridge/HAP-NodeJS) 
updated to 0.6.0 with some changes highlighted here:
    - HAP-NodeJS was converted to Typescript as well (thanks to [@hassankhan](https://github.com/hassankhan))
    - Support for exposing Cameras through a Bridge was added
    - Support for Apple TV Remotes (with and without Siri Voice transmission) using the new RemoteController API
    - Introduction of the new CameraController API which improves on the existing API and opens the way for a possible future introduction of an API for HomeKit Secure Video
    - Introduced new APIs to mark a service as primary service
    - Added new characteristic property `adminOnlyAccess` to limit certain access rights to the home-owner
    - Added new services and characteristics for:
        - HomeKit Routers (`WiFiRouter` and `WiFiSatellite` services)
        - HomeKit Secure Video (`CameraOperatingMode` and `CameraEventRecordingManagement` services)
        - `AccessControl` service
        - `SmartSpeaker` service
        - `PowerManagement` service
        - `TransferTransportManagement` service
    - Updated to HAP Protocol Version 1.1.0:
        - Support of the HomeKit Data Stream (HDS) protocol (used by Remotes and Secure Video)
        - Support for Timed Writes and Write Responses
    - Fixed a bug in the encryption layer, which would sometimes encrypt events in the wrong order causing corrupted responses. 
        This issue typically affected service which expose their state using 'target' characteristics 
        and 'current' characteristics like Doors, Locks and Windows.
    - Improved HAP specification compatibility, while noting the following changes affecting compatibility:
        - For `/characteristics` `PUT` request the HAP server will return `204 No Content` if all characteristic writes succeeded and `207 Multi-Status` if at least one write failed or when a write-response is delivered.
        - For `/characteristics` `GET` request the HAP server will return `200 Success` if all characteristic reads  succeeded and `207 Multi-Status` if at least one write failed. 
        - The HAP server will now return short UUIDs for Apple predefined services and characteristics for the `/accessories` route.
    - Many, many more bug fixes and improvements.

### Other Changes

- Homebridge now exports TypeScript types that can be used in the development of plugins.
    - See the [homebridge-examples](https://github.com/homebridge/homebridge-examples) repo for examples of how to do this.
    - We also have created a [plugin template](https://github.com/homebridge/homebridge-plugin-template) you can use as a base for your own plugins.

## v0.4.53 (2020-03-18)

### Notable Changes

- Added the ability to use [scoped npm](https://docs.npmjs.com/using-npm/scope.html) modules as Homebridge plugins. This means plugin developers can now publish Homebridge plugins to npm under their own user or npm organisation, such as `@username/homebridge-plugin`.
