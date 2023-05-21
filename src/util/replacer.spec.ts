import path from "path";
import fs from "fs-extra";
import { variableReplacementProviders, replaceVars } from "./replacer";
import { User } from "../user";

describe("replacer", () => {
  const varsOfInterest: { [key: string]: string | undefined } = {
    FOO_TEST: "chipmunk",
    FOO_TEST1: undefined,
    BAR_TEST: "banana",
    BAZ_TEST: undefined,
  };

  describe("replaceVars", () => {
    it("should replace matched variables where they occur in a string and at any level of nesting", () => {
      const value = { dog: "lorem ipsum ${FOO_TEST}1", cat: [1, true, "${BAR_TEST}", { bird: "${BAR_TEST}" }] };
      const withReplacements = { dog: "lorem ipsum chipmunk1", cat: [1, true, "banana", { bird: "banana" }] };

      replaceVars(value, key => varsOfInterest[key]);

      expect(value).toStrictEqual(withReplacements);
    });

    it("should ignore unmatched variables", () => {
      // FOO_TEST1 and BAZ_TEST don’t match because they are undefined.
      // BAR_TEST doesn’t match because it is not escaped correctly.
      const value = { dog: "lorem ipsum ${FOO_TEST1}", cat: [1, true, "$BAR_TEST", { bird: "${BAZ_TEST}" }] };
      const copy = JSON.parse(JSON.stringify(value));

      replaceVars(value, key => varsOfInterest[key]);

      expect(value).toStrictEqual(copy);
    });
  });

  describe("getValueFromEnvironmentVariables", () => {
    const provider = variableReplacementProviders.Environment;

    const savedEnvVarValues = new Map(Object.keys(varsOfInterest).map(name => [name, process.env[name]]));

    beforeAll(() => {
      // modify environment variables for tests
      for (const [name, value] of Object.entries(varsOfInterest)) {
        if (value) {
          process.env[name] = value as string | undefined;
        } else {
          delete process.env[name];
        }
      }
    });

    afterAll(() => {
      // revert modified environment variables
      for (const [name, value] of savedEnvVarValues) {
        if (value) {
          process.env[name] = value;
        } else {
          delete process.env[name];
        }
      }
    });

    it("should return the environment variable value", () => {
      for (const [key, value] of Object.entries(varsOfInterest)) {
        expect(provider(key)).toBe(value);
      }
    });
  });

  describe("getValueFromSecretsFile", () => {
    const provider = variableReplacementProviders.SecretsFile;

    const homebridgeStorageFolder = path.resolve(__dirname, "../mock");
    const secretsFilePath = path.resolve(homebridgeStorageFolder, "config.secrets.json");

    beforeAll(async () => {
      await fs.ensureDir(homebridgeStorageFolder);
      await fs.writeJson(secretsFilePath, varsOfInterest);
      User.setStoragePath(homebridgeStorageFolder);
    });

    afterAll(async () => {
      await fs.remove(homebridgeStorageFolder);
    });

    it("should return the secret file value", () => {
      for (const [key, value] of Object.entries(varsOfInterest)) {
        expect(provider(key)).toBe(value);
      }
    });
  });
});