export declare class StorageService {
    baseDirectory: string;
    constructor(baseDirectory: string);
    initSync(): void;
    getItemSync<T>(itemName: string): T | null;
    getItem<T>(itemName: string): Promise<T | null>;
    setItemSync(itemName: string, data: Record<any, any> | Array<any>): void;
    setItem(itemName: string, data: Record<any, any> | Array<any>): Promise<void>;
    copyItem(srcItemName: string, destItemName: string): Promise<void>;
    copyItemSync(srcItemName: string, destItemName: string): void;
    removeItemSync(itemName: string): void;
}
//# sourceMappingURL=storageService.d.ts.map