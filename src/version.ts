import fs from "fs";
import path from "path";
import semver from "semver";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadPackageJson(): any {
  const packageJSONPath = path.join(__dirname, "../package.json");
  return JSON.parse(fs.readFileSync(packageJSONPath, { encoding: "utf8" }));
}

export default function getVersion(): string {
  return loadPackageJson().version;
}

/**
 * Returns the versions string set to the API object.
 */
export function getServerVersion(): string {
  const version = getVersion();

  const prerelease = semver.prerelease(version);
  if (prerelease && prerelease[0] === "beta") {
    return semver.inc(version, "patch")!; // 1.y.x-beta.z turns into 1.y.x
  }

  return version;
}

/**
 * If current version is a beta release this method returns the revision.
 * For example for the version 1.3.0-beta.4 the method returns the number 4.
 * For a non beta release lik 1.3.0 it will return null.
 */
export function getBetaRevision(): number | null {
  const version = getVersion();

  const prerelease = semver.prerelease(version);
  if (prerelease && prerelease[0] === "beta") {
    return parseInt(prerelease[1]);
  }

  return null;
}

export function getRequiredNodeVersion(): string {
  return loadPackageJson().engines.node;
}
