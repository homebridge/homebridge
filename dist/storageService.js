import { resolve } from 'node:path';
import fs from 'fs-extra';
export class StorageService {
    baseDirectory;
    constructor(baseDirectory) {
        this.baseDirectory = baseDirectory;
    }
    initSync() {
        return fs.ensureDirSync(this.baseDirectory);
    }
    getItemSync(itemName) {
        const filePath = resolve(this.baseDirectory, itemName);
        if (!fs.pathExistsSync(filePath)) {
            return null;
        }
        return fs.readJsonSync(filePath);
    }
    async getItem(itemName) {
        const filePath = resolve(this.baseDirectory, itemName);
        if (!await fs.pathExists(filePath)) {
            return null;
        }
        return await fs.readJson(filePath);
    }
    setItemSync(itemName, data) {
        return fs.writeJsonSync(resolve(this.baseDirectory, itemName), data);
    }
    setItem(itemName, data) {
        return fs.writeJson(resolve(this.baseDirectory, itemName), data);
    }
    copyItem(srcItemName, destItemName) {
        return fs.copyFile(resolve(this.baseDirectory, srcItemName), resolve(this.baseDirectory, destItemName));
    }
    copyItemSync(srcItemName, destItemName) {
        return fs.copyFileSync(resolve(this.baseDirectory, srcItemName), resolve(this.baseDirectory, destItemName));
    }
    removeItemSync(itemName) {
        return fs.removeSync(resolve(this.baseDirectory, itemName));
    }
}
//# sourceMappingURL=storageService.js.map