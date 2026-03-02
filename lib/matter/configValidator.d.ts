/**
 * Matter Configuration Validation
 *
 * Provides validation utilities and orchestration for Matter configuration objects.
 * Includes both low-level validation primitives and high-level validation methods.
 */
import type { AccessoryConfig, PlatformConfig } from '../bridgeService.js';
/**
 * Port validation result
 */
export interface PortValidationResult {
    valid: boolean;
    error?: string;
    warning?: string;
}
/**
 * Sanitization result
 */
export interface SanitizationResult<T> {
    value: T;
    warnings: string[];
}
export interface MatterConfigValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Validate a Matter port number
 *
 * @param port - Port number to validate
 * @param checkConflicts - Whether to check for known conflicting ports
 * @returns Validation result with error/warning messages
 */
export declare function validatePort(port: number, checkConflicts?: boolean): PortValidationResult;
/**
 * Sanitize a unique ID for Matter filesystem storage
 *
 * Removes colons from MAC addresses and converts to uppercase for consistency.
 * Example: "AB:CD:EF:12:34:56" -> "ABCDEF123456"
 *
 * @param uniqueId - Unique identifier to sanitize (typically a MAC address)
 * @returns Sanitized unique ID and any warnings
 */
export declare function sanitizeUniqueId(uniqueId: string): SanitizationResult<string>;
/**
 * Truncate a string to a maximum length with warning
 *
 * @param value - String to truncate
 * @param maxLength - Maximum allowed length
 * @param fieldName - Name of the field (for warnings)
 * @returns Truncated value and any warnings
 */
export declare function truncateString(value: string, maxLength: number, fieldName: string): SanitizationResult<string>;
/**
 * Check for port conflicts between HAP and Matter ports
 *
 * @param hapPort - HAP bridge port
 * @param matterPort - Matter bridge port
 * @returns Warning message if ports are too close, undefined otherwise
 */
export declare function checkPortProximity(hapPort: number, matterPort: number): string | undefined;
/**
 * Validate Matter configuration for production readiness
 */
export declare class MatterConfigValidator {
    /**
     * Validate a Matter configuration object
     */
    static validate(config: Record<string, unknown>): MatterConfigValidationResult;
    private static validatePort;
    /**
     * Validate child Matter configuration (_bridge.matter property)
     */
    static validateChildMatterConfig(config: PlatformConfig | AccessoryConfig, configType: 'platform' | 'accessory', identifier: string): MatterConfigValidationResult;
    /**
     * Validate all child Matter configurations in a config
     */
    static validateAllChildMatterConfigs(platforms: PlatformConfig[], accessories: AccessoryConfig[]): MatterConfigValidationResult;
}
//# sourceMappingURL=configValidator.d.ts.map