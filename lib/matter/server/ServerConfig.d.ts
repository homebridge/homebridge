/**
 * Matter Server Configuration
 *
 * Constants and configuration validation for the Matter server.
 */
import type { MatterServerConfig } from '../sharedTypes.js';
export declare const DEFAULT_MATTER_PORT = 5540;
export declare const DEFAULT_VENDOR_ID = 65521;
export declare const DEFAULT_PRODUCT_ID = 32769;
export declare const MAX_DEVICES_PER_BRIDGE = 1000;
export declare const SERVER_READY_TIMEOUT_MS = 5000;
export declare const SERVER_READY_POLL_INTERVAL_MS = 100;
export declare const SERVER_INIT_DELAY_MS = 200;
export declare const MAX_PASSCODE_ATTEMPTS = 100;
/**
 * Validate and sanitize Matter server configuration
 * Throws descriptive errors if configuration is invalid
 */
export declare function validateAndSanitizeConfig(config: MatterServerConfig): MatterServerConfig;
//# sourceMappingURL=ServerConfig.d.ts.map