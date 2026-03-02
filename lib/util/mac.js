"use strict";
/* global NodeJS */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validMacAddress = validMacAddress;
exports.generate = generate;
const node_crypto_1 = require("node:crypto");
const validMac = /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/;
function validMacAddress(address) {
    return validMac.test(address);
}
function generate(data) {
    const sha1sum = (0, node_crypto_1.createHash)('sha1');
    sha1sum.update(data);
    const s = sha1sum.digest('hex');
    let i = 0;
    return 'xx:xx:xx:xx:xx:xx'.replace(/x/g, () => s[i++]).toUpperCase();
}
//# sourceMappingURL=mac.js.map