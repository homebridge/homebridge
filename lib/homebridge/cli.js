import program from 'commander';
import { HOMEBRIDGE_VERSION } from '../homebridge';
import { Server } from './server';
import { Provider } from './provider';

export default function() {

  // Global options (none currently) and version printout
  program
    .version(HOMEBRIDGE_VERSION);

  // Run the HomeBridge server
  program
    .command('server')
    .description('Run the HomeBridge server.')
    .action(runServer);

  program
    .command('providers')
    .description('List installed providers.')
    .action(listInstalledProviders);
  
  program
    .command('setup [provider]')
    .description('Sets up a new HomeBridge provider or re-configures an existing one.')
    .action(setupProvider);

  // Parse options and execute HomeBridge
  program.parse(process.argv);

  // Display help by default if no commands or options given
  if (!process.argv.slice(2).length) {
    program.help();
  }
}

function runServer(options) {
  
  // get all installed providers
  let providers:Array<Provider> = Provider.installed();
  
  // load and validate providers - check for valid package.json, etc.
  try {
    this.providerModules = providers.map((provider) => provider.load());
  }
  catch (err) {
    console.log(err.message);
    process.exit(1);
  }
}

function listInstalledProviders(options) {
  Provider.installed().forEach((provider) => console.log(provider.name));
}

function setupProvider(providerName, options) {
  
  // if you didn't specify a provider, print help
  if (!providerName) {
    console.log("You must specify the name of the provider to setup. Type 'homebridge providers' to list the providers currently installed.");
    program.help();
  }
  
  try {
    let provider = new Provider(providerName);
  }
  catch (err) {
    
  }
}