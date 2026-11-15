import { resolve } from 'node:path'

import fs from 'fs-extra'

export class StorageService {
  constructor(
    public baseDirectory: string,
  ) {}

  public initSync(): void {
    return fs.ensureDirSync(this.baseDirectory)
  }

  public getItemSync<T>(itemName: string): T | null {
    const filePath = resolve(this.baseDirectory, itemName)

    if (!fs.pathExistsSync(filePath)) {
      return null
    }

    return fs.readJsonSync(filePath)
  }

  public async getItem<T>(itemName: string): Promise<T | null> {
    const filePath = resolve(this.baseDirectory, itemName)

    if (!await fs.pathExists(filePath)) {
      return null
    }

    return await fs.readJson(filePath)
  }

  /**
   * Write an item as JSON, so that the file always holds either the old
   * content or the new content in full.
   *
   * The text goes to a temporary file in the same folder first, which then
   * takes the place of the item with a rename. Writing straight to the item
   * left half a file behind when Homebridge (or the power) stopped mid-write.
   * The content is byte for byte what `fs.writeJsonSync` wrote before.
   */
  public setItemSync(itemName: string, data: Record<any, any> | Array<any>): void {
    const filePath = resolve(this.baseDirectory, itemName)
    const tempPath = resolve(this.baseDirectory, `.${itemName}.tmp`)
    const content = `${JSON.stringify(data)}\n`

    try {
      const file = fs.openSync(tempPath, 'w')
      try {
        fs.writeFileSync(file, content)
        // on the disk before the rename, or a power cut could leave an empty file under the real name
        fs.fsyncSync(file)
      } finally {
        fs.closeSync(file)
      }
    } catch (error: unknown) {
      fs.removeSync(tempPath)
      throw error
    }

    try {
      fs.renameSync(tempPath, filePath)
    } catch {
      // Some systems refuse to rename over a file another program has open.
      // Writing the item directly, as before, is better than not saving.
      fs.removeSync(tempPath)
      fs.writeFileSync(filePath, content)
    }
  }

  public setItem(itemName: string, data: Record<any, any> | Array<any>): Promise<void> {
    return fs.writeJson(resolve(this.baseDirectory, itemName), data)
  }

  public copyItem(srcItemName: string, destItemName: string): Promise<void> {
    return fs.copyFile(resolve(this.baseDirectory, srcItemName), resolve(this.baseDirectory, destItemName))
  }

  public copyItemSync(srcItemName: string, destItemName: string): void {
    return fs.copyFileSync(resolve(this.baseDirectory, srcItemName), resolve(this.baseDirectory, destItemName))
  }

  public removeItemSync(itemName: string): void {
    return fs.removeSync(resolve(this.baseDirectory, itemName))
  }
}
