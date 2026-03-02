/**
 * Thermostat Cluster Behavior
 *
 * Handles thermostat commands for heating and cooling systems
 */
import type { Thermostat } from '@matter/main/clusters';
import { ThermostatServer } from '@matter/main/behaviors/thermostat';
/**
 * Custom Thermostat Server that calls plugin handlers
 */
export declare class HomebridgeThermostatServer extends ThermostatServer {
    #private;
    /**
     * Get the registry for this behavior's endpoint
     */
    private getRegistry;
    initialize(): void;
    setpointRaiseLower(request: Thermostat.SetpointRaiseLowerRequest): Promise<void>;
}
//# sourceMappingURL=ThermostatBehavior.d.ts.map