import fs from 'node:fs'
import { resolve } from 'node:path'

export class StorageService {
  constructor(
    public baseDirectory: string,
  ) {}

  public initSync(): void {
    fs.mkdirSync(this.baseDirectory, { recursive: true })
  }

  public getItemSync<T>(itemName: string): T | null {
    const filePath = resolve(this.baseDirectory, itemName)

    if (!fs.existsSync(filePath)) {
      return null
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
  }

  public async getItem<T>(itemName: string): Promise<T | null> {
    const filePath = resolve(this.baseDirectory, itemName)

    if (!await fs.promises.stat(filePath).then(() => true).catch(() => false)) {
      return null
    }

    return JSON.parse(await (fs.promises.readFile(filePath, 'utf-8'))) as T
  }

  public setItemSync(itemName: string, data: Record<any, any> | Array<any>): void {
    return fs.writeFileSync(resolve(this.baseDirectory, itemName), JSON.stringify(data))
  }

  public setItem(itemName: string, data: Record<any, any> | Array<any>): Promise<void> {
    return fs.promises.writeFile(resolve(this.baseDirectory, itemName), JSON.stringify(data))
  }

  public copyItem(srcItemName: string, destItemName: string): Promise<void> {
    return fs.promises.copyFile(resolve(this.baseDirectory, srcItemName), resolve(this.baseDirectory, destItemName))
  }

  public copyItemSync(srcItemName: string, destItemName: string): void {
    return fs.copyFileSync(resolve(this.baseDirectory, srcItemName), resolve(this.baseDirectory, destItemName))
  }

  public removeItemSync(itemName: string): void {
    return fs.rmdirSync(resolve(this.baseDirectory, itemName), { recursive: true })
  }
}
