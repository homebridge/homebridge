#!/usr/bin/env node

import { Command } from "commander";
import { MatterConfigValidator } from "../matterConfigValidator";
import { MatterConfiguration } from "../matterService";
import * as fs from "fs-extra";
import * as path from "path";
import * as qrcode from "qrcode-terminal";

const program = new Command();

program
  .name("homebridge-matter")
  .description("Homebridge Matter configuration and management tool")
  .version("1.0.0");

program
  .command("validate")
  .description("Validate Matter configuration")
  .option("-c, --config <path>", "Path to config.json file", "./config.json")
  .action(async (options) => {
    try {
      const configPath = path.resolve(options.config);
      
      if (!await fs.pathExists(configPath)) {
        console.error(`Configuration file not found: ${configPath}`);
        process.exit(1);
      }
      
      const config = await fs.readJson(configPath);
      const matterConfig: MatterConfiguration = config.matter || {};
      
      console.log("Validating Matter configuration...\n");
      
      const result = MatterConfigValidator.validate(matterConfig);
      
      if (result.isValid) {
        console.log("✅ Matter configuration is valid!");
        
        if (result.warnings.length > 0) {
          console.log("\n⚠️  Warnings:");
          result.warnings.forEach(warning => console.log(`   - ${warning}`));
        }
      } else {
        console.log("❌ Matter configuration has errors:");
        result.errors.forEach(error => console.log(`   - ${error}`));
        
        if (result.warnings.length > 0) {
          console.log("\n⚠️  Warnings:");
          result.warnings.forEach(warning => console.log(`   - ${warning}`));
        }
        
        process.exit(1);
      }
      
    } catch (error) {
      console.error("Error validating configuration:", error);
      process.exit(1);
    }
  });

program
  .command("generate-passcode")
  .description("Generate a secure random passcode")
  .option("-c, --count <number>", "Number of passcodes to generate", "1")
  .action((options) => {
    try {
      const count = parseInt(options.count);
      
      if (isNaN(count) || count < 1 || count > 100) {
        console.error("Count must be a number between 1 and 100");
        process.exit(1);
      }
      
      console.log(`Generating ${count} secure passcode${count > 1 ? "s" : ""}:\n`);
      
      for (let i = 0; i < count; i++) {
        const passcode = MatterConfigValidator.generateSecurePasscode();
        const formatted = formatPairingCode(passcode);
        console.log(`${i + 1}. ${passcode} (${formatted})`);
      }
      
    } catch (error) {
      console.error("Error generating passcode:", error);
      process.exit(1);
    }
  });

program
  .command("generate-discriminator")
  .description("Generate a random discriminator")
  .option("-c, --count <number>", "Number of discriminators to generate", "1")
  .action((options) => {
    try {
      const count = parseInt(options.count);
      
      if (isNaN(count) || count < 1 || count > 100) {
        console.error("Count must be a number between 1 and 100");
        process.exit(1);
      }
      
      console.log(`Generating ${count} random discriminator${count > 1 ? "s" : ""}:\n`);
      
      for (let i = 0; i < count; i++) {
        const discriminator = MatterConfigValidator.generateRandomDiscriminator();
        console.log(`${i + 1}. ${discriminator}`);
      }
      
    } catch (error) {
      console.error("Error generating discriminator:", error);
      process.exit(1);
    }
  });

program
  .command("qr-code")
  .description("Generate QR code for Matter commissioning")
  .option("-c, --config <path>", "Path to config.json file", "./config.json")
  .option("--passcode <passcode>", "Override passcode")
  .option("--discriminator <discriminator>", "Override discriminator")
  .option("--vendor-id <vendorId>", "Override vendor ID")
  .option("--product-id <productId>", "Override product ID")
  .action(async (options) => {
    try {
      let matterConfig: MatterConfiguration = {
        enabled: true,
        passcode: 20202021,
        discriminator: 3840,
        vendorId: 0xFFF1,
        productId: 0x8001,
      };
      
      // Load config file if it exists
      const configPath = path.resolve(options.config);
      if (await fs.pathExists(configPath)) {
        const config = await fs.readJson(configPath);
        matterConfig = { ...matterConfig, ...config.matter };
      }
      
      // Override with command line options
      if (options.passcode) {
        matterConfig.passcode = parseInt(options.passcode);
      }
      if (options.discriminator) {
        matterConfig.discriminator = parseInt(options.discriminator);
      }
      if (options.vendorId) {
        matterConfig.vendorId = parseInt(options.vendorId);
      }
      if (options.productId) {
        matterConfig.productId = parseInt(options.productId);
      }
      
      // Validate configuration
      const result = MatterConfigValidator.validate(matterConfig);
      if (!result.isValid) {
        console.error("Invalid Matter configuration:");
        result.errors.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
      }
      
      // Generate QR code (placeholder implementation)
      const setupCode = `MT:${matterConfig.discriminator!.toString().padStart(4, "0")}${matterConfig.passcode!}`;
      const qrCodeUrl = `https://dhrishi.github.io/connectedhomeip/qrcode.html?data=${setupCode}`;
      
      console.log("Matter Commissioning Information:");
      console.log(`Setup Code: ${setupCode}`);
      console.log(`Manual Pairing Code: ${formatPairingCode(matterConfig.passcode!)}`);
      console.log(`Discriminator: ${matterConfig.discriminator}`);
      console.log(`QR Code URL: ${qrCodeUrl}`);
      console.log("\nQR Code (placeholder):");
      
      // Display placeholder QR code in terminal
      qrcode.generate(qrCodeUrl, { small: true });
      
    } catch (error) {
      console.error("Error generating QR code:", error);
      process.exit(1);
    }
  });

program
  .command("init-config")
  .description("Initialize Matter configuration with secure defaults")
  .option("-c, --config <path>", "Path to config.json file", "./config.json")
  .option("--force", "Overwrite existing Matter configuration")
  .action(async (options) => {
    try {
      const configPath = path.resolve(options.config);
      
      let config: any = {};
      
      // Load existing config if it exists
      if (await fs.pathExists(configPath)) {
        config = await fs.readJson(configPath);
        
        if (config.matter && !options.force) {
          console.error("Matter configuration already exists. Use --force to overwrite.");
          process.exit(1);
        }
      }
      
      // Generate secure defaults
      const matterConfig: MatterConfiguration = {
        enabled: true,
        port: 5540,
        discriminator: MatterConfigValidator.generateRandomDiscriminator(),
        passcode: MatterConfigValidator.generateSecurePasscode(),
        vendorId: 0xFFF1, // Test vendor ID - change for production
        productId: 0x8001,
        deviceName: "Homebridge Matter Bridge",
        storageDir: "./persist",
        debugEnabled: false,
        announceInterval: 60,
        commissioningTimeout: 900,
      };
      
      config.matter = matterConfig;
      
      // Write back to file
      await fs.writeJson(configPath, config, { spaces: 2 });
      
      console.log("✅ Matter configuration initialized successfully!");
      console.log(`\nGenerated configuration:`);
      console.log(`  Port: ${matterConfig.port}`);
      console.log(`  Discriminator: ${matterConfig.discriminator}`);
      console.log(`  Passcode: ${matterConfig.passcode} (${formatPairingCode(matterConfig.passcode!)})`);
      console.log(`  Vendor ID: 0x${matterConfig.vendorId!.toString(16).toUpperCase()}`);
      console.log(`  Product ID: 0x${matterConfig.productId!.toString(16).toUpperCase()}`);
      
      console.log(`\n⚠️  Important notes:`);
      console.log(`  - Change vendor ID for production use`);
      console.log(`  - Keep your passcode secure and private`);
      console.log(`  - Configuration saved to: ${configPath}`);
      
    } catch (error) {
      console.error("Error initializing configuration:", error);
      process.exit(1);
    }
  });

function formatPairingCode(passcode: number): string {
  const code = passcode.toString().padStart(8, "0");
  return `${code.slice(0, 3)}-${code.slice(3, 5)}-${code.slice(5)}`;
}

program.parse();