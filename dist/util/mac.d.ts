import type { Buffer } from 'node:buffer';
export type MacAddress = string;
export declare function validMacAddress(address: string): boolean;
export declare function generate(data: string | Buffer | NodeJS.TypedArray | DataView): MacAddress;
//# sourceMappingURL=mac.d.ts.map