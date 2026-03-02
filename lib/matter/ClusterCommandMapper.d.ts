/**
 * Maps cluster attributes to Matter.js commands
 * This centralizes the logic for converting UI attribute updates to behavior commands
 *
 * Supports all Matter device types including:
 * - Lights (OnOff, Dimmable, Color Temperature, Color, Extended Color)
 * - Switches and Outlets
 * - Fans
 * - Window Coverings (Blinds)
 * - Door Locks
 * - Thermostats
 * - Robotic Vacuums
 */
/**
 * Maps attributes to a Matter.js command for a given cluster
 * @param cluster The cluster name (e.g., 'onOff', 'levelControl')
 * @param attributes The attributes to map
 * @returns Command name and optional arguments, or throws if mapping not found
 *
 * Note: Some attribute changes trigger handlers automatically without explicit commands.
 * In these cases, the mapper returns null, which should be handled by the caller
 * to update state directly instead of invoking a command.
 */
export declare function mapAttributesToCommand(cluster: string, attributes: Record<string, unknown>): {
    command: string;
    args?: Record<string, unknown>;
} | null;
//# sourceMappingURL=ClusterCommandMapper.d.ts.map