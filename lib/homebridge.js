import fs from 'fs';
import { User } from './user';

//
// Main HomeBridge Module with global exports.
//

// HomeBridge version
export const HOMEBRIDGE_VERSION = JSON.parse(fs.readFileSync('package.json')).version;

// HomeBridge API
export let config = User.config;