export interface ValueProvider {
  (key: string): string | undefined
}

export const getValueFromEnvironmentVariables: ValueProvider = key => process.env[key];

export const variableReplacementProviders: { readonly [key: string]: ValueProvider | undefined } = {
  Environment: getValueFromEnvironmentVariables,
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
