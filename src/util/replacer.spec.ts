import { replaceVars } from "./replacer";

describe("replacer", () => {
  describe("replaceVars", () => {
    const envVarsOfInterest = new Map(Object.entries({
      FOO_TEST: "chipmunk",
      FOO_TEST1: undefined,
      BAR_TEST: "banana",
      BAZ_TEST: undefined,
    }));

    const savedEnvVarValues = new Map([...envVarsOfInterest.keys()].map(name => [name, process.env[name]]));

    beforeAll(() => {
      // modify environment variables for tests
      for (const [name, value] of envVarsOfInterest) {
        if (value) {
          process.env[name] = value;
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

    it("should replace matched variables where they occur in a string and at any level of nesting", () => {
      expect(process.env.FOO_TEST).toBeDefined();
      expect(process.env.BAR_TEST).toBeDefined();

      const value = { dog: "lorem ipsum ${FOO_TEST}1", cat: [1, true, "${BAR_TEST}", { bird: "${BAR_TEST}" }] };
      const withReplacements = { dog: "lorem ipsum chipmunk1", cat: [1, true, "banana", { bird: "banana" }] };

      replaceVars(value);

      expect(value).toStrictEqual(withReplacements);
    });

    it("should ignore unmatched variables", () => {
      expect(process.env.FOO_TEST1).toBeUndefined();
      expect(process.env.BAZ_TEST).toBeUndefined();
      expect(process.env.BAR_TEST).toBeDefined();

      // FOO_TEST1 and BAZ_TEST don’t match because they are undefined.
      // BAR_TEST doesn’t match because it is not escaped correctly.
      const value = { dog: "lorem ipsum ${FOO_TEST1}", cat: [1, true, "$BAR_TEST", { bird: "${BAZ_TEST}" }] };
      const copy = JSON.parse(JSON.stringify(value));

      replaceVars(value);

      expect(value).toStrictEqual(copy);
    });
  });
});