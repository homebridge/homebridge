import type { SerializedPlatformAccessory } from './platformAccessory.js'

import {
  Accessory,
  AccessoryEventTypes,
  Categories,
  Characteristic,
  RemoteController,
  Service,
  uuid,
} from '@homebridge/hap-nodejs'
import { describe, expect, it, vi } from 'vitest'

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
      // the very same list, so a service added later shows on both
      expect(accessory.services).toBe(accessory._associatedHAPAccessory.services)
      expect(accessory.services.length).toBe(1)
    })

    it('should use the category OTHER when none is given', () => {
      const accessory = createAccessory('TestName')
      expect(accessory.category).toBe(Categories.OTHER)
      expect(accessory._associatedHAPAccessory.category).toBe(Categories.OTHER)
    })

    it('should start with an empty context of its own', () => {
      const first = new PlatformAccessory('First', uuid.generate('first'))
      const second = new PlatformAccessory('Second', uuid.generate('second'))
      expect(first.context).toEqual({})
      expect(first.context).not.toBe(second.context)
    })
  })

  describe('the identify event', () => {
    it('is forwarded with the paired flag and a callback, and answers the controller itself', () => {
      const accessory = createAccessory('TestName')
      const received: [boolean, () => void][] = []
      // the listener type takes the arguments it is really called with
      accessory.on('identify', (paired, callback) => {
        received.push([paired, callback])
        callback()
      })
      // a listener that takes nothing, as most plugins write it, is fine too
      const plain = vi.fn(() => {})
      accessory.on('identify', plain)
      const answered = vi.fn()

      accessory._associatedHAPAccessory.emit(AccessoryEventTypes.IDENTIFY, true, answered)

      expect(received).toHaveLength(1)
      expect(received[0][0]).toBe(true)
      expect(received[0][1]).toBeTypeOf('function')
      expect(plain).toHaveBeenCalledTimes(1)
      expect(answered).toHaveBeenCalledTimes(1)
    })

    it('can still be sent by a plugin with no arguments', () => {
      const accessory = createAccessory('TestName')
      const listener = vi.fn()
      accessory.on('identify', listener)

      expect(accessory.emit('identify')).toBe(true)
      expect(listener).toHaveBeenCalledTimes(1)
    })
  })

  describe('platformAccessory.prototype.updateDisplayName', () => {
    it('should mirror displayName correctly', () => {
      const accessory = createAccessory('TestName')
      accessory.updateDisplayName('NewTestName')
      expect(accessory._associatedHAPAccessory.displayName).toBe(accessory.displayName)
      expect(accessory.displayName).toBe('NewTestName')
    })

    it('should ignore an empty name', () => {
      const accessory = createAccessory('TestName')
      accessory.updateDisplayName('')
      expect(accessory.displayName).toBe('TestName')
      expect(accessory._associatedHAPAccessory.displayName).toBe('TestName')
    })

    it('should leave the Name characteristic of AccessoryInformation as it is', () => {
      // documented: a plugin that wants the characteristic to follow sets it itself
      const accessory = createAccessory('TestName')
      accessory.updateDisplayName('NewTestName')
      expect(accessory.getService(Service.AccessoryInformation)!.getCharacteristic(Characteristic.Name).value).toBe('TestName')
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

  describe('platformAccessory.prototype.removeController', () => {
    it('should forward removeController correctly', () => {
      const accessory = createAccessory()
      const spy = vi.spyOn(accessory._associatedHAPAccessory, 'removeController').mockImplementationOnce(() => {
        // do nothing
      })

      const controller = new RemoteController()
      accessory.removeController(controller)
      expect(spy).toHaveBeenCalledExactlyOnceWith(controller)
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

    it('should bring an accessory back from the JSON text of the cache file', () => {
      const accessory = createAccessory('Television', Categories.TELEVISION)
      accessory.addService(Service.Lightbulb, 'Light', 'light-1')
        .setCharacteristic(Characteristic.Brightness, 40)
      accessory.addService(Service.Switch, 'Switch', 'switch-1')

      // what really happens between two runs: written as JSON text, and parsed again
      const json = JSON.parse(JSON.stringify(PlatformAccessory.serialize(accessory))) as SerializedPlatformAccessory
      const reconstructed = PlatformAccessory.deserialize(json)

      expect(reconstructed.displayName).toBe('Television')
      expect(reconstructed.UUID).toBe(accessory.UUID)
      expect(reconstructed.category).toBe(Categories.TELEVISION)
      expect(reconstructed._associatedPlugin).toBe('TestPlugin')
      expect(reconstructed._associatedPlatform).toBe('TestPlatform')
      // an equal copy of the context, not the same object
      expect(reconstructed.context).toEqual({ test: 'context', doing: 234 })
      expect(reconstructed.context).not.toBe(accessory.context)
      // the services come back, with their sub types and values
      expect(reconstructed.services.map(service => [service.UUID, service.subtype])).toEqual(accessory.services.map(service => [service.UUID, service.subtype]))
      expect(reconstructed.getServiceById(Service.Lightbulb, 'light-1')!.getCharacteristic(Characteristic.Brightness).value).toBe(40)
      expect(reconstructed.services).toBe(reconstructed._associatedHAPAccessory.services)
    })

    it('should forward identify for a deserialized accessory too', () => {
      const reconstructed = PlatformAccessory.deserialize(PlatformAccessory.serialize(createAccessory()))
      const listener = vi.fn()
      reconstructed.on('identify', listener)

      reconstructed._associatedHAPAccessory.emit(AccessoryEventTypes.IDENTIFY, false, () => {})

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('should not hand the deserialized HAP accessory to the next accessory that is made', () => {
      const reconstructed = PlatformAccessory.deserialize(PlatformAccessory.serialize(createAccessory('Cached')))

      const fresh = new PlatformAccessory('Fresh', uuid.generate('fresh'))

      expect(fresh._associatedHAPAccessory).not.toBe(reconstructed._associatedHAPAccessory)
      expect(fresh.displayName).toBe('Fresh')
    })

    it('should not keep the HAP accessory of an entry that could not be deserialized', () => {
      const json = PlatformAccessory.serialize(createAccessory('Cached'))

      expect(() => PlatformAccessory.deserialize({ ...json, displayName: '' })).toThrow()

      const fresh = new PlatformAccessory('Fresh', uuid.generate('fresh'))
      expect(fresh.displayName).toBe('Fresh')
      expect(fresh.UUID).toBe(uuid.generate('fresh'))
    })
  })
})
