#!/bin/env node

const fs = require('fs');
const semver = require('semver');
const child_process = require('child_process');

function getTagVersionFromNpm(tag) {
  try {
    return child_process.execSync(`npm info ${package.name} version --tag="${tag}"`).toString('utf8').trim();
  } catch (e) {
    return null;
  }
}

// load package.json
const package = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// work out the correct tag
const currentLatest = getTagVersionFromNpm('latest') || '0.0.0';
const currentBeta = getTagVersionFromNpm('beta') || '0.0.0';
const latestNpmTag = semver.gt(currentBeta, currentLatest, { includePrerelease: true }) ? currentBeta : currentLatest;
const publishTag = semver.gt(package.version, latestNpmTag, { includePrerelease: true }) ? package.version : latestNpmTag;

// save the package.json
package.version = publishTag;
fs.writeFileSync('package.json', JSON.stringify(package, null, 4));
