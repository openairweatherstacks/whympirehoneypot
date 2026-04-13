const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const DEV_SERVER_URL = process.env.ELECTRON_START_URL ?? "http://127.0.0.1:3000";
const DESKTOP_PORT = Number.parseInt(process.env.FINANCE_DESKTOP_PORT ?? "31888", 10);
const DESKTOP_SERVER_URL = `http://127.0.0.1:${DESKTOP_PORT}`;
const shouldBootStandalone = app.isPackaged || process.env.ELECTRON_USE_STANDALONE === "1";

let mainWindow = null;
let serverProcess = null;

function getStandaloneRoot() {
  return app.isPackaged
    ? app.getAppPath()
    : path.join(app.getAppPath(), ".next", "standalone");
}

function ping(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode !== undefined && response.statusCode < 500);
    });

    request.on("error", () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await ping(url)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for desktop server at ${url}`);
}

function pipeServerLogs(stream, label) {
  if (!stream) {
    return;
  }

  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    for (const line of chunk.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        console.log(`[desktop:${label}] ${trimmed}`);
      }
    }
  });
}

async function startStandaloneServer() {
  if (serverProcess) {
    return DESKTOP_SERVER_URL;
  }

  const standaloneRoot = getStandaloneRoot();
  const serverScript = path.join(standaloneRoot, "server.js");
  const financeDataDirectory = path.join(app.getPath("userData"), "data");

  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: standaloneRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      PORT: String(DESKTOP_PORT),
      FINANCE_DATA_DIR: financeDataDirectory
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  pipeServerLogs(serverProcess.stdout, "stdout");
  pipeServerLogs(serverProcess.stderr, "stderr");

  serverProcess.once("exit", (code, signal) => {
    console.log(`[desktop:server] exited with code=${code} signal=${signal}`);
    serverProcess = null;
  });

  await waitForServer(DESKTOP_SERVER_URL);
  return DESKTOP_SERVER_URL;
}

function stopStandaloneServer() {
  if (!serverProcess) {
    return;
  }

  const runningServer = serverProcess;
  serverProcess = null;

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(runningServer.pid), "/t", "/f"], {
      windowsHide: true
    });
    return;
  }

  runningServer.kill("SIGTERM");
}

async function createWindow() {
  const startUrl = shouldBootStandalone
    ? await startStandaloneServer()
    : DEV_SERVER_URL;

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 760,
    show: false,
    backgroundColor: "#08111f",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  await window.loadURL(startUrl);
  mainWindow = window;

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
}

app.whenReady()
  .then(createWindow)
  .catch((error) => {
    console.error("[desktop] failed to start", error);
    app.quit();
  });

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

app.on("before-quit", () => {
  stopStandaloneServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
