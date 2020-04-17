/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "node-persist" {

  export interface InitOptions {
    dir?: string; // default 'persist'
    stringify?: typeof JSON.stringify; // default JSON.stringify
    parse?: typeof JSON.parse; // default JSON.parse
    encoding?: string; // default 'utf8'
    logging?: boolean;
    continuous?: boolean; // default true (instantly persists to disk)
    interval?: false | number; // milliseconds
    ttl?: false | true | number; // can be true for 24h default or a number in MILLISECONDS
  }

  export class LocalStorage {

    constructor(options?: InitOptions);

    initSync(options?: InitOptions): void;
    getItem(key: string): any;
    setItemSync(key: string, value: any): void;
    removeItemSync(key: string): void
    persistSync(): void;

  }

  export function initSync(options?: InitOptions): void;
  export function create(options?: InitOptions): LocalStorage;
  export function getItem(key: string): any;
  export function setItemSync(key: string, data: any): void;
  export function persistSync(): void;
  export function removeItemSync(key: string): void;

}
