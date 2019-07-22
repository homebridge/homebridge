import { EventEmitter } from 'events';

import { Characteristic, Service } from 'hap-nodejs';

import { BridgeSetupSession } from './bridgeSetupSession';

export class BridgeSetupManager extends EventEmitter {
    //@ts-ignore
    service;
    session?: BridgeSetupSession = undefined;
    stateCharacteristic: HAPNodeJS.Characteristic;
    versionCharacteristic: HAPNodeJS.Characteristic;
    controlPointCharacteristic: HAPNodeJS.Characteristic;
    configurablePlatformPlugins: any;

    constructor() {
        super();
        //@ts-ignore
        this.service = new Service(null, "49FB9D4D-0FEA-4BF1-8FA6-E7B18AB86DCE", undefined);
        //@ts-ignore
        this.stateCharacteristic = new Characteristic("State", "77474A2F-FA98-485E-97BE-4762458774D8", {
            format: Characteristic.Formats.UINT8,
            minValue: 0,
            maxValue: 1,
            minStep: 1,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
        });
        this.stateCharacteristic.setValue(0);
        this.service.addCharacteristic(this.stateCharacteristic);
        //@ts-ignore
        this.versionCharacteristic = new Characteristic("Version", "FD9FE4CC-D06F-4FFE-96C6-595D464E1026", {
            format: Characteristic.Formats.STRING,
            minValue: 0,
            maxValue: 1,
            minStep: 1,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
        });
        this.versionCharacteristic.setValue("1.0");
        this.service.addCharacteristic(this.versionCharacteristic);
        //@ts-ignore
        this.controlPointCharacteristic = new Characteristic("Control Point", "5819A4C2-E1B0-4C9D-B761-3EB1AFF43073", {
            format: Characteristic.Formats.DATA,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
        });
        //@ts-ignore
        this.controlPointCharacteristic.on('get', this.handleReadRequest);
        //@ts-ignore
        this.controlPointCharacteristic.on('set', this.handleWriteRequest);
        //@ts-ignore
        this.controlPointCharacteristic.setValue(null);
        this.service.addCharacteristic(this.controlPointCharacteristic);
        this.configurablePlatformPlugins = undefined;
    }
    handleReadRequest = (callback: HAPNodeJS.CharacteristicGetCallback, context: any) => {
        if (!context) {
            return;
        }
        if (!this.session) {
            //@ts-ignore
            callback(null, null);
        }
        else {
            this.session.handleReadRequest(callback);
        }
    }
    handleWriteRequest = (value: string, callback: HAPNodeJS.CharacteristicSetCallback, context: any) => {
        if (!context) {
            callback();
            return;
        }
        var data = new Buffer(value, 'base64');
        var request = JSON.parse(data.toString());
        callback();
        if (!this.session || this.session.sessionUUID !== request.sid) {
            if (this.session) {
                this.session.removeAllListeners();
                this.session.validSession = false;
            }
            this.session = new BridgeSetupSession(this.stateCharacteristic, this.controlPointCharacteristic);
            this.session.configurablePlatformPlugins = this.configurablePlatformPlugins;
            this.session.on('newConfig', (type: any, name: any, replace: any, config: any) => {
                this.emit('newConfig', type, name, replace, config);
            });
            this.session.on('requestCurrentConfig', (callback: any) => {
                this.emit('requestCurrentConfig', callback);
            });
            this.session.on('end', () => {
                this.session = undefined;
            });
        }
        this.session!.handleWriteRequest(request);
    }
}
