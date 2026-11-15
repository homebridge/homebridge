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
 * The message of an error together with the messages of the errors inside it.
 *
 * matter.js reports a failure as an outer error with a general text ("Behaviors
 * have errors") and puts the reason ("currentLevel: Value 300 is above the
 * maximum of 254") in `errors` or `cause`. A plugin that logs `error.message`
 * needs the reason, so this joins them, outermost first.
 */
export function describeError(error: unknown): string {
  const messages: string[] = []
  const seen = new Set<unknown>()
  const visit = (value: unknown, depth: number): void => {
    if (value === undefined || value === null || seen.has(value) || depth > 8) {
      return
    }
    seen.add(value)
    if (!(value instanceof Error)) {
      messages.push(String(value))
      return
    }
    // A wrapper often repeats the text of what it wraps
    if (value.message && !messages.some(message => message.includes(value.message))) {
      messages.push(value.message)
    }
    const inner = (value as { errors?: unknown }).errors
    if (Array.isArray(inner)) {
      for (const item of inner) {
        visit(item, depth + 1)
      }
    }
    visit(value.cause, depth + 1)
  }
  visit(error, 0)
  return messages.join(': ') || 'Unknown error'
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
    super(message, details?.originalError
      ? { cause: details.originalError }
      : undefined)
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

/**
 * Wrap a failure for the plugin: the text says what was being done and why it
 * failed, and the original error is kept as `cause`. An error that already is
 * a MatterDeviceError has its own full text and is passed on as it is.
 */
export function deviceErrorFrom(action: string, error: unknown): MatterDeviceError {
  if (error instanceof MatterDeviceError) {
    return error
  }
  return new MatterDeviceError(`${action}: ${describeError(error)}`, {
    originalError: error instanceof Error
      ? error
      : new Error(String(error)),
  })
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
