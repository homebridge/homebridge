/**
 * Matter.js Log Formatter
 *
 * Formats Matter.js library logs to match the homebridge log format and color scheme.
 * This ensures consistent logging output across Homebridge and Matter.js.
 */
/**
 * Create a custom log formatter that matches the homebridge format.
 * Format: [timestamp] [Matter:Facility] message
 * Timestamp format matches system locale (via toLocaleString()).
 *
 * Log level color mapping:
 * - Matter DEBUG/INFO → gray (Homebridge debug)
 * - Matter NOTICE → no color (Homebridge info)
 * - Matter WARN → yellow (Homebridge warn)
 * - Matter ERROR/FATAL → red (Homebridge error)
 */
export declare function createHomebridgeLogFormatter(): (diagnostic: unknown) => string;
//# sourceMappingURL=logFormatter.d.ts.map