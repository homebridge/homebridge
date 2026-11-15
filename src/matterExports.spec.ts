import type {
  MatterHandlerContext as MainHandlerContext,
  KeypadInputHandlers as MainKeypadInputHandlers,
  MatterAccessoryPart as MainPart,
  ValveConfigurationAndControlState as MainValveState,
} from './index.js'
import type {
  MatterAccessoryEventEmitter,
  MatterAccessoryFeatures,
  MatterAccessoryPart,
  MatterAPI,
  MediaPlaybackHandlers,
  PowerSourceState,
} from './matterExports.js'

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
      'deviceRequirements',
      'deviceTypes',
      'devices',
    ])
    // The main entry's Matter values are deprecated, so a value added later
    // is offered here only (and on api.matter).
    const matterEntryOnly = ['deviceRequirements']
    for (const name of names.filter(name => !matterEntryOnly.includes(name))) {
      expect((matterEntry as Record<string, unknown>)[name], name).toBe((mainEntry as Record<string, unknown>)[name])
    }
  })

  it('offers the types a plugin needs to describe an accessory, from both entries', () => {
    // Checked by the compiler: this does not build when one of them is not exported.
    const part: MatterAccessoryPart = { id: 'one', deviceType: matterEntry.deviceTypes.OnOffOutlet, clusters: {} }
    const context: MainHandlerContext = { uuid: 'uuid', partId: part.id }
    const features: MatterAccessoryFeatures = {
      rvcCleanMode: { directModeChange: true },
    }
    const handlers: MediaPlaybackHandlers & MainKeypadInputHandlers = {}
    const state: PowerSourceState & MainValveState = {}
    const api: MatterAPI | undefined = undefined
    const emitter: MatterAccessoryEventEmitter | MainPart | undefined = undefined

    expect([
      part,
      context,
      features,
      handlers,
      state,
      api,
      emitter,
    ]).toHaveLength(7)
    expect(matterEntry.deviceRequirements.Thermostat).toBeDefined()
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
