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
exports.initWs = void 0;
const socket_io_1 = require("socket.io");
const fs_1 = require("fs");
const path = __importStar(require("path"));
const fs_2 = require("./fs");
const pty_1 = require("./pty");
const terminalManager = new pty_1.TerminalManager();
function initWs(httpServer) {
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            // Should restrict this more!
            origin: "*",
            methods: ["GET", "POST"],
        },
    });
    io.on("connection", (socket) => __awaiter(this, void 0, void 0, function* () {
        // Auth checks should happen here
        socket.emit("loaded", {
            rootContent: yield (0, fs_2.fetchDir)(path.join(__dirname, `../../code`), ""),
        });
        initHandlers(socket);
    }));
}
exports.initWs = initWs;
function initHandlers(socket) {
    socket.on("disconnect", () => {
        console.log("user disconnected");
    });
    socket.on("fetchDir", (dir, callback) => __awaiter(this, void 0, void 0, function* () {
        const dirPath = path.join(__dirname, `../../code/${dir}`);
        const contents = yield (0, fs_2.fetchDir)(dirPath, dir);
        callback(contents);
    }));
    socket.on("fetchContent", ({ path: filePath }, callback) => __awaiter(this, void 0, void 0, function* () {
        const fullPath = path.join(__dirname, `../../code/${filePath}`);
        const data = yield (0, fs_2.fetchFileContent)(fullPath);
        callback(data);
    }));
    socket.on("updateContent", ({ path: filePath, changes, }) => __awaiter(this, void 0, void 0, function* () {
        const fullPath = path.join(__dirname, `../../code/${filePath}`);
        try {
            // Read the existing content of the file
            const fileContent = yield fs_1.promises.readFile(fullPath, "utf-8");
            const fileLines = fileContent.split("\n");
            // Replace the specified lines with the new content
            const { startLine, endLine, content } = changes;
            const newLines = content.split("\n");
            fileLines.splice(startLine - 1, endLine - startLine + 1, ...newLines);
            // Join the updated lines and save back to the file
            const updatedContent = fileLines.join("\n");
            yield fs_1.promises.writeFile(fullPath, updatedContent, "utf-8");
            console.log(`Updated content for ${filePath} from line ${startLine} to ${endLine}`);
        }
        catch (error) {
            console.error(`Error updating the file ${filePath}:`, error);
        }
    }));
    socket.on("requestTerminal", () => __awaiter(this, void 0, void 0, function* () {
        terminalManager.createPty(socket.id, (data, id) => {
            socket.emit("terminal", {
                data: Buffer.from(data, "utf-8"),
            });
        });
    }));
    socket.on("terminalData", ({ data }) => __awaiter(this, void 0, void 0, function* () {
        console.log(data);
        terminalManager.write(socket.id, data);
    }));
}
