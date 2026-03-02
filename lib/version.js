"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = getVersion;
exports.getRequiredNodeVersion = getRequiredNodeVersion;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_url_1 = require("node:url");
const __filename = (0, node_url_1.fileURLToPath)(import.meta.url);
const __dirname = (0, node_path_1.dirname)(__filename);
function loadPackageJson() {
    const packageJSONPath = (0, node_path_1.join)(__dirname, '../package.json');
    return JSON.parse((0, node_fs_1.readFileSync)(packageJSONPath, { encoding: 'utf8' }));
}
function getVersion() {
    return loadPackageJson().version;
}
function getRequiredNodeVersion() {
    return loadPackageJson().engines.node;
}
//# sourceMappingURL=version.js.map