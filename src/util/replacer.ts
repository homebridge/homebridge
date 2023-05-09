export function replaceVars(object: unknown): void {
  if (!object || typeof object !== "object") {
    return;
  }

  if (Array.isArray(object)) {
    for (const [index, value] of object.entries()) {
      tryReplaceValue(object, index, value);
    }

    return;
  }

  for (const [key, value] of Object.entries(object)) {
    tryReplaceValue(object, key, value);
  }
}

function tryReplaceValue(objectOrArray: object | unknown[], keyOrIndex: string | number, value: unknown): void {
  if (typeof value !== "string") {
    // go back to replaceVars in case to potentially descend into another array or object
    replaceVars(value);

    return;
  }

  let didReplace = false;

  // look for variable names surrounded by “${” and ”}”
  // match variable names starting with a letter or underscore and
  // consisting entirely of letters, numbers, and underscores
  const newValue = value.replace(/\$\{([A-Za-z_]\w*)\}/g, (fullMatch, envVarName) => {
    const envVarValue = process.env[envVarName];

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
