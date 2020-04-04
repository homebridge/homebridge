import { EventEmitter } from "events";
import {
  Characteristic,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  Formats,
  Perms,
  Service,
} from "hap-nodejs";
import { BridgeSetupSession, BridgeSetupSessionEvent, RequestCurrentConfigCallback } from "./bridgeSetupSession";
import { Request } from "./bridgeSetupApi";
import { ConfigurablePlatformPlugin, PlatformIdentifier, PlatformName, PluginType } from "../api";
import { AccessoryConfig, PlatformConfig } from "../server";

export class BridgeSetupManagerState extends Characteristic {

    static readonly UUID = "49FB9D4D-0FEA-4BF1-8FA6-E7B18AB86DCE";

    constructor() {
      super("Bridge Setup Manager State", BridgeSetupManagerState.UUID);
      this.setProps({
        format: Formats.UINT8,
        minValue: 0,
        maxValue: 1,
        minStep: 1,
        perms: [Perms.NOTIFY, Perms.PAIRED_READ],
      });
      this.value = this.getDefaultValue();
    }

}

export class BridgeSetupManagerControlPoint extends Characteristic {

    static readonly UUID = "5819A4C2-E1B0-4C9D-B761-3EB1AFF43073";

    constructor() {
      super("Bridge Setup Manager Control Point", BridgeSetupManagerControlPoint.UUID);
      this.setProps({
        format: Formats.DATA, // base64 encoded json payload
        perms: [Perms.NOTIFY, Perms.PAIRED_READ, Perms.PAIRED_WRITE],
      });
      this.value = this.getDefaultValue();
    }

}

export class BridgeSetupManagerVersion extends Characteristic {

    static readonly UUID = "FD9FE4CC-D06F-4FFE-96C6-595D464E1026";

    constructor() {
      super("Bridge Setup Manager Version", BridgeSetupManagerVersion.UUID);
      this.setProps({
        format: Formats.STRING,
        perms: [Perms.PAIRED_READ],
      });
      this.value = this.getDefaultValue();
    }
}

export class BridgeSetupManagement extends Service {

    static readonly UUID = "49FB9D4D-0FEA-4BF1-8FA6-E7B18AB86DCE";

    constructor(displayName: string, subtype: string) {
      super(displayName, BridgeSetupManagement.UUID, subtype);

      // Required Characteristics
      this.addCharacteristic(BridgeSetupManagerState);
      this.addCharacteristic(BridgeSetupManagerControlPoint);
      this.addCharacteristic(BridgeSetupManagerVersion);
    }

}

export enum BridgeSetupManagerEvent {
    NEW_CONFIG = "newConfig",
    REQUEST_CURRENT_CONFIG = "requestCurrentConfig",
}

export declare interface BridgeSetupManager {

    // "newConfig" for type Accessory is actually unsupported
    on(event: "newConfig", listener: (type: PluginType, name: PlatformName | PlatformIdentifier, replace: boolean, config: PlatformConfig | AccessoryConfig) => void): this;
    on(event: "requestCurrentConfig", listener: (callback: RequestCurrentConfigCallback) => void): this;

    emit(event: BridgeSetupManagerEvent.NEW_CONFIG, type: PluginType, name: PlatformName | PlatformIdentifier, replace: boolean, config: PlatformConfig | AccessoryConfig): boolean;
    emit(event: BridgeSetupManagerEvent.REQUEST_CURRENT_CONFIG, callback: RequestCurrentConfigCallback): boolean;

}

// this is some ancient stuff lol
export class BridgeSetupManager extends EventEmitter {

    private static readonly version = "1.0";

    private readonly configurablePlatformPlugins: Map<PlatformName | PlatformIdentifier, ConfigurablePlatformPlugin>;

    private readonly managementService: BridgeSetupManagement;
    private readonly stateCharacteristic: BridgeSetupManagerState;
    private readonly controlPointCharacteristic: BridgeSetupManagerControlPoint;

    session?: BridgeSetupSession;

    constructor(configurablePlatformPlugins: Map<PlatformName | PlatformIdentifier, ConfigurablePlatformPlugin>) {
      super();
      this.configurablePlatformPlugins = configurablePlatformPlugins;

      this.managementService = new BridgeSetupManagement("", "");
      this.stateCharacteristic = this.managementService.getCharacteristic(BridgeSetupManagerState)!;
      this.controlPointCharacteristic = this.managementService.getCharacteristic(BridgeSetupManagerControlPoint)!;

      this.managementService.setCharacteristic(BridgeSetupManagerVersion, BridgeSetupManager.version);

        this.controlPointCharacteristic!
          .on(CharacteristicEventTypes.GET, this.handleReadRequest.bind(this))
          .on(CharacteristicEventTypes.SET, this.handleWriteRequest.bind(this));
    }

    public getService(): BridgeSetupManagement {
      return this.managementService;
    }

    private handleReadRequest(callback: CharacteristicGetCallback): void {
      if (!this.session) {
        callback(undefined, null);
      } else {
        this.session.handleReadRequest(callback);
      }
    }

    private handleWriteRequest(value: CharacteristicValue, callback: CharacteristicSetCallback): void {
      const data = new Buffer(value as string, "base64");
      const request: Request = JSON.parse(data.toString());
      callback();

      if (this.session && this.session.sessionUUID !== request.sid) {
        this.session.removeAllListeners();
        this.session.validSession = false;
        this.session = undefined;
      }

      if (!this.session) {
        this.session = new BridgeSetupSession(this.configurablePlatformPlugins, this.stateCharacteristic, this.controlPointCharacteristic);

        this.session.on(BridgeSetupSessionEvent.NEW_CONFIG, (type, name, replace, config) => {
          this.emit(BridgeSetupManagerEvent.NEW_CONFIG, type, name, replace, config);
        });
        this.session.on(BridgeSetupSessionEvent.REQUEST_CURRENT_CONFIG, callback => {
          this.emit(BridgeSetupManagerEvent.REQUEST_CURRENT_CONFIG, callback);
        });
        this.session.on(BridgeSetupSessionEvent.END, () => {
          this.session = undefined;
        });
      }

      this.session.handleWriteRequest(request);
    }

}
