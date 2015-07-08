import fs from 'fs';
import cli from './homebridge/cli';

//
// Main HomeBridge Module with global exports.
//

// HomeBridge version
export const HOMEBRIDGE_VERSION = JSON.parse(fs.readFileSync('package.json')).version;

// HomeBridge CLI
export { cli }

// HomeBridge API
