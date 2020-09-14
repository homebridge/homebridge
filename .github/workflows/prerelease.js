#!/bin/env node

const fs = require("fs");
const semver = require("semver");
const child_process = require("child_process");

const packageJSON = JSON.parse(fs.readFileSync("package.json", "utf8"));

function getTagVersionFromNpm(tag) {
  try {
    return child_process.execSync(`npm info ${packageJSON.name} version --tag="${tag}"`).toString("utf8").trim();
  } catch (e) {
    throw e;
  }
}

// betaVersion is a custom property we put into the package.json to indicate which release we want to tag
const projectBetaVersion = packageJSON.betaVersion;
if (!projectBetaVersion) {
  throw new Error("Unable to calculate the next prerelease version. 'betaVersion' was not set in the package.json")
}

const latestReleaseBeta = getTagVersionFromNpm("beta"); // like 0.7.0-beta.12
const betaAsRelease = semver.inc(latestReleaseBeta, "patch"); // will produce 0.7.0 (needed for the equality check below)

let publishTag;
if (semver.eq(projectBetaVersion, betaAsRelease)) { // check if we are releasing another version for the latest beta
  publishTag = latestReleaseBeta; // set the current latest beta to be incremented
} else {
  publishTag = projectBetaVersion; // start of with a new beta version
}

// save the package.json
packageJSON.version = publishTag;
fs.writeFileSync("package.json", JSON.stringify(packageJSON, null, 2));
