import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { promises as fs } from "fs";
import * as path from "path";
import { fetchDir, fetchFileContent, saveFile } from "./fs";
import { TerminalManager } from "./pty";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";

const terminalManager = new TerminalManager();

// export class LanguageServerHandler {
//   private lspProcess: ChildProcessWithoutNullStreams | null = null;

//   constructor() {}

//   initReactLanguageServer(socket: Socket) {
//     // Use typescript-language-server for React
//     this.lspProcess = spawn("typescript-language-server", ["--stdio"], {
//       stdio: ["pipe", "pipe", "pipe"],
//     });

//     // Handle stdout
//     this.lspProcess.stdout.on("data", (data) => {
//       socket.emit("lspOutput", data.toString());
//     });

//     // Handle stderr
//     this.lspProcess.stderr.on("data", (error) => {
//       console.error("LSP Server Error:", error.toString());
//       socket.emit("lspError", error.toString());
//     });

//     // Handle process exit
//     this.lspProcess.on("close", (code) => {
//       console.log(`Language Server exited with code ${code}`);
//     });

//     // Forward client messages to LSP
//     socket.on("lspInput", (input) => {
//       if (this.lspProcess) {
//         this.lspProcess.stdin.write(JSON.stringify(input) + "\n");
//       }
//     });
//   }

//   // Cleanup method
//   cleanup() {
//     if (this.lspProcess) {
//       this.lspProcess.kill();
//     }
//   }
// }

export function initWs(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      // Should restrict this more!
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", async (socket) => {
    // Auth checks should happen here
    console.log("user connected");
    socket.emit("loaded", {
      rootContent: await fetchDir(path.join(__dirname, `../code`), ""),
    });

    initHandlers(socket);
  });
}

function initHandlers(socket: Socket) {
  socket.on("disconnect", () => {
    console.log("user disconnected");
  });

  console.log("first");

  socket.on("fetchDir", async (dir: string, callback) => {
    console.log("dir", dir);
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
    async ({ filePath, content }: { filePath: string; content: string }) => {
      const fullPath = path.join(__dirname, `../code/${filePath}`);

      try {
        await fs.writeFile(fullPath, content, "utf-8");
        console.log(`Updated content for ${filePath} from line`);
      } catch (error) {
        console.log(error);
      }
    }
  );

  socket.on("requestTerminal", async () => {
    terminalManager.createPty(socket.id, (data, id) => {
      // console.log(data)
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

  socket.on(
    "createFile",
    async ({
      filePath,
      fileName,
      fileType,
    }: {
      filePath: string;
      fileName: string;
      fileType: string;
    }) => {
      const fullPath = path.join(__dirname, `../code/${filePath}`, fileName);

      try {
        if(fileType === "file") {
          await fs.writeFile(fullPath, "", "utf-8");
        } else {
          await fs.mkdir(fullPath, { recursive: true });
        }
        console.log(`Created file ${fileName} at ${fullPath}`);
      } catch (error) {
        console.error(`Error creating file ${fileName} at ${fullPath}`, error);
      }
    }
  );

  socket.on("deleteFile", async ({ filePath }: { filePath: string }) => {
    const fullPath = path.join(__dirname, `../code/${filePath}`);

    try {
      await fs.unlink(`${fullPath}`);
      console.log(`Deleted file at ${fullPath}`);
    } catch (error) {
      console.error(`Error deleting file at ${fullPath}`, error);
    }
  });

  // socket.on('lsp', async (data) => {
  //   console.log("data", data)
  //   const vhdlLsProcess = spawn('vhdl_ls'); // Add necessary arguments

  //   console.log('lsp', vhdlLsProcess)

  //   vhdlLsProcess.stdout.on('data', (output) => {
  //     socket.emit('lspOutput', output.toString());
  //   });

  //   vhdlLsProcess.stderr.on('data', (error) => {
  //     console.error(`Error from vhdl_ls: ${error}`);
  //   });

  //   vhdlLsProcess.on('close', (code) => {
  //     console.log(`vhdl_ls process exited with code ${code}`);
  //   });

  //   // Handle incoming data from the client to send to vhdl_ls
  //   socket.on('lspInput', (input) => {
  //     console.log('input',input)
  //     vhdlLsProcess.stdin.write(input);
  //   });
  // });
}
