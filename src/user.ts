import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Manages user settings and storage locations.
 */
export class User {
  private static customStoragePath?: string
  private static storageAccessed = false

  static configPath(): string {
    return join(User.storagePath(), 'config.json')
  }

  static persistPath(): string {
    return join(User.storagePath(), 'persist') // hap-nodejs data is stored here
  }

  static cachedAccessoryPath(): string {
    return join(User.storagePath(), 'accessories')
  }

  static storagePath(): string {
    User.storageAccessed = true

    return User.customStoragePath ? User.customStoragePath : join(homedir(), '.homebridge')
  }

  public static setStoragePath(...storagePathSegments: string[]): void {
    if (User.storageAccessed) {
      throw new Error('Storage path was already accessed and cannot be changed anymore. Try initializing your custom storage path earlier!')
    }

    User.customStoragePath = resolve(...storagePathSegments)
  }
}
