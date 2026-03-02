"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatterStatus = exports.NotFound = exports.PermissionDenied = exports.ResourceExhausted = exports.Failure = exports.InvalidInState = exports.InvalidAction = exports.ConstraintError = exports.Timeout = exports.Busy = exports.MatterProtocolError = void 0;
exports.isMatterProtocolError = isMatterProtocolError;
const types_1 = require("@matter/main/types");
/**
 * Base class for all Matter protocol errors
 * Plugins can throw this directly or use specific error classes below
 */
class MatterProtocolError extends types_1.StatusResponseError {
    constructor(message, code, clusterCode) {
        super(message, code, clusterCode);
    }
}
exports.MatterProtocolError = MatterProtocolError;
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
class Busy extends MatterProtocolError {
    constructor(message = 'Device is busy') {
        super(message, types_1.Status.Busy);
    }
}
exports.Busy = Busy;
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
class Timeout extends MatterProtocolError {
    constructor(message = 'Operation timed out') {
        super(message, types_1.Status.Timeout);
    }
}
exports.Timeout = Timeout;
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
class ConstraintError extends MatterProtocolError {
    constructor(message = 'Value out of range or invalid') {
        super(message, types_1.Status.ConstraintError);
    }
}
exports.ConstraintError = ConstraintError;
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
class InvalidAction extends MatterProtocolError {
    constructor(message = 'Invalid action or values') {
        super(message, types_1.Status.InvalidAction);
    }
}
exports.InvalidAction = InvalidAction;
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
class InvalidInState extends MatterProtocolError {
    constructor(message = 'Operation not allowed in current state') {
        super(message, types_1.Status.InvalidInState);
    }
}
exports.InvalidInState = InvalidInState;
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
class Failure extends MatterProtocolError {
    constructor(message = 'Operation failed') {
        super(message, types_1.Status.Failure);
    }
}
exports.Failure = Failure;
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
class ResourceExhausted extends MatterProtocolError {
    constructor(message = 'Insufficient resources') {
        super(message, types_1.Status.ResourceExhausted);
    }
}
exports.ResourceExhausted = ResourceExhausted;
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
class PermissionDenied extends MatterProtocolError {
    constructor(message = 'Permission denied') {
        super(message, types_1.Status.UnsupportedAccess);
    }
}
exports.PermissionDenied = PermissionDenied;
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
class NotFound extends MatterProtocolError {
    constructor(message = 'Entity not found') {
        super(message, types_1.Status.NotFound);
    }
}
exports.NotFound = NotFound;
/**
 * Helper to check if an error is a Matter protocol error
 */
function isMatterProtocolError(error) {
    return error instanceof types_1.StatusResponseError;
}
/**
 * Matter protocol status codes and error classes
 *
 * Use these error classes to signal specific error conditions to Matter controllers.
 * Each error class corresponds to a Matter protocol status code.
 */
exports.MatterStatus = {
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
};
//# sourceMappingURL=errors.js.map