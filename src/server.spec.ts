import path from "path";
import fs from "fs-extra";

import { HAPStorage, VideoCodec } from "hap-nodejs";
import { Server } from "./server";
import { User } from "./user";
import type { HomebridgeConfig } from "./bridgeService";

describe("Server", () => {
  const homebridgeStorageFolder = path.resolve(__dirname, "../mock");
  const configPath = path.resolve(homebridgeStorageFolder, "config.json");

  const existingEnvVar = process.env.BRIDGE_USERNAME;

  beforeAll(async () => {
    process.env.BRIDGE_USERNAME = "CC:22:3D:E3:CE:30";
    await fs.ensureDir(homebridgeStorageFolder);
    User.setStoragePath(homebridgeStorageFolder);
    HAPStorage.setCustomStoragePath(User.persistPath());
  });

  afterAll(async () => {
    process.env.BRIDGE_USERNAME = existingEnvVar;
    await fs.remove(homebridgeStorageFolder);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mock("./bridgeService");
  });

  const mockConfig: Partial<HomebridgeConfig> = {
    bridge: {
      username: "CC:22:3D:E3:CE:30",
      pin: "031-45-154",
      name: "Homebridge",
    },
    accessories: [],
    platforms: [],
  };

  it("creates an instance of the server without errors", async () => {
    await fs.writeJson(configPath, mockConfig);

    const server = new Server({
      customStoragePath: homebridgeStorageFolder,
      hideQRCode: true,
    });

    expect(server).toBeInstanceOf(Server);
  });

  it("starts without errors", async () => {
    await fs.writeJson(configPath, mockConfig);

    const server = new Server({
      customStoragePath: homebridgeStorageFolder,
      hideQRCode: true,
    });

    await server.start();

    expect(server).toBeInstanceOf(Server);
  });

  const mockConfigWithVars: Partial<HomebridgeConfig> = {
    bridge: {
      username: "${BRIDGE_USERNAME}",
      pin: "031-45-154",
      name: "Homebridge",
    },
    accessories: [],
    platforms: [],
  };

  it("starts without errors when variables are replaced", async () => {
    await fs.writeJson(configPath, mockConfigWithVars);

    // should throw an error before variables replaced
    await expect(async () => {
      const server = new Server({
        customStoragePath: homebridgeStorageFolder,
        hideQRCode: true,
      });

      await server.start();
    }).rejects.toThrow();

    mockConfigWithVars.replaceVariables = true;

    await fs.writeJson(configPath, mockConfigWithVars);

    const server = new Server({
      customStoragePath: homebridgeStorageFolder,
      hideQRCode: true,
    });

    // should start successfully after variables replaced
    await server.start();
  });
});