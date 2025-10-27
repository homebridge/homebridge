This feature is only available in Homebridge v1.3.0 or later.

## Overview

This feature allows any Homebridge platform or accessory to run as its own independent bridge, separate from the main bridge, and in an isolated process. There are several reasons/benefits of doing this:

* Isolate plugin code from the main bridge - in this mode, the plugin will run in its own child process, preventing it from ever crashing the main bridge if a fatal exception occurs. 
  * If the plugin process crashes, Homebridge will automatically restart it without impacting the main bridge or other plugins.
* The plugin is protected from dependency pollution caused by other plugins (which rarely happens).
* Isolate slow plugins, preventing them from slowing down the main bridge or other plugins - HomeKit requests the status of all the accessories on a single bridge when the Home app is opened. As a result, the response time is only as fast as your slowest plugin. Loading your accessory/platform as a separate bridge will allow HomeKit to make concurrent requests.
* Easily work around the 149 accessory limitation of a bridge without having to run multiple instances.
* Run multiple instances of platform-based plugins (for example, connecting two different Ring accounts using the `homebridge-ring` plugin).
* Prevent static platform plugins from blocking the main bridge or other plugins while it initialises (for example, `homebridge-hue` while it is trying to discover the Hue/Deconz bridge) 
* Gain all the benefits of running multiple instances of Homebridge without the management overhead.

This will work with all existing plugins without requiring any code changes. 

## Setup

You can use the Homebridge UI to enable this feature by selecting the 'Child Bridge Config' (or `Set Up Child Bridge`) option from any plugin:

<p align="center">
  <img src="https://github.com/user-attachments/assets/c8cfb251-2661-40e6-a5ef-0a747467b6d5">
</p>

If you don't use the Homebridge UI, you can also manually add the required config to each platform/accessory config block you want to be exposed as a separate bridge:

> Make sure the username and port are unique - they must not be the same as the main bridge or another child bridge!

```json5
"_bridge": {
    "username": "0E:83:FD:29:58:C9", // make sure this is unique
    "port": 55197                    // make sure this is unique
}
```

Example:

```json5
"accessories": [
  {
    "accessory": "DummySwitch"
    "name": "dummy switch one",
    "_bridge": {
      "username": "0E:83:FD:29:58:C9", // make sure this is unique
      "port": 55197                    // make sure this is unique
     }
   },
   {
     "accessory": "DummySwitch",
     "name": "dummy switch two",
     "_bridge": {
        "username": "0E:83:DD:27:58:C9", // make sure this is unique
        "port": 55198                    // make sure this is unique
     }
  }
]
```

You can also optionally set the following:

* `port` - recommended - defaults to a random unused port
* `pin` - optional - defaults to the same as the main bridge
* `name` - optional - defaults to accessory/platform name
* `model` - optional - defaults to same as the main bridge
* `manufacturer` - optional - defaults to same as main bridge
* `setupID` - optional - default to randomly generated unique setup id

After restarting Homebridge, you must pair the child bridge separately to HomeKit. You can do this either by scanning the QR code shown for the plugin in the Homebridge UI or manually:

1. Open the Home App
2. `Add Accessory`
3. `I Don't have a Code or Cannot Scan`
4. Select platform/accessory
5. Enter PIN (default same as main bridge)

## Multiple accessories on the same child bridge

With Homebridge v1.3.2 you can assign multiple accessories of the same type and same plugin to a single child bridge.

* Only `accessory` plugins can have multiple accessories on the same child bridge.
* You cannot have multiple `platforms` on a single child bridge. 
* All accessories on a single child bridge must be from the same plugin and use the same alias.

There is no UI for this, to enable this functionality you will need to edit the config.json manually and set the `_bridge.username` for each accessory you want on the same bridge to be the same value. The bridge settings, such as port and name will be set from the first child bridge in the list for that username.

Example:

```json5
// This example show how to have multiple accessories (of the same type) on a single child bridge
// See the example above for a standard child bridge setup
"accessories": [
  {
    "accessory": "DummySwitch"
    "name": "dummy switch one",
    "_bridge": {
      "username": "0E:83:FD:29:58:C9",
      "port": 55197
     }
   },
   {
     "accessory": "DummySwitch",
     "name": "dummy switch two",
     "_bridge": {
        "username": "0E:83:FD:29:58:C9", // set to same value as other child bridge
     }
  }
]
```

## Homebridge UI Integration

The Homebridge UI provides users a simple way to toggle this feature on or off per platform/accessory (generating a unique username, etc.). 

It also displays a QR code and the current paired status of each bridge.

<p align="center">
<img alt="homebridge child bridge pairing" src="https://github.com/user-attachments/assets/7537049d-9bf0-4ab3-924e-6f0cd6011bd0" width="600px">
</p>

### `hb-service` Features

When running Homebridge with `hb-service`, the following features are available:

* You can restart individual platforms/accessories
* You can add an optional child bridge status widget to the Homebridge UI dashboard (click the add widget button). This will show the current status of each child bridge and allow restarting them from the dashboard.

<p align="center">
<img alt="homebridge child bridge widget" src="https://github.com/homebridge/homebridge/assets/43026681/a909712b-c13c-4105-96fd-fb147f0a4019">
</p>

## System Resource Usage

Each child bridge spawns its own Node.js process. This takes a certain amount of system RAM (usually 20-30 MB) and CPU resources. You should keep track of the available resources on your system before spawning too many child bridges.

Using the "Ciao" [mDNS Advertiser](https://github.com/homebridge/homebridge/wiki/mDNS-Options) will reduce CPU usage significantly.
