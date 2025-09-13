/**
 * Manages user settings and storage locations.
 */
export declare class User {
    private static customStoragePath?;
    private static storageAccessed;
    static configPath(): string;
    static persistPath(): string;
    static cachedAccessoryPath(): string;
    static storagePath(): string;
    static setStoragePath(...storagePathSegments: string[]): void;
}
//# sourceMappingURL=user.d.ts.map