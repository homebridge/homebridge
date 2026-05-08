/**
 * Internal Matter error classes
 *
 * Kept in a dedicated lightweight module so consumers like
 * `ChildBridgeMatterMessageHandler` can `instanceof`-check the sentinel
 * (MatterAccessoryNotOnBridgeError) without dragging in the heavy
 * `@matter/*` runtime imports that live in `./types.ts`.
 *
 * IMPORTANT: never add a runtime `@matter/*` import to this file —
 * `matterLazyLoading.spec.ts` treats it as a lightweight module that
 * core / lightweight consumers are allowed to import eagerly.
 *
 * Not to be confused with `./errors.ts`, which holds the plugin-facing
 * `MatterStatus.*` Matter protocol status errors (those subclass
 * `@matter/main`'s `StatusResponseError` and are intentionally heavy).
 */

export enum MatterErrorType {
  INITIALIZATION = 'INITIALIZATION',
  NETWORK = 'NETWORK',
  COMMISSIONING = 'COMMISSIONING',
  DEVICE_SYNC = 'DEVICE_SYNC',
  SERVER = 'SERVER',
  STORAGE = 'STORAGE',
  CONFIGURATION = 'CONFIGURATION',
  DEVICE_ERROR = 'DEVICE_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Matter error details interface
 */
export interface MatterErrorDetails {
  type?: MatterErrorType
  recoverable?: boolean
  code?: string
  context?: string
  originalError?: Error
}

/**
 * Base internal Matter error — categorises a failure for the
 * MatterErrorHandler and adds a timestamp / recoverable flag on top of
 * Node's plain Error.
 */
export class MatterError extends Error {
  public readonly type: MatterErrorType
  public readonly timestamp: Date
  public readonly recoverable: boolean

  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: MatterErrorDetails,
  ) {
    super(message)
    this.name = 'MatterError'
    this.type = details?.type ?? MatterErrorType.UNKNOWN
    this.timestamp = new Date()
    this.recoverable = details?.recoverable ?? true
  }
}

export class MatterCommissioningError extends MatterError {
  constructor(message: string, details?: MatterErrorDetails) {
    super(message, 'COMMISSIONING_ERROR', { ...details, type: MatterErrorType.COMMISSIONING })
    this.name = 'MatterCommissioningError'
  }
}

export class MatterStorageError extends MatterError {
  constructor(message: string, details?: MatterErrorDetails) {
    super(message, 'STORAGE_ERROR', { ...details, type: MatterErrorType.STORAGE })
    this.name = 'MatterStorageError'
  }
}

export class MatterDeviceError extends MatterError {
  constructor(message: string, details?: MatterErrorDetails) {
    super(message, 'DEVICE_ERROR', { ...details, type: MatterErrorType.DEVICE_ERROR })
    this.name = 'MatterDeviceError'
  }
}

/**
 * Sentinel thrown when a control command is routed to a bridge that does not
 * own the target accessory. The parent broadcasts requests to multiple
 * candidate bridges; bridges that don't have the UUID throw this so the
 * dispatcher can swallow it silently rather than emitting a spurious "not
 * found" response back to the UI.
 *
 * Identified by `instanceof` rather than message-string matching so future
 * wording changes don't silently break the routing filter.
 */
export class MatterAccessoryNotOnBridgeError extends MatterDeviceError {
  constructor(uuid: string) {
    super(`Accessory ${uuid} not found on this bridge`)
    this.name = 'MatterAccessoryNotOnBridgeError'
  }
}

export class MatterNetworkError extends MatterError {
  constructor(message: string, details?: MatterErrorDetails) {
    super(message, 'NETWORK_ERROR', { ...details, type: MatterErrorType.NETWORK })
    this.name = 'MatterNetworkError'
  }
}
