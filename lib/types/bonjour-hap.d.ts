declare module 'bonjour-hap' {

  export enum Protocols {
    TCP = 'tcp',
    UDP = 'udp',
  }

  export type Nullable<T> = T | null;
  export type TxtRecord = Record<string, string>;

  export class Service {
    name: string;
    type: string;
    subtypes: Nullable<string[]>;
    protocol: Protocols;
    host: string;
    port: number;
    fqdn: string;
    txt: Nullable<Record<string, string>>;
    published: boolean;

    start(): void;
    stop(callback?: () => void): void;
    destroy(): void;
    updateTxt(txt: TxtRecord): void;
  }

  export type PublishOptions = {
    category?: any,
    host?: string;
    name?: string;
    pincode?: string;
    port: number;
    protocol?: Protocols;
    subtypes?: string[];
    txt?: Record<string, string>;
    type?: string;
    username?: string;
  };

  export class BonjourHap {
    publish(options: PublishOptions): Service;
    unpublishAll(callback: () => void): void;
    destroy(): void;
  }


  export type MulticastOptions = {
    multicast: boolean;
    interface: string;
    port: number;
    ip: string;
    ttl: number;
    loopback: boolean;
    reuseAddr: boolean;
  };
  function createWithOptions(options: MulticastOptions): BonjourHap;

  export default createWithOptions;
}
