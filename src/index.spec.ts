import type {
  Accessory,
  AdaptiveLightingControllerUpdate,
  Bridge,
  BridgeConfiguration,
  CameraControllerServiceMap,
  CameraControllerState,
  CameraStreamingOptionsBase,
  CharacteristicContext,
  CharacteristicWarning,
  ControllerIdentifier,
  DataStreamMessage,
  HAPConnection,
  HAPUsername,
  HDSConnectionError,
  HDSFrame,
  PrepareSessionCallback,
  RemoteControllerServiceMap,
  SerializedControllerState,
  UUID,
} from './index.js'

import * as hap from '@homebridge/hap-nodejs'
import { describe, expect, it } from 'vitest'

import * as homebridge from './index.js'

// The types only have to compile: `npm run typecheck` fails when one of them is no longer exported.
export type ExportedHapTypes = [
  Accessory,
  AdaptiveLightingControllerUpdate,
  Bridge,
  CameraControllerServiceMap,
  CameraControllerState,
  CameraStreamingOptionsBase,
  CharacteristicContext,
  CharacteristicWarning,
  ControllerIdentifier,
  DataStreamMessage,
  HAPConnection,
  HAPUsername,
  HDSConnectionError,
  HDSFrame,
  PrepareSessionCallback,
  RemoteControllerServiceMap,
  SerializedControllerState,
  UUID,
]

describe('the homebridge package entry', () => {
  it.each([
    'CharacteristicWarningType',
    'EventedHTTPServerEvent',
    'HAPConnectionEvent',
    'HAPConnectionState',
    'HAPHTTPCode',
    'HAPPairingHTTPCode',
    'HDSConnectionErrorType',
    'MDNSAdvertiser',
    'MessageType',
    'PermissionTypes',
    'ResourceRequestType',
    'TLVErrorCode',
    'VideoCodecPacketizationMode',
    'VideoCodecType',
    // two of the long-standing ones, so a slip in the list above is noticed
    'Categories',
    'HAPStatus',
  ] as const)('passes on the HAP-NodeJS enum %s', (name) => {
    expect(homebridge[name]).toBeTypeOf('object')
    expect(homebridge[name]).toBe(hap[name])
  })

  it('lets a plugin name the advertiser of a bridge configuration by its enum', () => {
    const advertiser: BridgeConfiguration['advertiser'] = homebridge.MDNSAdvertiser.CIAO

    expect(advertiser).toBe('ciao')
  })

  it('still exports its own enums as run-time objects', () => {
    expect(homebridge.APIEvent.DID_FINISH_LAUNCHING).toBe('didFinishLaunching')
    expect(homebridge.PluginType.PLATFORM).toBe('platform')
    expect(homebridge.LogLevel.WARN).toBe('warn')
    expect(homebridge.PlatformAccessoryEvent.IDENTIFY).toBe('identify')
  })
})
