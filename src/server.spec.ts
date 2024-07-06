import path from "path";
import fs from "fs-extra";
import { HAPStorage } from "hap-nodejs";
import { Server } from "./server";
import { User } from "./user";

describe("Server", () => {
  const homebridgeStorageFolder = path.resolve(__dirname, "../mock");
  const configPath = path.resolve(homebridgeStorageFolder, "config.json");
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  const mockConfig = {
    bridge: {
      username: "CC:22:3D:E3:CE:30",
      pin: "031-45-154",
      name: "Homebridge",
    },
    accessories: [],
    platforms: [],
  };

  beforeAll(async () => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    await fs.ensureDir(homebridgeStorageFolder);
    await fs.writeJson(configPath, mockConfig);
    User.setStoragePath(homebridgeStorageFolder);
    HAPStorage.setCustomStoragePath(User.persistPath());
  });
  
  afterAll(async () => {
    await fs.remove(homebridgeStorageFolder);
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mock("./bridgeService");
  });

  it("creates an instance of the server without errors", async () => {
    const server = new Server({
      customStoragePath: homebridgeStorageFolder,
      hideQRCode: true,
    });

    expect(server).toBeInstanceOf(Server);
  });

  it("starts without errors", async () => {
    const server = new Server({
      customStoragePath: homebridgeStorageFolder,
      hideQRCode: true,
    });

    await server.start();

    expect(server).toBeInstanceOf(Server);
  });

});
