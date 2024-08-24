import type { AccessoryPlugin, DynamicPlatformPlugin } from './api.js'

import { Service } from 'hap-nodejs'
import { describe, expect, it, vi } from 'vitest'

import { HomebridgeAPI, InternalAPIEvent } from './api.js'

const api = new HomebridgeAPI()
const emitSpy = vi.spyOn(api, 'emit')

class ExampleAccessory implements AccessoryPlugin {
  getServices(): Service[] {
    return [new Service.Switch('TestSwitch')]
  }
}

class ExamplePlatform implements DynamicPlatformPlugin {
  configureAccessory(): void {
    // do nothing
  }
}

const pluginName = 'homebridge-example'
const accessoryName = 'MyCoolAccessory'
const platformName = 'MyCoolPlatform'

describe('homebridgeAPI', () => {
  describe('homebridgeAPI.prototype.registerAccessory', () => {
    it('should register accessory with legacy style signature', () => {
      api.registerAccessory(pluginName, accessoryName, ExampleAccessory)
      expect(emitSpy).toHaveBeenLastCalledWith(InternalAPIEvent.REGISTER_ACCESSORY, accessoryName, ExampleAccessory, pluginName)
    })

    it('should register accessory without passing plugin name', () => {
      api.registerAccessory(accessoryName, ExampleAccessory)
      expect(emitSpy).toHaveBeenLastCalledWith(InternalAPIEvent.REGISTER_ACCESSORY, accessoryName, ExampleAccessory)
    })
  })

  describe('homebridgeAPI.prototype.registerPlatform', () => {
    it('should register platform with legacy style signature', () => {
      api.registerPlatform(pluginName, platformName, ExamplePlatform)
      expect(emitSpy).toHaveBeenLastCalledWith(InternalAPIEvent.REGISTER_PLATFORM, platformName, ExamplePlatform, pluginName)
    })

    it('should register platform without passing plugin name', () => {
      api.registerPlatform(platformName, ExamplePlatform)
      expect(emitSpy).toHaveBeenLastCalledWith(InternalAPIEvent.REGISTER_PLATFORM, platformName, ExamplePlatform)
    })
  })
})
