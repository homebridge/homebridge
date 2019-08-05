declare module 'fast-srp-hap' {

  export const params: Record<string, any>;
  export function genKey(num: number, callback: (err: Error, key: Buffer) => void): void;

  export class Server {
    constructor(srpParams: any, salt: Buffer, pair: Buffer, pin: Buffer, key: Buffer);

    setA(a: Buffer): void;
    checkM1(m1: Buffer): void;
    computeB(): Buffer;
    computeK(): Buffer;
    computeM2(): Buffer;
  }
}
