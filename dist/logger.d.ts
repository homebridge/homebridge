/**
 * Log levels to indicate importance of the logged message.
 * Every level corresponds to a certain color.
 *
 * - INFO: no color
 * - SUCCESS: green
 * - WARN: yellow
 * - ERROR: red
 * - DEBUG: gray
 *
 * Messages with DEBUG level are only displayed if explicitly enabled.
 */
export declare const enum LogLevel {
    INFO = "info",
    SUCCESS = "success",
    WARN = "warn",
    ERROR = "error",
    DEBUG = "debug"
}
/**
 * Represents a logging device which can be used directly as a function (for INFO logging)
 * but also has dedicated logging functions for respective logging levels.
 */
export interface Logging {
    prefix: string;
    (message: string, ...parameters: any[]): void;
    info: (message: string, ...parameters: any[]) => void;
    success: (message: string, ...parameters: any[]) => void;
    warn: (message: string, ...parameters: any[]) => void;
    error: (message: string, ...parameters: any[]) => void;
    debug: (message: string, ...parameters: any[]) => void;
    log: (level: LogLevel, message: string, ...parameters: any[]) => void;
}
/**
 * Logger class
 */
export declare class Logger {
    static readonly internal: Logger;
    private static readonly loggerCache;
    private static debugEnabled;
    private static timestampEnabled;
    readonly prefix?: string;
    constructor(prefix?: string);
    /**
     * Creates a new Logging device with a specified prefix.
     *
     * @param prefix {string} - the prefix of the logger
     */
    static withPrefix(prefix: string): Logging;
    /**
     * Turns on debug level logging. Off by default.
     *
     * @param enabled {boolean}
     */
    static setDebugEnabled(enabled?: boolean): void;
    /**
     * Turns on inclusion of timestamps in log messages. On by default.
     *
     * @param enabled {boolean}
     */
    static setTimestampEnabled(enabled?: boolean): void;
    /**
     * Forces color in logging output, even if it seems like color is unsupported.
     */
    static forceColor(): void;
    info(message: string, ...parameters: any[]): void;
    success(message: string, ...parameters: any[]): void;
    warn(message: string, ...parameters: any[]): void;
    error(message: string, ...parameters: any[]): void;
    debug(message: string, ...parameters: any[]): void;
    log(level: LogLevel, message: string, ...parameters: any[]): void;
}
/**
 * Gets the prefix
 * @param prefix
 */
export declare function getLogPrefix(prefix: string): string;
//# sourceMappingURL=logger.d.ts.map