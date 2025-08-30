# Matter Protocol Support in Homebridge

Homebridge now includes experimental support for the Matter protocol alongside the existing HomeKit HAP support. This allows accessories to be exposed via both protocols simultaneously, making them available to a wider range of smart home ecosystems.

## Overview

Matter is an open-source connectivity standard for smart home devices, allowing devices from different manufacturers to work together seamlessly. With Homebridge's Matter support, plugins can expose accessories to both HomeKit and Matter-compatible controllers such as:

- Apple Home (via HomeKit)
- Google Home (via Matter)
- Amazon Alexa (via Matter) 
- Samsung SmartThings (via Matter)
- Philips Hue Bridge (via Matter)
- And any other Matter-compatible controller

## Configuration

To enable Matter support in Homebridge, add a `matter` section to your `config.json`:

```json
{
  "bridge": {
    "name": "Homebridge",
    "username": "CC:22:3D:E3:CE:30",
    "port": 51826,
    "pin": "031-45-154"
  },
  "matter": {
    "enabled": true,
    "port": 5540,
    "discriminator": 3840,
    "passcode": 20202021,
    "vendorId": 65521,
    "productId": 32769,
    "deviceName": "Homebridge Matter Bridge",
    "deviceType": 22
  },
  "accessories": [],
  "platforms": []
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable or disable Matter support |
| `port` | number | `5540` | UDP port for Matter communication |
| `discriminator` | number | `3840` | Matter discriminator for device discovery |
| `passcode` | number | `20202021` | Pairing passcode for Matter commissioning |
| `vendorId` | number | `65521` | Matter vendor ID |
| `productId` | number | `32769` | Matter product ID |
| `deviceName` | string | `"Homebridge Matter Bridge"` | Device name shown in Matter controllers |
| `deviceType` | number | `22` | Matter device type (22 = Bridge) |

## Plugin Development

Plugin developers can use the new Matter API methods to publish accessories to both HomeKit and Matter:

### API Methods

#### `api.publishMatterAccessories(pluginIdentifier, accessories)`

Publishes an array of accessories to the Matter protocol in addition to HomeKit.

```typescript
// Publish accessories to Matter
this.api.publishMatterAccessories('my-plugin', [accessory1, accessory2]);
```

#### `api.unpublishMatterAccessories(pluginIdentifier, accessories)`

Removes accessories from the Matter protocol.

```typescript
// Unpublish accessories from Matter
this.api.unpublishMatterAccessories('my-plugin', [accessory1, accessory2]);
```

### Matter Device Types and Clusters

Homebridge now provides access to standard Matter device types and clusters through the API, making it easier for plugin developers to create Matter-compatible devices:

```typescript
import { API } from 'homebridge';

export default class MyPlatform {
  constructor(public readonly api: API) {
    // Access Matter device types
    const onOffLight = this.api.matter.deviceTypes.OnOffLight;
    const dimmableLight = this.api.matter.deviceTypes.DimmableLight;
    const temperatureSensor = this.api.matter.deviceTypes.TemperatureSensor;
    
    // Access Matter clusters
    const onOffCluster = this.api.matter.clusters.OnOffCluster;
    const levelControlCluster = this.api.matter.clusters.LevelControlCluster;
    const temperatureMeasurementCluster = this.api.matter.clusters.TemperatureMeasurementCluster;
    
    // Use helper functions for automatic mapping
    const deviceType = this.api.matter.getMatterDeviceTypeForHAPService('Lightbulb', ['Brightness', 'Hue']);
    const clusters = this.api.matter.getMatterClustersForHAPService('Lightbulb', ['Brightness', 'Hue']);
  }
}
```

#### Available Device Types

The following Matter device types are available through `api.matter.deviceTypes`:

**Lighting:**
- `OnOffLight` - Basic on/off light
- `DimmableLight` - Dimmable light with brightness control
- `ColorTemperatureLight` - Light with color temperature adjustment
- `ExtendedColorLight` - Full-color light with hue, saturation, brightness

**Switches:**
- `OnOffLightSwitch` - Basic on/off switch
- `DimmerSwitch` - Dimmer switch with level control
- `ColorDimmerSwitch` - Color dimmer switch
- `GenericSwitch` - Generic programmable switch

**Outlets:**
- `OnOffPlugInUnit` - Smart outlet/plug
- `DimmablePlugInUnit` - Dimmable smart outlet

**Sensors:**
- `TemperatureSensor` - Temperature measurement
- `HumiditySensor` - Humidity measurement  
- `LightSensor` - Illuminance measurement
- `OccupancySensor` - Motion/occupancy detection
- `ContactSensor` - Contact/door sensor
- `PressureSensor` - Pressure measurement
- `FlowSensor` - Flow measurement

**Security:**
- `DoorLock` - Smart door lock
- `DoorLockController` - Door lock controller
- `SmokeCoAlarm` - Smoke and CO alarm
- `WaterLeakDetector` - Water leak sensor
- `WaterFreezeDetector` - Water freeze sensor

**HVAC:**
- `Thermostat` - Temperature control
- `Fan` - Fan with speed control

**Window Coverings:**
- `WindowCovering` - Blinds, shades, curtains
- `WindowCoveringController` - Window covering controller

**Other:**
- `ControlBridge` - Bridge device
- `Speaker` - Audio speaker
- `ModeSelect` - Mode selection device
- `WaterValve` - Water valve control
- `Pump` - Pump device
- `PumpController` - Pump controller

#### Available Clusters

The following Matter clusters are available through `api.matter.clusters`:

**Basic Clusters:**
- `OnOffCluster` - On/off control
- `LevelControlCluster` - Brightness/level control
- `ColorControlCluster` - Color control (hue, saturation, color temperature)
- `IdentifyCluster` - Device identification

**Sensor Clusters:**
- `TemperatureMeasurementCluster` - Temperature measurement
- `RelativeHumidityMeasurementCluster` - Humidity measurement
- `IlluminanceMeasurementCluster` - Light level measurement
- `OccupancySensingCluster` - Motion/occupancy sensing
- `PressureMeasurementCluster` - Pressure measurement
- `FlowMeasurementCluster` - Flow measurement

**Security Clusters:**
- `DoorLockCluster` - Door lock control
- `SmokeCoAlarmCluster` - Smoke and CO alarm
- `BooleanStateCluster` - Boolean state (contact sensors, etc.)

**HVAC Clusters:**
- `ThermostatCluster` - Thermostat control
- `FanControlCluster` - Fan control

**Other Clusters:**
- `WindowCoveringCluster` - Window covering control
- `SwitchCluster` - Switch/button control
- `BasicInformationCluster` - Basic device information
- `BridgedDeviceBasicInformationCluster` - Bridged device information
- `DescriptorCluster` - Device descriptor
- `PowerSourceCluster` - Power source information

#### Helper Functions

Two helper functions are provided to automatically determine the appropriate Matter device types and clusters for HomeKit services:

##### `getMatterDeviceTypeForHAPService(serviceType, characteristics?)`

Returns the appropriate Matter device type for a given HomeKit service:

```typescript
// Basic lightbulb
const deviceType1 = this.api.matter.getMatterDeviceTypeForHAPService('Lightbulb');
// Returns: 'OnOffLight'

// Dimmable lightbulb
const deviceType2 = this.api.matter.getMatterDeviceTypeForHAPService('Lightbulb', ['Brightness']);
// Returns: 'DimmableLight'

// Color lightbulb
const deviceType3 = this.api.matter.getMatterDeviceTypeForHAPService('Lightbulb', ['Brightness', 'Hue', 'Saturation']);
// Returns: 'ExtendedColorLight'

// Temperature sensor
const deviceType4 = this.api.matter.getMatterDeviceTypeForHAPService('TemperatureSensor');
// Returns: 'TemperatureSensor'
```

##### `getMatterClustersForHAPService(serviceType, characteristics?)`

Returns the appropriate Matter clusters for a given HomeKit service:

```typescript
// Basic lightbulb
const clusters1 = this.api.matter.getMatterClustersForHAPService('Lightbulb');
// Returns: ['OnOffCluster', 'IdentifyCluster']

// Dimmable lightbulb  
const clusters2 = this.api.matter.getMatterClustersForHAPService('Lightbulb', ['Brightness']);
// Returns: ['OnOffCluster', 'LevelControlCluster', 'IdentifyCluster']

// Color lightbulb
const clusters3 = this.api.matter.getMatterClustersForHAPService('Lightbulb', ['Brightness', 'Hue']);
// Returns: ['OnOffCluster', 'LevelControlCluster', 'ColorControlCluster', 'IdentifyCluster']
```

#### HAP to Matter Mapping

The API also provides mapping objects that show the relationship between HomeKit services and Matter device types/clusters:

```typescript
// View the HAP to Matter device mapping
console.log(this.api.matter.hapToMatterDeviceMapping);

// View the HAP to Matter cluster mapping
console.log(this.api.matter.hapToMatterClusterMapping);
```

### Example Plugin

Here's a simple example of how to modify an existing plugin to support Matter:

```typescript
import { API, DynamicPlatformPlugin, PlatformAccessory } from 'homebridge';

export default class MyPlatform implements DynamicPlatformPlugin {
  constructor(public readonly api: API) {
    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  discoverDevices() {
    // Create accessory as usual
    const accessory = new this.api.platformAccessory('My Device', uuid);
    
    // Register with HomeKit (existing functionality)
    this.api.registerPlatformAccessories('my-plugin', 'MyPlatform', [accessory]);
    
    // Also publish to Matter (new functionality)
    this.api.publishMatterAccessories('my-plugin', [accessory]);
  }
}
```

## Current Limitations

The current implementation is a foundational framework with the following limitations:

1. **Placeholder Implementation**: The actual Matter protocol implementation is currently a placeholder. A full implementation would require complete mapping between HAP services/characteristics and Matter clusters/attributes.

2. **Service Mapping**: Automatic conversion between HomeKit services and Matter clusters is not yet implemented. This would require extensive mapping logic for each device type.

3. **Device Types**: Only basic device types are supported. Complex devices like cameras, TVs, and audio devices may need special handling.

4. **Commissioning**: Matter device commissioning and QR code generation is not yet implemented.

## Future Development

To complete the Matter implementation, the following areas need development:

1. **Service Mapping**: Implement conversion between HomeKit services and Matter clusters
2. **Characteristic Mapping**: Map HomeKit characteristics to Matter attributes
3. **Device Types**: Support for all standard Matter device types
4. **Commissioning**: Implement Matter commissioning flow and QR codes
5. **Thread/WiFi**: Support for Thread and WiFi network provisioning
6. **OTA Updates**: Support for Over-The-Air firmware updates
7. **Fabric Management**: Handle multiple Matter fabrics and commissioners

## Compatibility

- **Node.js**: Requires Node.js 18+ (same as Homebridge)
- **Matter.js**: Uses the official Matter.js SDK from the Connectivity Standards Alliance
- **Networks**: Supports WiFi networks (Thread support planned)
- **Controllers**: Compatible with any Matter-certified controller

## Contributing

This is an experimental feature and contributions are welcome! Key areas where help is needed:

1. HAP to Matter service/characteristic mapping
2. Matter commissioning implementation  
3. Device type support
4. Testing with different Matter controllers
5. Documentation improvements

Please see the [Contributing Guide](CONTRIBUTING.md) for more information.

## Resources

- [Matter Specification](https://csa-iot.org/all-solutions/matter/)
- [Matter.js Documentation](https://github.com/project-chip/matter.js)
- [HomeKit Accessory Protocol](https://developer.apple.com/homekit/)
- [Homebridge Plugin Development](https://developers.homebridge.io/)