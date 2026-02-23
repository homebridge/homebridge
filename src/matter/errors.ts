/**
 * Matter Protocol Errors
 *
 * This module provides error classes that plugin developers can throw
 * to send specific Matter protocol status codes to controllers.
 *
 * When a handler throws one of these errors, the Matter server will send
 * the appropriate status code to the controller (e.g., Home app) instead
 * of crashing the endpoint.
 *
 * @example
 * ```typescript
 * import { MatterStatus } from 'homebridge'
 *
 * handlers: {
 *   onOff: {
 *     on: async () => {
 *       if (deviceIsBusy) {
 *         throw new MatterStatus.Busy('Device is processing another command')
 *       }
 *       if (requestTimedOut) {
 *         throw new MatterStatus.Timeout('Device did not respond in time')
 *       }
 *       // ... control device
 *     }
 *   }
 * }
 * ```
 */

import { Status, StatusResponseError } from '@matter/main/types'

/**
 * Base class for all Matter protocol errors
 * Plugins can throw this directly or use specific error classes below
 */
export class MatterProtocolError extends StatusResponseError {
  constructor(message: string, code: Status, clusterCode?: number) {
    super(message, code, clusterCode)
  }
}

/**
 * Device is busy processing another action (Status.Busy = 156)
 *
 * Use when the device cannot handle the request because it's processing another operation.
 *
 * @example
 * ```typescript
 * throw new MatterStatus.Busy('Device is currently processing another command')
 * ```
 */
export class Busy extends MatterProtocolError {
  constructor(message = 'Device is busy') {
    super(message, Status.Busy)
  }
}

/**
 * Operation timed out (Status.Timeout = 148)
 *
 * Use when the device or operation times out.
 *
 * @example
 * ```typescript
 * throw new MatterStatus.Timeout('Device did not respond within 5 seconds')
 * ```
 */
export class Timeout extends MatterProtocolError {
  constructor(message = 'Operation timed out') {
    super(message, Status.Timeout)
  }
}

/**
 * Value out of range or invalid (Status.ConstraintError = 135)
 *
 * Use when a value is out of bounds or doesn't meet constraints.
 *
 * @example
 * ```typescript
 * throw new MatterStatus.ConstraintError('Brightness must be between 0-254')
 * ```
 */
export class ConstraintError extends MatterProtocolError {
  constructor(message = 'Value out of range or invalid') {
    super(message, Status.ConstraintError)
  }
}

/**
 * Malformed action or invalid values (Status.InvalidAction = 128)
 *
 * Use when the command or action is malformed or has invalid field values.
 *
 * @example
 * ```typescript
 * throw new MatterStatus.InvalidAction('Invalid color value provided')
 * ```
 */
export class InvalidAction extends MatterProtocolError {
  constructor(message = 'Invalid action or values') {
    super(message, Status.InvalidAction)
  }
}

/**
 * Current operational state prevents the action (Status.InvalidInState = 203)
 *
 * Use when the device state prevents the requested operation.
 *
 * @example
 * ```typescript
 * throw new MatterStatus.InvalidInState('Cannot unlock door while security system is armed')
 * ```
 */
export class InvalidInState extends MatterProtocolError {
  constructor(message = 'Operation not allowed in current state') {
    super(message, Status.InvalidInState)
  }
}

/**
 * Generic failure (Status.Failure = 1)
 *
 * Use as a fallback when no specific error applies.
 *
 * @example
 * ```typescript
 * throw new MatterStatus.Failure('Device returned an error')
 * ```
 */
export class Failure extends MatterProtocolError {
  constructor(message = 'Operation failed') {
    super(message, Status.Failure)
  }
}

/**
 * Insufficient resources to process the request (Status.ResourceExhausted = 137)
 *
 * Use when the device has insufficient resources to handle the request.
 *
 * @example
 * ```typescript
 * throw new MatterStatus.ResourceExhausted('Maximum number of scenes reached')
 * ```
 */
export class ResourceExhausted extends MatterProtocolError {
  constructor(message = 'Insufficient resources') {
    super(message, Status.ResourceExhausted)
  }
}

/**
 * The sender does not have sufficient permissions (Status.UnsupportedAccess = 126)
 *
 * Use when access control prevents the operation.
 *
 * @example
 * ```typescript
 * throw new MatterStatus.PermissionDenied('User does not have permission to unlock')
 * ```
 */
export class PermissionDenied extends MatterProtocolError {
  constructor(message = 'Permission denied') {
    super(message, Status.UnsupportedAccess)
  }
}

/**
 * The requested entity was not found (Status.NotFound = 139)
 *
 * Use when a requested resource or entity doesn't exist.
 *
 * @example
 * ```typescript
 * throw new MatterStatus.NotFound('Scene not found')
 * ```
 */
export class NotFound extends MatterProtocolError {
  constructor(message = 'Entity not found') {
    super(message, Status.NotFound)
  }
}

/**
 * Helper to check if an error is a Matter protocol error
 */
export function isMatterProtocolError(error: unknown): error is MatterProtocolError {
  return error instanceof StatusResponseError
}

/**
 * Matter protocol status codes and error classes
 *
 * Use these error classes to signal specific error conditions to Matter controllers.
 * Each error class corresponds to a Matter protocol status code.
 */
export const MatterStatus = {
  MatterProtocolError,
  Busy,
  Timeout,
  ConstraintError,
  InvalidAction,
  InvalidInState,
  Failure,
  ResourceExhausted,
  PermissionDenied,
  NotFound,
  isMatterProtocolError,
}
