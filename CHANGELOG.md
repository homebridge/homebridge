# Change Log

All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/).

## NEXT

**Important notice:** The update to the underlying HAP-NodeJS library brings many fixes to the HomeKit Accessory Protocol. 
One of those is the permission management of people you may have added to your Home. It is strongly recommended that 
you remove every person added to your Home and then invite them back into your home.
This will ensure that permissions for all people in your home are downgraded correctly.

### Breaking Changes

* [#2481](https://github.com/homebridge/homebridge/pull/2481) - Platforms will no longer load unless they have been explicitly configured in the `config.json`
* [#2482](https://github.com/homebridge/homebridge/pull/2482) - Dropped support for the `BridgeSetupManager`

### Notable Changes

* [#2476](https://github.com/homebridge/homebridge/pull/2476) - Project converted to Typescript by [@Supereg](https://github.com/Supereg)
* Homebridge API version was bumped to `2.5` with the following additions:
    * The signatures of `registerAccessory` and `registerPlatform` have been adjusted. The plugin name, which was passed
    as the first argument, can now be left out and will be determined automatically by homebridge.
    * The `PlatformAccessory` class received a new method `configureController` which can be used to access the new 
    Controller API (used for Apple TV Remotes and Cameras) introduced with HAP-NodeJS 0.6.0
    * Cameras can now be added to the bridge using a `DynamicPlatformPlugin` and the methods `configureCameraSource` or 
    `configureController` of the `PlatformAccessory` (removing the need to create an external accessory)
    * The hidden service and primary service properties are now properly restored for cached accessories
* [#2391](https://github.com/homebridge/homebridge/pull/2391) - [HAP-NodeJS](https://github.com/homebridge/HAP-NodeJS) 
updated to 0.6.0 with some changes highlighted here:
    * HAP-NodeJS was converted to Typescript as well (thanks to [@hassankhan](https://github.com/hassankhan))
    * Support for exposing Cameras through a Bridge was added
    * Support for Apple TV Remotes (with and without Siri Voice transmission) using the new RemoteController API
    * Introduction of the new CameraController API which improves on the existing API and opens the way for a possible 
    future introduction of an API for HomeKit Secure Video
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
        * For `/characteristics` `PUT` request the HAP server will return `204 No Content` if all characteristic writes
        succeeded and `207 Multi-Status` if at least one write failed or when a write-response is delivered.
        * For `/characteristics` `GET` request the HAP server will return `200 Success` if all characteristic reads
        succeeded and `207 Multi-Status` if at least one write failed. 
        * The HAP server will now return short UUIDs for Apple predefined services and characteristics for the `/accessories` route.
    * Many, many more bug fixes and improvements.

### Other Changes

