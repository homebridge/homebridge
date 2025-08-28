import { HomebridgeAPI } from "./api";
import { ExternalPortService } from "./externalPortService";
import { MatterService } from "./matterService";
import { PluginManager } from "./pluginManager";

describe("MatterService", () => {
  let matterService: MatterService;
  let mockPluginManager: jest.Mocked<PluginManager>;
  let mockExternalPortService: jest.Mocked<ExternalPortService>;
  let mockApi: jest.Mocked<HomebridgeAPI>;

  beforeEach(() => {
    mockPluginManager = {} as jest.Mocked<PluginManager>;
    mockExternalPortService = {} as jest.Mocked<ExternalPortService>;
    mockApi = {} as jest.Mocked<HomebridgeAPI>;
  });

  it("should be disabled by default", () => {
    matterService = new MatterService(
      {},
      mockPluginManager,
      mockExternalPortService,
      mockApi,
      {},
    );

    const status = matterService.getStatus();
    expect(status.enabled).toBe(false);
    expect(status.running).toBe(false);
    expect(status.accessoryCount).toBe(0);
  });

  it("should be enabled when configured", () => {
    matterService = new MatterService(
      { enabled: true },
      mockPluginManager,
      mockExternalPortService,
      mockApi,
      {},
    );

    const status = matterService.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.running).toBe(false);
    expect(status.accessoryCount).toBe(0);
  });

  it("should use default configuration values", () => {
    matterService = new MatterService(
      { enabled: true },
      mockPluginManager,
      mockExternalPortService,
      mockApi,
      {},
    );

    // Access private matterConfig for testing
    const config = (matterService as unknown as { matterConfig: unknown }).matterConfig as {
      port: number;
      discriminator: number;
      passcode: number;
      vendorId: number;
      productId: number;
      deviceName: string;
      deviceType: number;
    };
    expect(config.port).toBe(5540);
    expect(config.discriminator).toBe(3840);
    expect(config.passcode).toBe(20202021);
    expect(config.vendorId).toBe(0xFFF1);
    expect(config.productId).toBe(0x8001);
    expect(config.deviceName).toBe("Homebridge Matter Bridge");
    expect(config.deviceType).toBe(0x0016);
  });

  it("should use custom configuration values", () => {
    const customConfig = {
      enabled: true,
      port: 5541,
      discriminator: 1234,
      passcode: 12345678,
      vendorId: 0x1234,
      productId: 0x5678,
      deviceName: "Custom Matter Bridge",
      deviceType: 0x0020,
    };

    matterService = new MatterService(
      customConfig,
      mockPluginManager,
      mockExternalPortService,
      mockApi,
      {},
    );

    const config = (matterService as unknown as { matterConfig: unknown }).matterConfig as {
      port: number;
      discriminator: number;
      passcode: number;
      vendorId: number;
      productId: number;
      deviceName: string;
      deviceType: number;
    };
    expect(config.port).toBe(5541);
    expect(config.discriminator).toBe(1234);
    expect(config.passcode).toBe(12345678);
    expect(config.vendorId).toBe(0x1234);
    expect(config.productId).toBe(0x5678);
    expect(config.deviceName).toBe("Custom Matter Bridge");
    expect(config.deviceType).toBe(0x0020);
  });

  it("should initialize without error when disabled", async () => {
    matterService = new MatterService(
      { enabled: false },
      mockPluginManager,
      mockExternalPortService,
      mockApi,
      {},
    );

    await expect(matterService.initialize()).resolves.toBeUndefined();
  });

  it("should initialize with placeholder implementation when enabled", async () => {
    matterService = new MatterService(
      { enabled: true },
      mockPluginManager,
      mockExternalPortService,
      mockApi,
      {},
    );

    await expect(matterService.initialize()).resolves.toBeUndefined();
  });

  it("should start without error when enabled", async () => {
    matterService = new MatterService(
      { enabled: true },
      mockPluginManager,
      mockExternalPortService,
      mockApi,
      {},
    );

    await matterService.initialize();
    await expect(matterService.start()).resolves.toBeUndefined();
  });

  it("should stop without error", async () => {
    matterService = new MatterService(
      { enabled: true },
      mockPluginManager,
      mockExternalPortService,
      mockApi,
      {},
    );

    await matterService.initialize();
    await expect(matterService.stop()).resolves.toBeUndefined();
  });
});