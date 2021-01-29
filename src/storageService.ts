import * as fs from "fs-extra";
import * as path from "path";

export class StorageService {
  constructor(
    public baseDirectory: string,
  ) {}

  public initSync(): void {
    return fs.ensureDirSync(this.baseDirectory);
  }

  public getItemSync<T>(itemName: string): T | null {
    try {
      const filePath = path.resolve(this.baseDirectory, itemName);
      return fs.readJsonSync(filePath);
    } catch (e) {
      return null;
    }
  }

  public async getItem<T>(itemName: string): Promise<T | null> {
    try {
      const filePath = path.resolve(this.baseDirectory, itemName);
      return await fs.readJson(filePath);
    } catch (e) {
      return null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public setItemSync(itemName: string, data: Record<any, any> | Array<any>): void {
    return fs.writeJsonSync(path.resolve(this.baseDirectory, itemName), data);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public setItem(itemName: string, data: Record<any, any> | Array<any>): Promise<void> {
    return fs.writeJson(path.resolve(this.baseDirectory, itemName), data);
  }

  public removeItemSync(itemName: string): void {
    return fs.removeSync(path.resolve(this.baseDirectory, itemName));
  }
}