import { getValueFromEnvironmentVariables, replaceVars } from "./replacer";

describe("replacer", () => {
  const varsOfInterest = new Map(Object.entries({
    FOO_TEST: "chipmunk",
    FOO_TEST1: undefined,
    BAR_TEST: "banana",
    BAZ_TEST: undefined,
  }));

  describe("replaceVars", () => {
    it("should replace matched variables where they occur in a string and at any level of nesting", () => {
      const value = { dog: "lorem ipsum ${FOO_TEST}1", cat: [1, true, "${BAR_TEST}", { bird: "${BAR_TEST}" }] };
      const withReplacements = { dog: "lorem ipsum chipmunk1", cat: [1, true, "banana", { bird: "banana" }] };

      replaceVars(value, key => varsOfInterest.get(key));

      expect(value).toStrictEqual(withReplacements);
    });

    it("should ignore unmatched variables", () => {
      // FOO_TEST1 and BAZ_TEST don’t match because they are undefined.
      // BAR_TEST doesn’t match because it is not escaped correctly.
      const value = { dog: "lorem ipsum ${FOO_TEST1}", cat: [1, true, "$BAR_TEST", { bird: "${BAZ_TEST}" }] };
      const copy = JSON.parse(JSON.stringify(value));

      replaceVars(value, key => varsOfInterest.get(key));

      expect(value).toStrictEqual(copy);
    });
  });

  describe("getValueFromEnvironmentVariables", () => {
    const savedEnvVarValues = new Map([...varsOfInterest.keys()].map(name => [name, process.env[name]]));

    beforeAll(() => {
      // modify environment variables for tests
      for (const [name, value] of varsOfInterest) {
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

    it("should return the environment variable value", () => {
      expect(varsOfInterest.size).toBe(4);

      for (const [key, value] of varsOfInterest) {
        expect(getValueFromEnvironmentVariables(key)).toBe(value);
      }
    });
  });
});