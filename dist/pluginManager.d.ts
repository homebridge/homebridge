import type { AccessoryIdentifier, AccessoryName, HomebridgeAPI, PlatformIdentifier, PlatformName, PluginIdentifier, PluginName } from './api.js';
import { Plugin } from './plugin.js';
export interface PackageJSON {
    name: string;
    version: string;
    keywords?: string[];
    exports?: string | Record<string, string | Record<string, string>>;
    main?: string;
    /**
     * When set as module, it marks .js file to be treated as ESM.
     * See https://nodejs.org/dist/latest-v14.x/docs/api/esm.html#esm_enabling
     */
    type?: 'module' | 'commonjs';
    engines?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
}
export interface PluginManagerOptions {
    /**
     * Additional path to search for plugins in. Specified relative to the current working directory.
     */
    customPluginPath?: string;
    /**
     * If set, only load plugins from the customPluginPath, if set, otherwise only from the primary global node_modules.
     */
    strictPluginResolution?: boolean;
    /**
     * When defined, only plugins specified here will be initialized.
     */
    activePlugins?: PluginIdentifier[];
    /**
     * Plugins that are marked as disabled and whose corresponding config blocks should be ignored
     */
    disabledPlugins?: PluginIdentifier[];
}
/**
 * Utility which exposes methods to search for installed Homebridge plugins
 */
export declare class PluginManager {
    private static readonly PLUGIN_IDENTIFIER_PATTERN;
    private readonly api;
    private readonly searchPaths;
    private readonly strictPluginResolution;
    private readonly activePlugins?;
    private readonly disabledPlugins?;
    private readonly plugins;
    private readonly pluginIdentifierTranslation;
    private readonly accessoryToPluginMap;
    private readonly platformToPluginMap;
    private currentInitializingPlugin?;
    constructor(api: HomebridgeAPI, options?: PluginManagerOptions);
    static isQualifiedPluginIdentifier(identifier: string): boolean;
    static extractPluginName(name: string): PluginName;
    static extractPluginScope(name: string): string;
    static getAccessoryName(identifier: AccessoryIdentifier): AccessoryName;
    static getPlatformName(identifier: PlatformIdentifier): PlatformIdentifier;
    static getPluginIdentifier(identifier: AccessoryIdentifier | PlatformIdentifier): PluginIdentifier;
    initializeInstalledPlugins(): Promise<void>;
    initializePlugin(plugin: Plugin, identifier: string): Promise<void>;
    private handleRegisterAccessory;
    private handleRegisterPlatform;
    getPluginForAccessory(accessoryIdentifier: AccessoryIdentifier | AccessoryName): Plugin;
    getPluginForPlatform(platformIdentifier: PlatformIdentifier | PlatformName): Plugin;
    hasPluginRegistered(pluginIdentifier: PluginIdentifier): boolean;
    getPlugin(pluginIdentifier: PluginIdentifier): Plugin | undefined;
    getPluginByActiveDynamicPlatform(platformName: PlatformName): Plugin | undefined;
    /**
     * Gets all plugins installed on the local system
     */
    private loadInstalledPlugins;
    loadPlugin(absolutePath: string): Plugin;
    private static loadPackageJSON;
    private loadDefaultPaths;
    private addNpmPrefixToSearchPaths;
}
//# sourceMappingURL=pluginManager.d.ts.map