/**
 * Tests for Concentration Measurement Cluster Behaviors
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { BehaviorRegistry } from './BehaviorRegistry.js'
import {
  HomebridgeCarbonMonoxideConcentrationMeasurementServer,
  HomebridgeNitrogenDioxideConcentrationMeasurementServer,
  HomebridgeOzoneConcentrationMeasurementServer,
  HomebridgePm10ConcentrationMeasurementServer,
  HomebridgePm25ConcentrationMeasurementServer,
} from './ConcentrationMeasurementBehavior.js'

describe('concentration measurement behaviors', () => {
  let registry: BehaviorRegistry
  let accessoriesMap: Map<string, any>

  beforeEach(() => {
    accessoriesMap = new Map()
    registry = new BehaviorRegistry(accessoriesMap)
  })

  describe('homebridgePm25ConcentrationMeasurementServer', () => {
    beforeEach(() => {
      HomebridgePm25ConcentrationMeasurementServer.setRegistry(registry)
    })

    it('should set the registry', () => {
      const newRegistry = new BehaviorRegistry(new Map())
      HomebridgePm25ConcentrationMeasurementServer.setRegistry(newRegistry)
      // eslint-disable-next-line dot-notation
      expect(HomebridgePm25ConcentrationMeasurementServer['registry']).toBe(newRegistry)
    })

    it('should be a read-only cluster with no commands', () => {
      const prototype = HomebridgePm25ConcentrationMeasurementServer.prototype as any
      expect(typeof prototype.on).toBe('undefined')
      expect(typeof prototype.off).toBe('undefined')
    })
  })

  describe('homebridgePm10ConcentrationMeasurementServer', () => {
    beforeEach(() => {
      HomebridgePm10ConcentrationMeasurementServer.setRegistry(registry)
    })

    it('should set the registry', () => {
      const newRegistry = new BehaviorRegistry(new Map())
      HomebridgePm10ConcentrationMeasurementServer.setRegistry(newRegistry)
      // eslint-disable-next-line dot-notation
      expect(HomebridgePm10ConcentrationMeasurementServer['registry']).toBe(newRegistry)
    })

    it('should be a read-only cluster with no commands', () => {
      const prototype = HomebridgePm10ConcentrationMeasurementServer.prototype as any
      expect(typeof prototype.on).toBe('undefined')
      expect(typeof prototype.off).toBe('undefined')
    })
  })

  describe('homebridgeOzoneConcentrationMeasurementServer', () => {
    beforeEach(() => {
      HomebridgeOzoneConcentrationMeasurementServer.setRegistry(registry)
    })

    it('should set the registry', () => {
      const newRegistry = new BehaviorRegistry(new Map())
      HomebridgeOzoneConcentrationMeasurementServer.setRegistry(newRegistry)
      // eslint-disable-next-line dot-notation
      expect(HomebridgeOzoneConcentrationMeasurementServer['registry']).toBe(newRegistry)
    })

    it('should be a read-only cluster with no commands', () => {
      const prototype = HomebridgeOzoneConcentrationMeasurementServer.prototype as any
      expect(typeof prototype.on).toBe('undefined')
      expect(typeof prototype.off).toBe('undefined')
    })
  })

  describe('homebridgeNitrogenDioxideConcentrationMeasurementServer', () => {
    beforeEach(() => {
      HomebridgeNitrogenDioxideConcentrationMeasurementServer.setRegistry(registry)
    })

    it('should set the registry', () => {
      const newRegistry = new BehaviorRegistry(new Map())
      HomebridgeNitrogenDioxideConcentrationMeasurementServer.setRegistry(newRegistry)
      // eslint-disable-next-line dot-notation
      expect(HomebridgeNitrogenDioxideConcentrationMeasurementServer['registry']).toBe(newRegistry)
    })

    it('should be a read-only cluster with no commands', () => {
      const prototype = HomebridgeNitrogenDioxideConcentrationMeasurementServer.prototype as any
      expect(typeof prototype.on).toBe('undefined')
      expect(typeof prototype.off).toBe('undefined')
    })
  })

  describe('homebridgeCarbonMonoxideConcentrationMeasurementServer', () => {
    beforeEach(() => {
      HomebridgeCarbonMonoxideConcentrationMeasurementServer.setRegistry(registry)
    })

    it('should set the registry', () => {
      const newRegistry = new BehaviorRegistry(new Map())
      HomebridgeCarbonMonoxideConcentrationMeasurementServer.setRegistry(newRegistry)
      // eslint-disable-next-line dot-notation
      expect(HomebridgeCarbonMonoxideConcentrationMeasurementServer['registry']).toBe(newRegistry)
    })

    it('should be a read-only cluster with no commands', () => {
      const prototype = HomebridgeCarbonMonoxideConcentrationMeasurementServer.prototype as any
      expect(typeof prototype.on).toBe('undefined')
      expect(typeof prototype.off).toBe('undefined')
    })
  })
})
