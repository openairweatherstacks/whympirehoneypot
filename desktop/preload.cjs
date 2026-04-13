const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("desktopRuntime", {
  isDesktop: true,
  isPackaged: process.env.NODE_ENV === "production",
  platform: process.platform
});
