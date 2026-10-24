import type { MockInstance } from 'vitest'

import type { SerializedPlatformAccessory } from './platformAccessory.js'

import {
  Accessory,
  Categories,
  RemoteController,
  Service,
  uuid,
} from '@homebridge/hap-nodejs'
import { describe, expect, it, vi } from 'vitest'

import { Logger } from './logger.js'
import { PlatformAccessory } from './platformAccessory.js'

function createAccessory(name = 'TestAccessory', category?: Categories): PlatformAccessory {
  const accessoryUUID = uuid.generate(`test.uuid.${name}`)
  const accessory = new PlatformAccessory(name, accessoryUUID, category)
  accessory._associatedPlatform = 'TestPlatform'
  accessory._associatedPlugin = 'TestPlugin'
  accessory.context = {
    test: 'context',
    doing: 234,
  }
  return accessory
}

describe('platformAccessory', () => {
  describe('properties', () => {
    it('should mirror displayName correctly', () => {
      const accessory = createAccessory('TestName')
      expect(accessory._associatedHAPAccessory.displayName).toBe(accessory.displayName)
      expect(accessory.displayName).toBe('TestName')
    })

    it('should mirror UUID correctly', () => {
      const accessory = createAccessory('TestName')
      expect(accessory._associatedHAPAccessory.UUID).toBe(accessory.UUID)
      expect(accessory.UUID).toBe(uuid.generate('test.uuid.TestName'))
    })

    it('should mirror category correctly', () => {
      const accessory = createAccessory('TestName', Categories.APPLE_TV)
      expect(accessory._associatedHAPAccessory.category).toBe(accessory.category)
      expect(accessory.category).toBe(Categories.APPLE_TV)
    })

    it('should mirror services correctly', () => {
      const accessory = createAccessory('TestName')
      expect(accessory._associatedHAPAccessory.services).toStrictEqual(accessory.services)
      expect(accessory.services.length).toBe(1)
    })
  })

  describe('platformAccessory.prototype.updateDisplayName', () => {
    it('should mirror displayName correctly', () => {
      const accessory = createAccessory('TestName')
      accessory.updateDisplayName('NewTestName')
      expect(accessory._associatedHAPAccessory.displayName).toBe(accessory.displayName)
      expect(accessory.displayName).toBe('NewTestName')
    })
  })

  describe('platformAccessory.prototype.addService', () => {
    it('should forward add service', () => {
      const accessory = createAccessory()
      const service = new Service.Switch()
      const spy = vi.spyOn(accessory._associatedHAPAccessory, 'addService')

      expect(accessory.services.length).toBe(1) // AccessoryInformation service
      expect(accessory.services.includes(service)).toBeFalsy()

      accessory.addService(service)
      expect(accessory.services.length).toBe(2) // ensure our reference is valid
      expect(accessory.services.includes(service)).toBeTruthy()

      expect(spy).toHaveBeenCalledWith(service) // ensure HAP got called
    })
  })

  describe('platformAccessory.prototype.removeService', () => {
    it('should forward remove service', () => {
      const accessory = createAccessory()
      const service = new Service.Switch()
      const spy = vi.spyOn(accessory._associatedHAPAccessory, 'removeService')

      accessory.removeService(service)
      expect(spy).toHaveBeenCalledWith(service)
    })
  })

  describe('platformAccessory.prototype.getService', () => {
    it('should retrieve AccessoryInformation service', () => {
      const accessory = createAccessory()
      const requested = Service.AccessoryInformation
      const spy = vi.spyOn(accessory._associatedHAPAccessory, 'getService')

      const service = accessory.getService(requested)
      expect(spy).toHaveBeenCalledWith(requested)
      expect(service).toBeDefined()
      expect(service!.UUID).toBe(requested.UUID)
    })
  })

  describe('platformAccessory.prototype.getServiceById', () => {
    it('should forward service retrieval by id', () => {
      const accessory = createAccessory()
      const spy = vi.spyOn(accessory._associatedHAPAccessory, 'getServiceById')

      const result = accessory.getServiceById(Service.Switch, 'customSubType')
      expect(result).toBeUndefined()
      expect(spy).toHaveBeenCalledWith(Service.Switch, 'customSubType')
    })
  })

  describe('platformAccessory.prototype.configureController', () => {
    it('should forward configureController correctly', () => {
      const accessory = createAccessory()
      const spy = vi.spyOn(accessory._associatedHAPAccessory, 'configureController').mockImplementationOnce(() => {
        // do nothing
      })

      const controller = new RemoteController()
      accessory.configureController(controller)
      expect(spy).toHaveBeenCalledWith(controller)
    })
  })

  describe('platformAccessory.serialize', () => {
    it('should serialize accessory correctly', () => {
      const accessory = createAccessory()
      accessory.addService(Service.Lightbulb)
      const spy = vi.spyOn(Accessory, 'serialize')

      const json: SerializedPlatformAccessory = PlatformAccessory.serialize(accessory)

      expect(json.platform).toBe(accessory._associatedPlatform)
      expect(json.plugin).toBe(accessory._associatedPlugin)
      expect(json.context).toStrictEqual(accessory.context)
      expect(spy).toHaveBeenCalledWith(accessory._associatedHAPAccessory)
    })

    it('should throw when _associatedPlugin is missing', () => {
      const accessory = createAccessory()
      accessory._associatedPlugin = undefined

      expect(() => PlatformAccessory.serialize(accessory))
        .toThrow('Cannot serialize accessory \'TestAccessory\' - missing associated plugin')
    })

    it('should throw when _associatedPlatform is missing', () => {
      const accessory = createAccessory()
      accessory._associatedPlatform = undefined

      expect(() => PlatformAccessory.serialize(accessory))
        .toThrow('Cannot serialize accessory \'TestAccessory\' - missing associated platform')
    })
  })

  describe('platformAccessory.deserialize', () => {
    it('should deserialize serialized accessory correctly', () => {
      const accessory = createAccessory()
      accessory.addService(Service.Lightbulb)

      const json = PlatformAccessory.serialize(accessory)
      const reconstructed = PlatformAccessory.deserialize(json)

      expect(reconstructed._associatedPlugin).toBe(accessory._associatedPlugin)
      expect(reconstructed._associatedPlatform).toBe(accessory._associatedPlatform)
      expect(reconstructed.displayName).toBe(accessory.displayName)
      expect(reconstructed.UUID).toBe(accessory.UUID)
      expect(reconstructed.category).toBe(accessory.category)
      expect(reconstructed.context).toBe(accessory.context)
    })
  })

  describe('platformAccessory.prototype.removeService warnings', () => {
    function restart(accessory: PlatformAccessory): PlatformAccessory {
      return PlatformAccessory.deserialize(JSON.parse(JSON.stringify(PlatformAccessory.serialize(accessory))))
    }

    function warnings(warnSpy: MockInstance): string[] {
      return warnSpy.mock.calls.map((call: unknown[]) => String(call[0]))
    }

    it('says nothing when a plugin removes one of its own services', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const accessory = createAccessory()
      const old = accessory.addService(Service.ContactSensor)

      accessory.removeService(old)

      expect(warnSpy).not.toHaveBeenCalled()
      expect(accessory.getService(Service.ContactSensor)).toBeUndefined()
      warnSpy.mockRestore()
    })

    it('warns, but still removes, when a plugin removes the information service', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const accessory = createAccessory()

      accessory.removeService(accessory.getService(Service.AccessoryInformation)!)

      expect(warnings(warnSpy)).toEqual([
        expect.stringContaining('HAP manages this service'),
      ])
      expect(warnSpy.mock.calls[0][1]).toBe('TestPlugin')
      expect(accessory.getService(Service.AccessoryInformation)).toBeUndefined()
      warnSpy.mockRestore()
    })

    it('warns when a plugin removes a service a configured controller uses', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const accessory = createAccessory()
      accessory.configureController(new RemoteController())
      const controllerService = accessory.services.find(service => service.UUID !== Service.AccessoryInformation.UUID)!

      accessory.removeService(controllerService)

      expect(warnings(warnSpy)).toEqual([
        expect.stringContaining('a controller on the accessory still uses it'),
      ])
      expect(accessory.services).not.toContain(controllerService)
      warnSpy.mockRestore()
    })

    it('warns for a controller restored from the cache that is not configured again yet', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const original = createAccessory()
      original.configureController(new RemoteController())
      original.addService(Service.MotionSensor)
      const restored = restart(original)
      const controllerService = restored.services.find(service =>
        service.UUID !== Service.AccessoryInformation.UUID
        && service.UUID !== Service.MotionSensor.UUID,
      )!

      restored.removeService(controllerService)

      expect(warnings(warnSpy)).toEqual([
        expect.stringContaining('a controller on the accessory still uses it'),
      ])
      warnSpy.mockRestore()
    })

    it('says nothing for an ordinary service on an accessory that has a controller', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const accessory = createAccessory()
      accessory.configureController(new RemoteController())
      const motion = accessory.addService(Service.MotionSensor)

      accessory.removeService(motion)

      expect(warnSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it('says nothing for a service that is not on the accessory', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const accessory = createAccessory()

      accessory.removeService(new Service.AccessoryInformation())

      expect(warnSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })
})
