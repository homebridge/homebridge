import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import * as mainEntry from './index.js'
import * as matterEntry from './matterExports.js'

describe('the homebridge/matter entry', () => {
  it('offers every matter value under the same name, and the same object, as the main entry', () => {
    const names = Object.keys(matterEntry).sort()

    expect(names).toEqual([
      'ChildMatterMessageType',
      'MatterAccessoryEventTypes',
      'MatterBridgeStatus',
      'MatterCommissioningError',
      'MatterDeviceError',
      'MatterError',
      'MatterErrorType',
      'MatterNetworkError',
      'MatterRequests',
      'MatterStatus',
      'MatterStorageError',
      'clusterNames',
      'clusters',
      'deviceTypes',
      'devices',
    ])
    for (const name of names) {
      expect((matterEntry as Record<string, unknown>)[name], name).toBe((mainEntry as Record<string, unknown>)[name])
    }
  })

  it('is published as homebridge/matter next to an unchanged main entry', () => {
    const packageJSON = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'))

    expect(packageJSON.exports).toEqual({
      '.': { types: './dist/index.d.ts', default: './dist/index.js' },
      './matter': { types: './dist/matterExports.d.ts', default: './dist/matterExports.js' },
    })
    // for typescript projects that still use the old "node" module resolution
    expect(packageJSON.typesVersions).toEqual({
      '*': {
        matter: ['dist/matterExports.d.ts'],
      },
    })
  })
})
