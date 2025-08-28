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