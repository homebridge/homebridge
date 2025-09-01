import { beforeEach, describe, expect, it } from 'vitest'

import { HomebridgeAPI } from '../src/api'

describe('matter API', () => {
  let api: HomebridgeAPI

  beforeEach(() => {
    api = new HomebridgeAPI()
  })

  it('should expose Matter device types', () => {
    expect(api.matter).toBeDefined()
    expect(api.matter.deviceTypes).toBeDefined()
    expect(typeof api.matter.deviceTypes).toBe('object')
  })

  it('should expose Matter clusters', () => {
    expect(api.matter.clusters).toBeDefined()
    expect(typeof api.matter.clusters).toBe('object')
  })

  it('should expose HAP to Matter mappings', () => {
    expect(api.matter.hapToMatterDeviceMapping).toBeDefined()
    expect(api.matter.hapToMatterClusterMapping).toBeDefined()
    expect(typeof api.matter.hapToMatterDeviceMapping).toBe('object')
    expect(typeof api.matter.hapToMatterClusterMapping).toBe('object')
  })

  it('should expose helper functions', () => {
    expect(api.matter.getMatterDeviceTypeForHAPService).toBeDefined()
    expect(api.matter.getMatterClustersForHAPService).toBeDefined()
    expect(typeof api.matter.getMatterDeviceTypeForHAPService).toBe('function')
    expect(typeof api.matter.getMatterClustersForHAPService).toBe('function')
  })

  it('should return correct device type for basic lightbulb', () => {
    const deviceType = api.matter.getMatterDeviceTypeForHAPService('Lightbulb')
    expect(deviceType).toBe('OnOffLight')
  })

  it('should return correct device type for dimmable lightbulb', () => {
    const deviceType = api.matter.getMatterDeviceTypeForHAPService('Lightbulb', ['Brightness'])
    expect(deviceType).toBe('DimmableLight')
  })

  it('should return correct device type for color lightbulb', () => {
    const deviceType = api.matter.getMatterDeviceTypeForHAPService('Lightbulb', ['Brightness', 'Hue', 'Saturation'])
    expect(deviceType).toBe('ExtendedColorLight')
  })

  it('should return correct clusters for basic lightbulb', () => {
    const clusters = api.matter.getMatterClustersForHAPService('Lightbulb')
    expect(clusters).toContain('OnOffCluster')
    expect(clusters).toContain('IdentifyCluster')
  })

  it('should return correct clusters for dimmable lightbulb', () => {
    const clusters = api.matter.getMatterClustersForHAPService('Lightbulb', ['Brightness'])
    expect(clusters).toContain('OnOffCluster')
    expect(clusters).toContain('LevelControlCluster')
    expect(clusters).toContain('IdentifyCluster')
  })

  it('should return correct clusters for color lightbulb', () => {
    const clusters = api.matter.getMatterClustersForHAPService('Lightbulb', ['Brightness', 'Hue'])
    expect(clusters).toContain('OnOffCluster')
    expect(clusters).toContain('LevelControlCluster')
    expect(clusters).toContain('ColorControlCluster')
    expect(clusters).toContain('IdentifyCluster')
  })

  it('should return correct device type for temperature sensor', () => {
    const deviceType = api.matter.getMatterDeviceTypeForHAPService('TemperatureSensor')
    expect(deviceType).toBe('TemperatureSensor')
  })

  it('should return null for unknown service type', () => {
    const deviceType = api.matter.getMatterDeviceTypeForHAPService('UnknownService')
    expect(deviceType).toBeNull()
  })

  it('should return empty array for unknown service clusters', () => {
    const clusters = api.matter.getMatterClustersForHAPService('UnknownService')
    expect(clusters).toEqual(['IdentifyCluster'])
  })
})
