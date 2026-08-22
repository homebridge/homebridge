import type { SerializedPlatformAccessory } from './platformAccessory.js'

import {
  Accessory,
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

  describe('platformAccessory.prototype.reconcileServices', () => {
    it('snapshots three consecutive stale services before removal to avoid mutation-while-iterating skips', () => {
      const accessory = createAccessory()
      const desired = accessory.addService(Service.Switch)
      accessory.addService(Service.ContactSensor)
      accessory.addService(Service.MotionSensor)
      accessory.addService(Service.OccupancySensor)

      const removed = accessory.reconcileServices([desired])

      expect(removed.map(service => service.UUID)).toStrictEqual([
        Service.ContactSensor.UUID,
        Service.MotionSensor.UUID,
        Service.OccupancySensor.UUID,
      ])
      expect(accessory.services).toStrictEqual([
        accessory.getService(Service.AccessoryInformation),
        desired,
      ])
      expect(accessory.reconcileServices([desired])).toStrictEqual([])
      expect(accessory.services).toHaveLength(2)
    })

    it('does not serialize the accessory when no removable service is stale', () => {
      const accessory = createAccessory()
      const desired = accessory.addService(Service.Switch)
      const serialize = vi.spyOn(Accessory, 'serialize')

      expect(accessory.reconcileServices([desired])).toStrictEqual([])
      expect(serialize).not.toHaveBeenCalled()
    })

    it('preserves serialized accessory identity across restore, reconciliation, and restart', () => {
      const accessory = createAccessory('Serialized', Categories.SWITCH)
      accessory.context = { test: 'serialized-context', count: 3980 }
      accessory.addService(Service.Switch)
      accessory.addService(Service.ContactSensor)
      const identity = {
        UUID: accessory.UUID,
        displayName: accessory.displayName,
        category: accessory.category,
        context: accessory.context,
      }

      const restored = PlatformAccessory.deserialize(PlatformAccessory.serialize(accessory))
      const desired = restored.getService(Service.Switch)!
      restored.reconcileServices([desired])

      const restarted = PlatformAccessory.deserialize(PlatformAccessory.serialize(restored))
      expect(restarted.UUID).toBe(identity.UUID)
      expect(restarted.displayName).toBe(identity.displayName)
      expect(restarted.category).toBe(identity.category)
      expect(restarted.context).toStrictEqual(identity.context)
      expect(restarted.getService(Service.Switch)).toBeDefined()
      expect(restarted.getService(Service.ContactSensor)).toBeUndefined()
      expect(restarted.getService(Service.AccessoryInformation)).toBeDefined()
    })

    it('distinguishes services with the same UUID by instance', () => {
      const accessory = createAccessory()
      const desired = accessory.addService(Service.Switch, 'Desired', 'desired')
      accessory.addService(Service.Switch, 'Stale', 'stale')

      accessory.reconcileServices([desired])

      expect(accessory.getServiceById(Service.Switch, 'desired')).toBe(desired)
      expect(accessory.getServiceById(Service.Switch, 'stale')).toBeUndefined()
    })

    it('preserves characteristics on retained desired service instances', () => {
      const accessory = createAccessory()
      const desired = accessory.addService(Service.Switch)
      desired.updateCharacteristic(Characteristic.On, true)
      accessory.addService(Service.ContactSensor)

      accessory.reconcileServices([desired])

      expect(accessory.getService(Service.Switch)).toBe(desired)
      expect(desired.getCharacteristic(Characteristic.On).value).toBe(true)
    })

    it('preserves HAP-managed services when they are not listed as desired', () => {
      const accessory = createAccessory()
      const protocolInformation = accessory.addService(Service.ProtocolInformation)

      expect(accessory.reconcileServices([])).toStrictEqual([])
      expect(accessory.getService(Service.AccessoryInformation)).toBeDefined()
      expect(accessory.getService(Service.ProtocolInformation)).toBe(protocolInformation)
    })

    it('rejects desired services that are not attached to this accessory', () => {
      const accessory = createAccessory()
      const detached = new Service.Switch('Detached', 'detached')
      const stale = accessory.addService(Service.ContactSensor)
      const servicesBeforeReconciliation = [...accessory.services]

      expect(() => accessory.reconcileServices([detached]))
        .toThrowError(new TypeError('Cannot reconcile service that is not attached to this accessory'))
      expect(accessory.services).toStrictEqual(servicesBeforeReconciliation)
      expect(accessory.getService(Service.ContactSensor)).toBe(stale)
    })

    it('preserves restored controller services when reconciliation follows controller setup', () => {
      const accessory = createAccessory()
      accessory.configureController(new RemoteController())
      accessory.addService(Service.ContactSensor)

      const restored = PlatformAccessory.deserialize(PlatformAccessory.serialize(accessory))
      restored.configureController(new RemoteController())
      const stale = restored.getService(Service.ContactSensor)!
      const desired = restored.services.filter(service => service !== stale)

      expect(restored.reconcileServices(desired)).toStrictEqual([stale])
      expect(restored.services).toStrictEqual(desired)

      const restarted = PlatformAccessory.deserialize(PlatformAccessory.serialize(restored))
      restarted.configureController(new RemoteController())
      expect(restarted.getService(Service.ContactSensor)).toBeUndefined()
      expect(restarted.services.map(service => [service.UUID, service.subtype]))
        .toStrictEqual(desired.map(service => [service.UUID, service.subtype]))
    })

    it('rejects removing services owned by a configured controller', () => {
      const accessory = createAccessory()
      accessory.configureController(new RemoteController())
      const desired = accessory.addService(Service.MotionSensor)
      const servicesBeforeReconciliation = [...accessory.services]

      expect(() => accessory.reconcileServices([desired]))
        .toThrowError(new TypeError('Cannot reconcile a service managed by an accessory controller'))
      expect(accessory.services).toStrictEqual(servicesBeforeReconciliation)

      const restored = PlatformAccessory.deserialize(PlatformAccessory.serialize(accessory))
      expect(() => restored.configureController(new RemoteController())).not.toThrow()
    })

    it('does not remove ordinary stale services when a controller service blocks reconciliation', () => {
      const accessory = createAccessory()
      const ordinaryStale = accessory.addService(Service.ContactSensor)
      accessory.configureController(new RemoteController())
      const desired = accessory.addService(Service.MotionSensor)
      const servicesBeforeReconciliation = [...accessory.services]

      expect(() => accessory.reconcileServices([desired]))
        .toThrowError(new TypeError('Cannot reconcile a service managed by an accessory controller'))
      expect(accessory.services).toStrictEqual(servicesBeforeReconciliation)
      expect(accessory.getService(Service.ContactSensor)).toBe(ordinaryStale)
    })

    it('rejects removing services owned by a serialized controller before it is configured', () => {
      const accessory = createAccessory()
      accessory.configureController(new RemoteController())
      accessory.addService(Service.MotionSensor)
      const restored = PlatformAccessory.deserialize(PlatformAccessory.serialize(accessory))
      const restoredDesired = restored.getService(Service.MotionSensor)!
      const servicesBeforeReconciliation = [...restored.services]

      expect(() => restored.reconcileServices([restoredDesired]))
        .toThrowError(new TypeError('Cannot reconcile a service managed by an accessory controller'))
      expect(restored.services).toStrictEqual(servicesBeforeReconciliation)
      expect(() => restored.configureController(new RemoteController())).not.toThrow()
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
})
