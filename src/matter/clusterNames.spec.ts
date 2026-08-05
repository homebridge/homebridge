import type { ClusterStateMap } from './clusterStateMap.js'
import type { MatterClusterName } from './types.js'

import { describe, expect, expectTypeOf, it } from 'vitest'

import { clusterNames } from './types.js'

describe('clusterNames', () => {
  it('includes the electrical measurement clusters so updateAccessoryState does not warn', () => {
    const values = Object.values(clusterNames)
    expect(values).toContain('electricalPowerMeasurement')
    expect(values).toContain('electricalEnergyMeasurement')
  })

  it('includes the clusters carried by the closure, media player and speaker types', () => {
    // Exposing a device type without listing its clusters here leaves plugins
    // with no api.matter.clusterNames constant to pass, and makes
    // updateAccessoryState warn on every single update - which is what the
    // electrical measurement entries above were added to stop.
    const values = Object.values(clusterNames)
    expect(values).toContain('closureControl')
    expect(values).toContain('mediaPlayback')
    expect(values).toContain('keypadInput')
    // the speaker's two clusters are shared with lights and outlets
    expect(values).toContain('levelControl')
    expect(values).toContain('onOff')
  })

  it('lists every cluster routable via ClusterStateMap (compile-time drift guard)', () => {
    // MatterAPIImpl.validateClusterName warns for any cluster missing from
    // clusterNames - if this assertion fails, a cluster was added to
    // ClusterStateMap without a matching entry in clusterNames (types.ts).
    expectTypeOf<keyof ClusterStateMap>().toExtend<MatterClusterName>()
    // Runtime sanity so the test carries a real assertion too: names are
    // unique (a duplicate value would make two API constants collide).
    const values = Object.values(clusterNames)
    expect(new Set(values).size).toBe(values.length)
  })
})
