import fs from 'fs';
import { User } from './user';
import { Logger } from './logger';

//
// Main HomeBridge Module with global exports.
//

// HomeBridge version
export const HOMEBRIDGE_VERSION = JSON.parse(fs.readFileSync('package.json')).version;

// HomeBridge API
export let config = User.config; // instance of Config
export let logger = Logger.forProvider; // logger('provider-name') -> instance of Logger