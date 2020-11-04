import fs from "fs";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadPackageJson(): any {
  const packageJSONPath = path.join(__dirname, "../package.json");
  return JSON.parse(fs.readFileSync(packageJSONPath, { encoding: "utf8" }));
}

export default function getVersion(): string {
  return loadPackageJson().version;
}

export function getRequiredNodeVersion(): string {
  return loadPackageJson().engines.node;
}
