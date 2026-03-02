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
import { Status, StatusResponseError } from '@matter/main/types';
/**
 * Base class for all Matter protocol errors
 * Plugins can throw this directly or use specific error classes below
 */
export declare class MatterProtocolError extends StatusResponseError {
    constructor(message: string, code: Status, clusterCode?: number);
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
export declare class Busy extends MatterProtocolError {
    constructor(message?: string);
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
export declare class Timeout extends MatterProtocolError {
    constructor(message?: string);
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
export declare class ConstraintError extends MatterProtocolError {
    constructor(message?: string);
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
export declare class InvalidAction extends MatterProtocolError {
    constructor(message?: string);
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
export declare class InvalidInState extends MatterProtocolError {
    constructor(message?: string);
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
export declare class Failure extends MatterProtocolError {
    constructor(message?: string);
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
export declare class ResourceExhausted extends MatterProtocolError {
    constructor(message?: string);
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
export declare class PermissionDenied extends MatterProtocolError {
    constructor(message?: string);
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
export declare class NotFound extends MatterProtocolError {
    constructor(message?: string);
}
/**
 * Helper to check if an error is a Matter protocol error
 */
export declare function isMatterProtocolError(error: unknown): error is MatterProtocolError;
/**
 * Matter protocol status codes and error classes
 *
 * Use these error classes to signal specific error conditions to Matter controllers.
 * Each error class corresponds to a Matter protocol status code.
 */
export declare const MatterStatus: {
    MatterProtocolError: typeof MatterProtocolError;
    Busy: typeof Busy;
    Timeout: typeof Timeout;
    ConstraintError: typeof ConstraintError;
    InvalidAction: typeof InvalidAction;
    InvalidInState: typeof InvalidInState;
    Failure: typeof Failure;
    ResourceExhausted: typeof ResourceExhausted;
    PermissionDenied: typeof PermissionDenied;
    NotFound: typeof NotFound;
    isMatterProtocolError: typeof isMatterProtocolError;
};
//# sourceMappingURL=errors.d.ts.map