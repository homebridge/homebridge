import fs from "fs";
import { Logger } from "../logger";
import { User } from "../user";

export interface ValueProvider {
  (key: string): string | undefined
}

const noOpProvider: ValueProvider = () => undefined;
const log = Logger.internal;

const getValueFromEnvironmentVariables: ValueProvider = key => process.env[key];

class SecretsFile {
  static _provider: ValueProvider;

  static _load(): void {
    const secretsFilePath = User.secretsFilePath();

    if (!fs.existsSync(secretsFilePath)) {
      log.warn("config.secrets.json (%s) not found.", secretsFilePath);
      SecretsFile._provider = noOpProvider;
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(secretsFilePath, { encoding: "utf8" }));
    } catch {
      log.error("There was a problem reading your config.secrets.json file.");
      SecretsFile._provider = noOpProvider;
      return;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      log.warn("config.secrets.json is not a JSON object.");
      SecretsFile._provider = noOpProvider;
      return;
    }

    const secrets = new Map(Object.entries(parsed)
      .map(([key, value]) => [key, value !== null ? String(value) : undefined]));

    SecretsFile._provider = (key: string) => secrets.get(key);
  }

  static getValue: ValueProvider = key => {
    if (!SecretsFile._provider) {
      SecretsFile._load();
    }

    return SecretsFile._provider(key);
  };
}


export const variableReplacementProviders = {
  Environment: getValueFromEnvironmentVariables,
  SecretsFile: SecretsFile.getValue,
};

export function replaceVars(object: unknown, valueProvider: ValueProvider): void {
  if (!object || typeof object !== "object") {
    return;
  }

  if (Array.isArray(object)) {
    for (const [index, value] of object.entries()) {
      tryReplaceValue(object, index, value, valueProvider);
    }

    return;
  }

  for (const [key, value] of Object.entries(object)) {
    tryReplaceValue(object, key, value, valueProvider);
  }
}

function tryReplaceValue(
  objectOrArray: object | unknown[], keyOrIndex: string | number, value: unknown, valueProvider: ValueProvider,
): void {
  if (typeof value !== "string") {
    // go back to replaceVars in case to potentially descend into another array or object
    replaceVars(value, valueProvider);

    return;
  }

  let didReplace = false;

  // look for variable names surrounded by “${” and ”}”
  // match variable names starting with a letter or underscore and
  // consisting entirely of letters, numbers, and underscores
  const newValue = value.replace(/\$\{([A-Za-z_]\w*)\}/g, (fullMatch, envVarName) => {
    const envVarValue = valueProvider(envVarName);

    if (envVarValue === undefined) {
      return fullMatch;
    }

    didReplace = true;
    return envVarValue;
  });

  if (didReplace) {
    // funky cast to satisfy the type checker
    (objectOrArray as { [keyOrIndex: string | number]: string })[keyOrIndex] = newValue;
  }
}
