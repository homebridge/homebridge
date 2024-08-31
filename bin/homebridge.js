#!/usr/bin/env node

//
// This executable sets up the environment and runs the Homebridge CLI.
//

import { realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.title = 'homebridge'

// Find the Homebridge lib
const __filename = fileURLToPath(import.meta.url)
const lib = join(dirname(realpathSync(__filename)), '../dist')

// Convert the path to a file URL
const libUrl = pathToFileURL(join(lib, 'cli.js')).href

// Run Homebridge
import(libUrl).then(({ default: run }) => run())
