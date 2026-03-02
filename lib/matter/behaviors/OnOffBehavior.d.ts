/**
 * OnOff Cluster Behavior
 *
 * Handles on/off commands for lights, switches, and outlets
 */
import { OnOffServer } from '@matter/main/behaviors/on-off';
export declare class HomebridgeOnOffServer extends OnOffServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    private getRegistry;
    /**
     * Handle 'on' command
     */
    on(): Promise<void>;
    /**
     * Handle 'off' command
     */
    off(): Promise<void>;
    /**
     * Handle 'toggle' command
     */
    toggle(): Promise<void>;
}
//# sourceMappingURL=OnOffBehavior.d.ts.map