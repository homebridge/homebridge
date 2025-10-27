This page serves to explain some of the HomeKit terminology to the uninitiated.

### Bridge
A bridge is a network component that allows access to and from a set of *accessories* from and to HomeKit. For this project, Homebridge is the only bridge. In HomeKit topology, bridges cannot be bridged, and cannot be cascaded. So Homebridge connects our non-homekit-enabled accessories to the HomeKit world through *plugins*. A bridge can bridge up to 149 accessories.

The [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) allows plugins to be run in their own [child-bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) - in an isolated process. See the link for more info.

### Plugin
A Homebridge Plugin is a set of code that publishes accessories and/or a platform. Plugins are written specifically to interact with third-party devices that have their own unique APIs but are not natively HomeKit compatible.

### Platform
A _platform_ represents a set of accessories. For example, the Nest Platform provides Homebridge access to all the Nest accessories (Nest thermostats & Nest smoke detectors) installed in a home. By configuring the Nest platform in Homebridge, all the Nest accessories will be made available.

### Accessory
An _accessory_ is a hardware device that can be controlled or can provide information. A garage door opener, light, door lock, thermostat, television, etc., are all examples of individual accessories. Accessories can have multiple *services* (99 max), so the garage door opener box might have e.g.: the garage door opener service, a lightbulb service (built-in ceiling light), a battery service (if it runs on batteries and needs to show the charging state), etc.

### Service
A _service_ is a prime HomeKit functionality, such as a lightbulb. Each service can have multiple characteristics, such as `On`, `Brightness` and others for lightbulbs.  
Siri uses the service's name for reference, **not** the accessory name!

For a current list of available HomeKit services, refer to the [Homebridge Developer Docs](https://developers.homebridge.io/).

<!-- Explain how HomeKit/Siri interacts with services -->

### Characteristic

A _characteristic_ is an attribute or property of a service, such as a temperature, on/off state, color, etc.

<!-- Explain how HomeKit/Siri interacts with characteristics -->

### Room

A _room_ is a collection of (physical) *accessories*. The purpose of grouping accessories into a room is so that you can control them all at once. Suppose your living room has three light _accessories_ in it: 

1. Wall Sconces
2. End Table Lamps
3. Recessed Lights

On their own, you would need to tell Siri to turn each individual light off, e.g. "Siri, turn the *Wall Sconces* off", "Siri, turn the *End Table Lamps* off".

However, if you add all three of these accessories to a _room_ called "Living Room", you can then control all of them with a single command: "Siri, turn the Living Room off".

### Zone

A _zone_ is a collection of rooms.

**Example Zone**: _Upstairs_ which contains rooms _Guest Bedroom_, _Guest Bathroom_, _Bonus Room_, _Kids Room_  

In this setup, you can tell Siri to switch off all lights upstairs.

### Scene

A _scene_ is a collection of accessories and their desired states. You could create a scene called "Movie Time" which sets the living room lights to 33% brightness, the TV to on and the stereo to on.

Another scene example could be "Leaving Home" which sets every accessory to off.

### Trigger

A _trigger_ sets scenes at specific times, like when you get to locations or when a characteristic is in a specific state. In other words, a trigger is a set of user-definable conditions and/or events which must be met which results in the automatic execution of a scene.

#### Example:

- Every time you come home from work, you have a routine of turning on specific lights in your house. However, the exact time in which you come home varies, and you really only perform this routine in the winter when the sun is set before you get home from work.
  - A location-based trigger with time conditions could be set up to automate this task. Create a scene called "Welcome Home" which has the desired set of the lights with their "on" levels set, then create a location trigger with the condition of "after sunset".