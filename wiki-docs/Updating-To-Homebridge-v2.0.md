## For Users

#### Testing

To write...

#### Plugins

- *What would happen if I update to Homebridge v2 and run a plugin that needs updating?*
  - If you run the plugin in a child bridge, Homebridge will still load correctly. The plugin's child bridge process would likely continually restart as the error is created each time the plugin tries to load.
  - If you are not running the plugin in a child bridge, then the Homebridge process will likely continually crash and restart.
  - Note that in either case, the Homebridge UI would still be fully accessible to disable specific plugins if needed.
- *Will plugins updated for Homebridge v2 still work with Homebridge v1?*
  - Yes.
- *Do all plugins need to be updated for Homebridge v2?*
  - No, most plugins probably won't need any changes and will work properly. Just some plugins that make use of old functions will need updating.
  - A non-exhaustive list of plugins that need updating can be seen below:
    | Plugin | Problematic Versions | Fixed Versions | Open Issue | PR for Fix |
    | - | :-: | :-: | :-: | :-: |
    | [homebridge-BOMgovau](https://github.com/SteveCohen/homebridge-BOMgovau) | `<=0.1.6` | | [#14](https://github.com/SteveCohen/homebridge-BOMgovau/issues/14) | |
    | [homebridge-broadlink-rm](https://github.com/kiwi-cam/homebridge-broadlink-rm) | `<=4.4.17` | `4.4.18-beta.0` | [#722](https://github.com/kiwi-cam/homebridge-broadlink-rm/issues/722) | |
    | [homebridge-cmd4](https://github.com/ztalbot2000/homebridge-cmd4) | `<=7.1.0` | | [#146](https://github.com/ztalbot2000/homebridge-cmd4/issues/146) | |
    | [homebridge-cmdswitch2-no-logs](https://github.com/joepool/homebridge-cmdswitch2-no-logs) | `<=0.3.6` | `0.4.0` | | |
    | [homebridge-homekit-control](https://github.com/minamoanes/homebridge-homekit-control) | `<=0.2.6` | | | [#24](https://github.com/minamoanes/homebridge-homekit-control/pull/24) |
    | [homebridge-nest](https://github.com/chrisjshull/homebridge-nest) | `<=4.6.9` | `4.6.10-beta.0` | | [#663](https://github.com/chrisjshull/homebridge-nest/pull/663) |
    | [homebridge-webos-tv](https://github.com/merdok/homebridge-webos-tv) | `<=2.4.4` | | [#537](https://github.com/merdok/homebridge-webos-tv/issues/537) | |
    | [homebridge-xiaomi-roborock-vacuum](https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum) | `<=0.31.1` | | [#958](https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum/issues/958) | |

#### Changes to Default Advertiser

- With Homebridge v2, `avahi` is now the default `MDNSAdvertiser` if available; otherwise, `ciao` will be used. If you experience any issues with `no response` devices, you can set your default advertiser back to `Bonjour HAP` in the Homebridge UI → Settings → mDNS Advertiser.
  - If you have already set a specific mDNS advertiser, this will continue to be used.
  - If you do not already have a specific mDNS advertiser set and wish to continue using Bonjour HAP, then you should use the Homebridge settings to choose this option **before** you update to Homebridge v2.

## For Plugin Developers

### `HAP-NodeJS v1`

You may need to change your plugins because of the **breaking changes** in HAP-NodeJS v1.

To see the complete set of changes between `v0.12.3` and `v1.0.0`, see the [version file differences](https://github.com/homebridge/HAP-NodeJS/compare/v0.12.2...v1.0.0).

- Common long-deprecated code patterns that may need updating:
  - `BatteryService` has been removed in favour of `Battery`
  - Use of enums off the `Characteristic` class is no longer supported:
    - Instead of `const Units = Characteristic.Units;` you will need to use `const Units = api.hap.Units;`
    - Instead of `const Formats = Characteristic.Formats;` you will need to use `const Formats = api.hap.Formats;`
    - Instead of `const Perms = Characteristic.Perms;` you will need to use `const Perms = api.hap.Perms;`
  - `Characteristic.getValue()` has been removed in favour of `Characteristic.value`
  - `Accessory.getServiceByUUIDAndSubType()` has been removed: you can swap this for `Accessory.getServiceById()`
  - `Accessory.updateReachability()` has been removed: reachability in general is no longer supported
  - `Accessory.setPrimaryService(Service)` has been removed: use `Service.setPrimaryService()` instead
  - Remove the long-deprecated init().
  - Deprecate Core, BridgedCore and legacy Camera characteristics
    - For deprecated Core and BridgedCore see: https://github.com/homebridge/HAP-NodeJS/wiki/Deprecation-of-Core-and-BridgeCore
  - For deprecated `storagePath` switch to `HAPStorage.setCustomStoragePath`
  - For `AudioCodec` switch to AudioStreamingCodec
  - For `VideoCodec` switch to H264CodecParameters
  - For `StreamAudioParams` switch to AudioStreamingOptions
  - For `StreamVideoParams` switch to VideoStreamingOptions
  - For `cameraSource` switch to `CameraController`
  - Other deprecated code to highlight removed: `useLegacyAdvertiser`, `AccessoryLoader`
  - For Fix: Naming for `Characteristic.ProgramMode` has been corrected from `PROGRAM_SCHEDULED_MANUAL_MODE_` to `PROGRAM_SCHEDULED_MANUAL_MODE`


### `Homebridge v2`

You may need to change your plugins because of the **breaking changes** in Homebridge v2.

Homebridge 2.0 is still in beta. To see the current changes between `v1.8.3` and `v2.0.0`, see the [version file differences](https://github.com/homebridge/homebridge/compare/latest...beta-2.0.0).

Once you have tested your plugin(s) function correctly on Homebridge v2, you can update your `package.json`'s `engines.homebridge` value to show that your plugin is ready.

```json
  "engines": {
    "homebridge": "^1.6.0 || ^2.0.0-beta.0",
    "node": "^18.20.4 || ^20.15.1 || ^22"
  },
```

Users will see a green tick in the readiness check in the UI once they have installed a version of your plugin with this in the `engines`.

Once Homebridge v2 has been released, you can remove the `-beta.0` from the `homebridge` versions.