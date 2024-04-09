import * as path from "path";
import * as fs from "fs-extra";

export class StorageService {
  constructor(
    public baseDirectory: string,
  ) {}

  public initSync(): void {
    return fs.ensureDirSync(this.baseDirectory);
  }

  public getItemSync<T>(itemName: string): T | null {
    const filePath = path.resolve(this.baseDirectory, itemName);

    if (!fs.pathExistsSync(filePath)) {
      return null;
    }

    return fs.readJsonSync(filePath);
  }

  public async getItem<T>(itemName: string): Promise<T | null> {
    const filePath = path.resolve(this.baseDirectory, itemName);

    if (!await fs.pathExists(filePath)) {
      return null;
    }

    return await fs.readJson(filePath);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public setItemSync(itemName: string, data: Record<any, any> | Array<any>): void {
    return fs.writeJsonSync(path.resolve(this.baseDirectory, itemName), data);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public setItem(itemName: string, data: Record<any, any> | Array<any>): Promise<void> {
    return fs.writeJson(path.resolve(this.baseDirectory, itemName), data);
  }

  public copyItem(srcItemName: string, destItemName: string): Promise<void> {
    return fs.copyFile(path.resolve(this.baseDirectory, srcItemName), path.resolve(this.baseDirectory, destItemName));
  }

  public copyItemSync(srcItemName: string, destItemName: string): void {
    return fs.copyFileSync(path.resolve(this.baseDirectory, srcItemName), path.resolve(this.baseDirectory, destItemName));
  }

  public removeItemSync(itemName: string): void {
    return fs.removeSync(path.resolve(this.baseDirectory, itemName));
  }
}