import * as hapNodeJs from "hap-nodejs";
export * from "hap-nodejs";

export type HAP = typeof hapNodeJs;
export type HAPLegacyTypes = typeof hapNodeJs.LegacyTypes;

export { LogLevel, Logging, Logger } from "./logger";
export * from "./user";
export * from "./platformAccessory";
export { // basically everything but the actual API implementation
  PluginIdentifier,
  PluginName,
  ScopedPluginName,
  AccessoryName,
  PlatformName,

  AccessoryIdentifier,
  PlatformIdentifier,
  PluginType,

  PluginInitializer,
  AccessoryPluginConstructor,
  AccessoryPlugin,
  PlatformPluginConstructor,
  DynamicPlatformPlugin,
  StaticPlatformPlugin,
  IndependentPlatformPlugin,

  APIEvent,
  API,
} from "./api";
export {
  HomebridgeOptions,
  HomebridgeConfig,
  BridgeConfiguration,
  AccessoryConfig,
  PlatformConfig,
  ExternalPortsConfiguration,
} from "./server";
