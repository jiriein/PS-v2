export interface MyFileUtilsPlugin {
    getFileExtension(options: {
        uri: string;
    }): Promise<{
        extension: string | null;
    }>;
}
export declare const MyFileUtils: MyFileUtilsPlugin;
