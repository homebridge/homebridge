/**
 * Cluster Behavior Map
 *
 * Single authoritative mapping from cluster names to custom Homebridge behavior classes.
 * Consolidates the duplicate maps that existed in server.ts and serverHelpers.ts.
 */
import type { Behavior } from '@matter/node';
type BehaviorType = Behavior.Type;
/**
 * Maps cluster names to custom Homebridge behavior classes.
 *
 * The "core" map contains only clusters with user-triggered commands that need
 * custom behaviors (used by server.ts for the CLUSTER_BEHAVIOR_MAP).
 *
 * The "full" map adds sensor/measurement clusters that don't have user commands
 * but still need custom behaviors for state management.
 */
export declare const CORE_CLUSTER_BEHAVIOR_MAP: Record<string, BehaviorType>;
/**
 * Full cluster behavior map including sensor/measurement behaviors.
 * Used by serverHelpers.ts for behavior resolution.
 */
export declare const FULL_CLUSTER_BEHAVIOR_MAP: Record<string, BehaviorType>;
export {};
//# sourceMappingURL=BehaviorMap.d.ts.map