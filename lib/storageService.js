"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const node_path_1 = require("node:path");
const fs_extra_1 = __importDefault(require("fs-extra"));
class StorageService {
    baseDirectory;
    constructor(baseDirectory) {
        this.baseDirectory = baseDirectory;
    }
    initSync() {
        return fs_extra_1.default.ensureDirSync(this.baseDirectory);
    }
    getItemSync(itemName) {
        const filePath = (0, node_path_1.resolve)(this.baseDirectory, itemName);
        if (!fs_extra_1.default.pathExistsSync(filePath)) {
            return null;
        }
        return fs_extra_1.default.readJsonSync(filePath);
    }
    async getItem(itemName) {
        const filePath = (0, node_path_1.resolve)(this.baseDirectory, itemName);
        if (!await fs_extra_1.default.pathExists(filePath)) {
            return null;
        }
        return await fs_extra_1.default.readJson(filePath);
    }
    setItemSync(itemName, data) {
        return fs_extra_1.default.writeJsonSync((0, node_path_1.resolve)(this.baseDirectory, itemName), data);
    }
    setItem(itemName, data) {
        return fs_extra_1.default.writeJson((0, node_path_1.resolve)(this.baseDirectory, itemName), data);
    }
    copyItem(srcItemName, destItemName) {
        return fs_extra_1.default.copyFile((0, node_path_1.resolve)(this.baseDirectory, srcItemName), (0, node_path_1.resolve)(this.baseDirectory, destItemName));
    }
    copyItemSync(srcItemName, destItemName) {
        return fs_extra_1.default.copyFileSync((0, node_path_1.resolve)(this.baseDirectory, srcItemName), (0, node_path_1.resolve)(this.baseDirectory, destItemName));
    }
    removeItemSync(itemName) {
        return fs_extra_1.default.removeSync((0, node_path_1.resolve)(this.baseDirectory, itemName));
    }
}
exports.StorageService = StorageService;
//# sourceMappingURL=storageService.js.map