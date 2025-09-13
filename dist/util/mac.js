/* global NodeJS */
import { createHash } from 'node:crypto';
const validMac = /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/;
export function validMacAddress(address) {
    return validMac.test(address);
}
export function generate(data) {
    const sha1sum = createHash('sha1');
    sha1sum.update(data);
    const s = sha1sum.digest('hex');
    let i = 0;
    return 'xx:xx:xx:xx:xx:xx'.replace(/x/g, () => s[i++]).toUpperCase();
}
//# sourceMappingURL=mac.js.map