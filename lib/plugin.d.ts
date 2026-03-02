import type { AccessoryIdentifier, AccessoryName, AccessoryPluginConstructor, API, DynamicPlatformPlugin, PlatformIdentifier, PlatformName, PlatformPluginConstructor, PluginIdentifier, PluginName } from './api.js';
import type { PackageJSON } from './pluginManager.js';
/**
 * Represents a loaded Homebridge plugin.
 */
export declare class Plugin {
    private readonly pluginName;
    private readonly scope?;
    private readonly pluginPath;
    disabled: boolean;
    readonly version: string;
    private readonly main;
    private mainPath?;
    private loadContext?;
    private pluginInitializer?;
    private readonly registeredAccessories;
    private readonly registeredPlatforms;
    private readonly activeDynamicPlatforms;
    constructor(name: PluginName, path: string, packageJSON: PackageJSON, scope?: string);
    getPluginIdentifier(): PluginIdentifier;
    getPluginPath(): string;
    registerAccessory(name: AccessoryName, constructor: AccessoryPluginConstructor): void;
    registerPlatform(name: PlatformName, constructor: PlatformPluginConstructor): void;
    getAccessoryConstructor(accessoryIdentifier: AccessoryIdentifier | AccessoryName): AccessoryPluginConstructor;
    getPlatformConstructor(platformIdentifier: PlatformIdentifier | PlatformName): PlatformPluginConstructor;
    assignDynamicPlatform(platformIdentifier: PlatformIdentifier | PlatformName, platformPlugin: DynamicPlatformPlugin): void;
    getActiveDynamicPlatform(platformName: PlatformName): DynamicPlatformPlugin | undefined;
    load(): Promise<void>;
    initialize(api: API): void | Promise<void>;
    /**
     * Reload the plugin by invalidating the module cache and loading it again.
     * This allows for hot-reloading of plugins without restarting the entire Homebridge process.
     */
    reload(): Promise<void>;
}
//# sourceMappingURL=plugin.d.ts.map