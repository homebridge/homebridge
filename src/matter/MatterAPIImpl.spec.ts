import type { HomebridgeAPI } from '../api.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the heavy Matter barrel so importing MatterAPIImpl doesn't pull in
// @matter/* at parse time. Only the symbols MatterAPIImpl touches at module
// load (deviceTypes, for the external-device-type list) need to be present.
vi.mock('./index.js', () => ({
  clusterNames: {},
  clusters: {},
  deviceTypes: { RoboticVacuumCleaner: { deviceType: 0x74 } },
  MatterTypes: {},
}))

vi.mock('./SwitchAPI.js', () => ({
  SwitchAPIImpl: class {},
}))

vi.mock('../logger.js', () => {
  const mockLogger = { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn() }
  return { Logger: { withPrefix: vi.fn(() => mockLogger) } }
})

// Import after mocks are registered so the module binds to the mocked symbols.
const { MatterAPIImpl } = await import('./MatterAPIImpl.js')

function makeApi(overrides: Record<string, unknown> = {}): HomebridgeAPI {
  return {
    _matterManager: undefined,
    emit: vi.fn(),
    ...overrides,
  } as unknown as HomebridgeAPI
}

describe('matterAPIImpl.registerPlatformAccessories — guard before the manager is ready (#3944)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects with an actionable error when no Matter manager is attached yet', async () => {
    // Models a plugin calling api.matter.registerPlatformAccessories during its
    // initialiser — isMatterEnabled() is now truthful there, but the manager
    // (which handles these events) is constructed later.
    const impl = new MatterAPIImpl(makeApi({ _matterManager: undefined }))

    await expect(
      impl.registerPlatformAccessories('homebridge-test', 'TestPlatform', [{} as any]),
    ).rejects.toThrow(/before Homebridge has finished launching/)
  })

  it('throws synchronously instead of emitting an unhandled event (no hang, no silent drop)', async () => {
    const api = makeApi({ _matterManager: undefined })
    const impl = new MatterAPIImpl(api)

    await expect(
      impl.registerPlatformAccessories('homebridge-test', 'TestPlatform', [{} as any]),
    ).rejects.toThrow()

    // Critically: it never emitted a register/publish event — previously a
    // bridged event would be dropped and an external one would await a promise
    // that nothing could resolve.
    expect(api.emit).not.toHaveBeenCalled()
  })

  it('proceeds past the guard once the manager is attached', async () => {
    const impl = new MatterAPIImpl(makeApi({ _matterManager: {} }))
    // Short-circuit after the guard so the test isolates guard behaviour from
    // full validation/emit machinery.
    vi.spyOn(impl as any, 'validateAccessories').mockReturnValue([])

    await expect(
      impl.registerPlatformAccessories('homebridge-test', 'TestPlatform', [{} as any]),
    ).resolves.toBeUndefined()
  })

  it('returns early for zero accessories before reaching the guard', async () => {
    // The empty-list short-circuit runs before the guard, so this must not throw
    // even with no manager attached.
    const impl = new MatterAPIImpl(makeApi({ _matterManager: undefined }))

    await expect(
      impl.registerPlatformAccessories('homebridge-test', 'TestPlatform', []),
    ).resolves.toBeUndefined()
  })
})

describe('matterAPIImpl update methods — guard before the manager is ready', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updateAccessoryState rejects when no Matter manager is attached yet', async () => {
    const impl = new MatterAPIImpl(makeApi({ _matterManager: undefined }))
    await expect(
      impl.updateAccessoryState('uuid-1', 'OnOff', { on: true }),
    ).rejects.toThrow(/before Homebridge has finished launching/)
  })

  it('updatePlatformAccessories rejects when no Matter manager is attached yet', async () => {
    const impl = new MatterAPIImpl(makeApi({ _matterManager: undefined }))
    await expect(
      impl.updatePlatformAccessories([{ UUID: 'uuid-1' } as any]),
    ).rejects.toThrow(/before Homebridge has finished launching/)
  })

  it('updateAccessoryState emits once the manager is attached', async () => {
    const api = makeApi({ _matterManager: {} })
    const impl = new MatterAPIImpl(api)

    await impl.updateAccessoryState('uuid-1', 'OnOff', { on: true })

    expect(api.emit).toHaveBeenCalled()
  })
})
