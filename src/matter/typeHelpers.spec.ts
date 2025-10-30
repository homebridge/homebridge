import { describe, expect, it } from 'vitest'

import {
  isDeviceType,
  isExtendableBehaviorType,
  isExtendableEndpointType,
  withBehaviors,
  withFeatures,
} from './typeHelpers.js'

describe('typeHelpers', () => {
  describe('isExtendableEndpointType', () => {
    it('should return true for endpoint types with .with() method', () => {
      const mockEndpoint = {
        with: () => mockEndpoint,
      } as any

      expect(isExtendableEndpointType(mockEndpoint)).toBe(true)
    })

    it('should return false for endpoint types without .with() method', () => {
      const mockEndpoint = {} as any

      expect(isExtendableEndpointType(mockEndpoint)).toBe(false)
    })

    it('should return false when .with() is not a function', () => {
      const mockEndpoint = {
        with: 'not a function',
      } as any

      expect(isExtendableEndpointType(mockEndpoint)).toBe(false)
    })
  })

  describe('isExtendableBehaviorType', () => {
    it('should return true for behavior types with .with() method', () => {
      const mockBehavior = {
        with: () => mockBehavior,
      } as any

      expect(isExtendableBehaviorType(mockBehavior)).toBe(true)
    })

    it('should return false for behavior types without .with() method', () => {
      const mockBehavior = {} as any

      expect(isExtendableBehaviorType(mockBehavior)).toBe(false)
    })

    it('should return false when .with() is not a function', () => {
      const mockBehavior = {
        with: 'not a function',
      } as any

      expect(isExtendableBehaviorType(mockBehavior)).toBe(false)
    })
  })

  describe('withBehaviors', () => {
    it('should return the same device type when no behaviors are provided', () => {
      const mockDevice = {} as any
      const result = withBehaviors(mockDevice, [])

      expect(result).toBe(mockDevice)
    })

    it('should call .with() when device type is extendable', () => {
      const mockBehavior1 = { id: 'behavior1' } as any
      const mockBehavior2 = { id: 'behavior2' } as any
      const extendedDevice = { name: 'ExtendedDevice' } as any

      const mockDevice = {
        with: (...behaviors: any[]) => {
          expect(behaviors).toEqual([mockBehavior1, mockBehavior2])
          return extendedDevice
        },
      } as any

      const result = withBehaviors(mockDevice, [mockBehavior1, mockBehavior2])

      expect(result).toBe(extendedDevice)
    })

    it('should throw error when device type is not extendable', () => {
      const mockDevice = {} as any
      const mockBehavior = { id: 'behavior' } as any

      expect(() => withBehaviors(mockDevice, [mockBehavior])).toThrow(
        'Device type does not support adding behaviors',
      )
    })
  })

  describe('withFeatures', () => {
    it('should return the same behavior when no features are provided', () => {
      const mockBehavior = {} as any
      const result = withFeatures(mockBehavior, [])

      expect(result).toBe(mockBehavior)
    })

    it('should call .with() when behavior is extendable', () => {
      const extendedBehavior = { features: ['Feature1', 'Feature2'] } as any

      const mockBehavior = {
        with: (...features: string[]) => {
          expect(features).toEqual(['Feature1', 'Feature2'])
          return extendedBehavior
        },
      } as any

      const result = withFeatures(mockBehavior, ['Feature1', 'Feature2'])

      expect(result).toBe(extendedBehavior)
    })

    it('should throw error when behavior is not extendable', () => {
      const mockBehavior = {} as any

      expect(() => withFeatures(mockBehavior, ['Feature1'])).toThrow(
        'Behavior does not support adding features',
      )
    })
  })

  describe('isDeviceType', () => {
    it('should return true for direct reference comparison', () => {
      const mockDevice = { name: 'TestDevice' } as any

      expect(isDeviceType(mockDevice, mockDevice)).toBe(true)
    })

    it('should return true when device names match', () => {
      const mockDevice1 = { name: 'TestDevice' } as any
      const mockDevice2 = { name: 'TestDevice' } as any

      expect(isDeviceType(mockDevice1, mockDevice2)).toBe(true)
    })

    it('should return false when device names differ', () => {
      const mockDevice1 = { name: 'DeviceA' } as any
      const mockDevice2 = { name: 'DeviceB' } as any

      expect(isDeviceType(mockDevice1, mockDevice2)).toBe(false)
    })

    it('should return false when device type has no name', () => {
      const mockDevice1 = {} as any
      const mockDevice2 = { name: 'TestDevice' } as any

      expect(isDeviceType(mockDevice1, mockDevice2)).toBe(false)
    })

    it('should return false when target type has no name', () => {
      const mockDevice1 = { name: 'TestDevice' } as any
      const mockDevice2 = {} as any

      expect(isDeviceType(mockDevice1, mockDevice2)).toBe(false)
    })

    it('should return false when neither device has a name', () => {
      const mockDevice1 = {} as any
      const mockDevice2 = {} as any

      expect(isDeviceType(mockDevice1, mockDevice2)).toBe(false)
    })

    it('should handle modified types with same name', () => {
      const baseDevice = { name: 'OnOffLight' } as any
      const modifiedDevice = {
        name: 'OnOffLight',
        with: () => modifiedDevice,
      } as any

      expect(isDeviceType(modifiedDevice, baseDevice)).toBe(true)
    })
  })
})
