// import { Server, Socket } from "socket.io";
import WebSocket, { WebSocketServer } from 'ws';
import { Server as HttpServer } from "http";
import { promises as fs } from "fs";
import * as path from "path";
import { fetchDir, fetchFileContent } from "./fs";
import { TerminalManager } from "./pty";
import { ChildProcess, spawn } from "child_process";
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
  InitializeParams,
  InitializeResult,
  CompletionItem,
  CompletionItemKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
  WebSocketMessageReader,
  WebSocketMessageWriter,
} from "vscode-ws-jsonrpc";

// Types for file system operations
interface FileSystemContent {
  type: "file" | "directory";
  name: string;
  path: string;
  children?: FileSystemContent[];
}

interface FileChange {
  path: string;
  changes: {
    startLine: number;
    endLine: number;
    content: string;
  };
}

// LSP Connection Manager
class LSPConnectionManager {
  private process: ChildProcess | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private socket: Socket;

  constructor(socket: Socket) {
    this.socket = socket;
    this.startServer();
  }

  private async startServer() {
    try {
      // Set environment variable for backtrace
      const env = {
        RUST_BACKTRACE: "1",
        VHDL_LS_LOG: "debug", // Enable debug logging
      };

      // Start the VHDL LS process with error handling
      this.process = spawn("/home/ponnu/.cargo/bin/vhdl_ls", [], {
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (!this.process.pid) {
        throw new Error("Failed to start VHDL Language Server");
      }

      // Handle stdout
      this.process.stdout?.on("data", (data: Buffer) => {
        try {
          const messages = data
            .toString()
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => {
              try {
                return JSON.parse(line);
              } catch (e) {
                console.log("Raw LSP output:", line);
                return null;
              }
            })
            .filter((msg) => msg !== null);

          messages.forEach((msg) => {
            this.socket.emit("lsp:message", msg);
          });
        } catch (error) {
          console.error("Error processing LSP message:", error);
        }
      });

      // Handle stderr
      this.process.stderr?.on("data", (data: Buffer) => {
        const errorMessage = data.toString();
        console.error("VHDL LS Error:", errorMessage);

        // Check for specific error conditions
        if (errorMessage.includes("disconnected channel")) {
          this.handleDisconnection();
        }
      });

      // Handle process exit
      this.process.on("exit", (code: number | null) => {
        console.log(`VHDL LS process exited with code ${code}`);

        if (code !== 0 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.handleDisconnection();
        } else {
          this.socket.emit("lsp:server-error", {
            message: "VHDL Language Server stopped unexpectedly",
            code,
          });
        }
      });

      // Initialize the language server
      this.initializeServer();
    } catch (error: any) {
      console.error("Error starting VHDL Language Server:", error);
      this.socket.emit("lsp:server-error", {
        message: "Failed to start VHDL Language Server",
        error: error.message,
      });
    }
  }

  private async initializeServer() {
    if (!this.process?.stdin?.writable) {
      throw new Error("VHDL LS process not ready");
    }

    // Send initialize request
    const initializeParams = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        processId: process.pid,
        rootUri: `file://${path.resolve(process.cwd())}/code`,
        capabilities: {
          textDocument: {
            synchronization: {
              didSave: true,
              didChange: true,
            },
            completion: {
              completionItem: {
                snippetSupport: true,
              },
            },
            hover: true,
            definition: true,
            references: true,
            implementation: true,
            documentSymbol: true,
          },
          workspace: {
            workspaceFolders: true,
          },
        },
        workspaceFolders: [
          {
            uri: `file://${path.resolve(process.cwd())}/code`,
            name: "workspace",
          },
        ],
      },
    };

    this.sendRequest(initializeParams);
  }

  private handleDisconnection() {
    this.reconnectAttempts++;
    console.log(
      `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    // Kill existing process if it's still running
    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    // Wait before reconnecting
    setTimeout(() => {
      this.startServer();
    }, 1000 * this.reconnectAttempts); // Exponential backoff
  }

  public sendRequest(message: any) {
    try {
      if (this.process?.stdin?.writable) {
        const messageStr = JSON.stringify(message) + "\n";
        this.process.stdin.write(messageStr);
      } else {
        throw new Error("VHDL LS process not ready");
      }
    } catch (error) {
      console.error("Error sending request to VHDL LS:", error);
      this.handleDisconnection();
    }
  }

  public dispose() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

const terminalManager = new TerminalManager();
let vhdlServer: ChildProcess | null = null;

export function initWs(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      // Should restrict this more!
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Document manager
  const documents: TextDocuments<TextDocument> = new TextDocuments(
    TextDocument
  );

  io.on("connection", async (socket) => {
    // Auth checks should happen here
    socket.emit("loaded", {
      rootContent: await fetchDir(path.join(__dirname, `../code`), ""),
    });

    const messageReader = new WebSocketMessageReader(socket);
    // const messageWriter = new SocketMessageWriter(socket);

    initHandlers(socket);
  });
}

function initHandlers(socket: Socket) {
  // const lspManager = new LSPConnectionManager(socket);

  // Create a connection for the server.

  socket.on("disconnect", () => {
    console.log("user disconnected");
    // lspManager.dispose();
  });

  socket.on("fetchDir", async (dir: string, callback) => {
    const dirPath = path.join(__dirname, `../code/${dir}`);
    const contents = await fetchDir(dirPath, dir);
    callback(contents);
  });

  socket.on(
    "fetchContent",
    async ({ path: filePath }: { path: string }, callback) => {
      const fullPath = path.join(__dirname, `../code/${filePath}`);
      const data = await fetchFileContent(fullPath);
      callback(data);
    }
  );

  socket.on(
    "updateContent",
    async ({ path: filePath, content }: { path: string; content: string }) => {
      const fullPath = path.join(__dirname, `../code/${filePath}`);

      console.log(fullPath, content);

      try {
        await fs.writeFile(fullPath, content, "utf-8");
        console.log(`Updated content for ${filePath} from line`);
      } catch (error) {
        console.log(error);
      }
    }
  );

  // socket.on(
  //   "updateContent",
  //   async ({
  //     path: filePath,
  //     changes,
  //   }: {
  //     path: string;
  //     changes: {
  //       startLine: number;
  //       endLine: number;
  //       content: string;
  //     };
  //   }) => {
  //     const fullPath = path.join(__dirname, `../code/${filePath}`);

  //     try {
  //       // Read the existing content of the file
  //       const fileContent = await fs.readFile(fullPath, "utf-8");
  //       const fileLines = fileContent.split("\n");

  //       // Replace the specified lines with the new content
  //       const { startLine, endLine, content } = changes;
  //       const newLines = content.split("\n");
  //       fileLines.splice(startLine - 1, endLine - startLine + 1, ...newLines);

  //       // Join the updated lines and save back to the file
  //       const updatedContent = fileLines.join("\n");
  //       await fs.writeFile(fullPath, updatedContent, "utf-8");

  //       console.log(
  //         `Updated content for ${filePath} from line ${startLine} to ${endLine}`
  //       );
  //     } catch (error) {
  //       console.error(`Error updating the file ${filePath}:`, error);
  //     }
  //   }
  // );

  socket.on("requestTerminal", async () => {
    terminalManager.createPty(socket.id, (data, id) => {
      socket.emit("terminal", {
        data: Buffer.from(data, "utf-8"),
      });
    });
  });

  socket.on(
    "terminalData",
    async ({ data }: { data: string; terminalId: number }) => {
      console.log(data);
      terminalManager.write(socket.id, data);
    }
  );

  // if (!vhdlServer) {
  //   vhdlServer = spawn("vhdl_ls");

  //   vhdlServer.stdout?.on("data", (data: Buffer) => {
  //     const response = data.toString();
  //     socket.emit("lsp", JSON.parse(response));
  //   });

  //   vhdlServer.stderr?.on("data", (data: any) => {
  //     console.error(`VHDL LS Error: ${data}`);
  //   });

  //   vhdlServer.on("close", (code: any) => {
  //     console.log(`VHDL LS exited with code ${code}`);
  //     vhdlServer = null; // Reset the server variable on exit
  //   });
  // }

  // Handle LSP messages from the frontend
  // socket.on("lsp:request", (message: any) => {
  //   console.log('message', message)
  //   lspManager.sendRequest(message);
  // });
}
