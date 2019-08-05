// declare module 'hap-nodejs/lib/AccessoryLoader' {
//
//   // import Characteristic = HAPNodeJS.Characteristic;
//   // import Service = HAPNodeJS.Service;
//   // import Accessory = HAPNodeJS.Accessory;
//
//   export function loadDirectory(dir: string): any;
//
//   export function parseAccessoryJSON(json: {}): Accessory;
//   export function parseServiceJSON(json: {}): Service;
//   export function parseCharacteristicJSON(json: {}): Characteristic;
//
// }
//
// declare module 'hap-nodejs/lib/Bridge' {
//
//   import Accessory = HAPNodeJS.Accessory;
//
//   // @ts-ignore
//   export class Bridge extends Accessory {
//     _isBridge: boolean;
//
//     constructor(displayName: string, uuid: string);
//   }
// }
//
// declare module 'hap-nodejs/lib/util/once' {
//   export function once(func: Function): Function;
// }
