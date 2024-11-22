"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveToS3 = exports.fetchS3Folder = void 0;
const aws_sdk_1 = require("aws-sdk");
const fs_1 = require("fs");
const path = __importStar(require("path"));
const s3 = new aws_sdk_1.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.S3_ENDPOINT,
});
const fetchS3Folder = (key, localPath) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const params = {
            Bucket: (_a = process.env.S3_BUCKET) !== null && _a !== void 0 ? _a : "",
            Prefix: key,
        };
        // Read all files and directories in the specified folder
        function fetchFilesFromLocalDirectory(directoryPath, localPath) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    // Read all files and directories in the specified folder
                    const files = yield fs_1.promises.readdir(directoryPath, { withFileTypes: true });
                    // Iterate over each file/directory
                    yield Promise.all(files.map((file) => __awaiter(this, void 0, void 0, function* () {
                        if (file.isFile()) {
                            const filePath = path.join(directoryPath, file.name);
                            // Read the file data
                            const fileData = yield fs_1.promises.readFile(filePath);
                            // Determine the destination path for saving the file
                            const destinationPath = path.join(localPath, file.name);
                            // Write the file to the local path
                            yield fs_1.promises.writeFile(destinationPath, fileData);
                            console.log(`Copied ${file.name} to ${destinationPath}`);
                        }
                    })));
                }
                catch (error) {
                    console.error(`Error fetching files from directory`);
                }
            });
        }
        const codeDirectory = path.resolve(__dirname, "code/nextjs");
        const localDestination = path.resolve(__dirname, "output");
        console.log(fetchFilesFromLocalDirectory(codeDirectory, localDestination));
        // const response = await s3.listObjectsV2(params).promise();
        // if (response.Contents) {
        //     // Use Promise.all to run getObject operations in parallel
        //     await Promise.all(response.Contents.map(async (file) => {
        //         const fileKey = file.Key;
        //         if (fileKey) {
        //             const getObjectParams = {
        //                 Bucket: process.env.S3_BUCKET ?? "",
        //                 Key: fileKey
        //             };
        //             const data = await s3.getObject(getObjectParams).promise();
        //             if (data.Body) {
        //                 const fileData = data.Body;
        //                 const filePath = `${localPath}/${fileKey.replace(key, "")}`;
        //                 await writeFile(filePath, fileData);
        //                 console.log(`Downloaded ${fileKey} to ${filePath}`);
        //             }
        //         }
        //     }));
        // }
    }
    catch (error) {
        console.error("Error fetching folder:", error);
    }
});
exports.fetchS3Folder = fetchS3Folder;
// export async function copyS3Folder(sourcePrefix: string, destinationPrefix: string, continuationToken?: string): Promise<void> {
//     try {
//         // List all objects in the source folder
//         const listParams = {
//             Bucket: process.env.S3_BUCKET ?? "",
//             Prefix: sourcePrefix,
//             ContinuationToken: continuationToken
//         };
//         const listedObjects = await s3.listObjectsV2(listParams).promise();
//         if (!listedObjects.Contents || listedObjects.Contents.length === 0) return;
//         // Copy each object to the new location
//         await Promise.all(listedObjects.Contents.map(async (object) => {
//             if (!object.Key) return;
//             let destinationKey = object.Key.replace(sourcePrefix, destinationPrefix);
//             let copyParams = {
//                 Bucket: process.env.S3_BUCKET ?? "",
//                 CopySource: `${process.env.S3_BUCKET}/${object.Key}`,
//                 Key: destinationKey
//             };
//             console.log(copyParams);
//             await s3.copyObject(copyParams).promise();
//             console.log(`Copied ${object.Key} to ${destinationKey}`);
//         }));
//         // Check if the list was truncated and continue copying if necessary
//         if (listedObjects.IsTruncated) {
//             listParams.ContinuationToken = listedObjects.NextContinuationToken;
//             await copyS3Folder(sourcePrefix, destinationPrefix, continuationToken);
//         }
//     } catch (error) {
//         console.error('Error copying folder:', error);
//     }
// }
// function writeFile(filePath: string, fileData: Buffer): Promise<void> {
//   return new Promise(async (resolve, reject) => {
//     await createFolder(path.dirname(filePath));
//     fs.writeFile(filePath, fileData, (err) => {
//       if (err) {
//         reject(err);
//       } else {
//         resolve();
//       }
//     });
//   });
// }
// function createFolder(dirName: string) {
//   return new Promise<void>((resolve, reject) => {
//     fs.mkdir(dirName, { recursive: true }, (err) => {
//       if (err) {
//         return reject(err);
//       }
//       resolve();
//     });
//   });
// }
const saveToS3 = (key, filePath, content) => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
    const params = {
        Bucket: (_b = process.env.S3_BUCKET) !== null && _b !== void 0 ? _b : "",
        Key: `${key}${filePath}`,
        Body: content,
    };
    yield s3.putObject(params).promise();
});
exports.saveToS3 = saveToS3;
