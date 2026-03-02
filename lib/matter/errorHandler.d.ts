import { MatterError } from './types.js';
/**
 * Simplified Matter Error Handler
 * Focuses on proper error categorization and user-friendly logging
 */
export declare class MatterErrorHandler {
    private static instance;
    private constructor();
    static getInstance(): MatterErrorHandler;
    /**
     * Handle a Matter error with appropriate logging
     */
    handleError(error: Error | MatterError, context?: string): Promise<void>;
    /**
     * Categorize a generic error into a typed MatterError
     */
    private categorizeError;
    /**
     * Log error with appropriate severity and user-friendly messages
     */
    private logError;
}
export declare const errorHandler: MatterErrorHandler;
//# sourceMappingURL=errorHandler.d.ts.map