/**
 * Tests for Concentration Measurement Cluster Behaviors
 */

import { describe, expect, it } from 'vitest'

import {
  HomebridgeCarbonMonoxideConcentrationMeasurementServer,
  HomebridgeNitrogenDioxideConcentrationMeasurementServer,
  HomebridgeOzoneConcentrationMeasurementServer,
  HomebridgePm10ConcentrationMeasurementServer,
  HomebridgePm25ConcentrationMeasurementServer,
} from './ConcentrationMeasurementBehavior.js'

describe('concentration measurement behaviors', () => {
  describe('homebridgePm25ConcentrationMeasurementServer', () => {
    it('should be a read-only cluster with no commands', () => {
      const prototype = HomebridgePm25ConcentrationMeasurementServer.prototype as any
      expect(typeof prototype.on).toBe('undefined')
      expect(typeof prototype.off).toBe('undefined')
    })
  })

  describe('homebridgePm10ConcentrationMeasurementServer', () => {
    it('should be a read-only cluster with no commands', () => {
      const prototype = HomebridgePm10ConcentrationMeasurementServer.prototype as any
      expect(typeof prototype.on).toBe('undefined')
      expect(typeof prototype.off).toBe('undefined')
    })
  })

  describe('homebridgeOzoneConcentrationMeasurementServer', () => {
    it('should be a read-only cluster with no commands', () => {
      const prototype = HomebridgeOzoneConcentrationMeasurementServer.prototype as any
      expect(typeof prototype.on).toBe('undefined')
      expect(typeof prototype.off).toBe('undefined')
    })
  })

  describe('homebridgeNitrogenDioxideConcentrationMeasurementServer', () => {
    it('should be a read-only cluster with no commands', () => {
      const prototype = HomebridgeNitrogenDioxideConcentrationMeasurementServer.prototype as any
      expect(typeof prototype.on).toBe('undefined')
      expect(typeof prototype.off).toBe('undefined')
    })
  })

  describe('homebridgeCarbonMonoxideConcentrationMeasurementServer', () => {
    it('should be a read-only cluster with no commands', () => {
      const prototype = HomebridgeCarbonMonoxideConcentrationMeasurementServer.prototype as any
      expect(typeof prototype.on).toBe('undefined')
      expect(typeof prototype.off).toBe('undefined')
    })
  })
})
