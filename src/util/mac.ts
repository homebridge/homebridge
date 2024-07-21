import crypto from "crypto";

const validMac = /^([0-9A-F]{2}:){5}([0-9A-F]{2})$/;

export type MacAddress = string;

export function validMacAddress(address: string): boolean {
  return validMac.test(address);
}

export function generate(data: string | Buffer | NodeJS.TypedArray | DataView): MacAddress {
  const sha256sum = crypto.createHash("sha256");
  sha256sum.update(data);
  const s = sha256sum.digest("hex");

  let i = 0;
  return "xx:xx:xx:xx:xx:xx".replace(/x/g, () => s[i++]).toUpperCase();
}