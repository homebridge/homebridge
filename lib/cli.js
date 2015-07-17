import program from 'commander';
import prompt from 'prompt';
import { HOMEBRIDGE_VERSION } from './homebridge';
import { User } from './user';
import { Server } from './server';
import { Provider } from './provider';
import { log, setDebugEnabled } from './logger';
import { camelCaseToRegularForm } from './util';

export default function() {

  // Global options (none currently) and version printout
  program
    .version(HOMEBRIDGE_VERSION)
    .option('-D, --debug', 'turn on debug level logging', () => setDebugEnabled(true));

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
    .action((providerName, options) => new CliProviderSetup(providerName, options).setup());

  // Parse options and execute HomeBridge
  program.parse(process.argv);

  // Display help by default if no commands or options given
  if (!process.argv.slice(2).length) {
    program.help();
  }
}

function runServer(options) {
  
  // get all installed providers
  let providers = Provider.installed(); // array of Provider
  
  // load and validate providers - check for valid package.json, etc.
  try {
    this.providerModules = providers.map((provider) => provider.load());
  }
  catch (err) {
    log.error(err.message);
    process.exit(1);
  }
}

function listInstalledProviders(options) {
  Provider.installed().forEach((provider) => log.info(provider.name));
}

// Encapsulates configuring a provider via the command line.
class CliProviderSetup {
  constructor(providerName, options) {
    
    // if you didn't specify a provider, print help
    if (!providerName) {
      log.error("You must specify the name of the provider to setup. Type 'homebridge providers' to list the providers currently installed.");
      process.exit(1);
    }

    this.providerName = providerName;
    this.options = options; // command-line options (currently none)
  }
  
  setup() {    
    try {
      let provider = new Provider(this.providerName);
      this.providerModule = provider.load({skipConfigCheck: true});
      
      if (this.providerModule.config) {
        
        prompt.message = "";
        prompt.delimiter = "";
        prompt.start();
        prompt.get(this.buildPromptSchema(), (err, result) => {
          
          // add a linebreak after our last prompt
          console.log('');
          
          // apply configuration values entered by the user
          for (let key in result) {
            let value = result[key];
            
            User.config.set(`${this.providerName}.${key}`, value);
          }
          
          this.validateProviderConfig();
        });
      }
      else {
        this.validateProviderConfig();
      }
    }
    catch (err) {
      log.error(`Setup failed: ${err.message}`);
    }
  }
  
  validateProviderConfig() {
    
    let currentlyInsideValidateConfigCall = false;
    
    // we allow for the provider's validateConfig to call our callback immediately/synchronously
    // from inside validateConfig() itself.
    let callback = (err) => {
      
      if (!err) {
        log.info(`Setup complete.`);
      }
      else {
        log.error(`Setup failed: ${err.message || err}`);
      }
    }
    
    currentlyInsideValidateConfigCall = true;
    this.providerModule.validateConfig(callback);
    currentlyInsideValidateConfigCall = false;
  }
  
  // builds a "schema" obejct for the prompt lib based on the provider's config spec
  buildPromptSchema() {
    let properties = {};
    
    for (let key in this.providerModule.config) {
      let spec = this.providerModule.config[key];
      
      // do we have a value for this config key currently?
      let currentValue = User.config.get(`${this.providerName}.${key}`);

      // copy over config spec with some modifications
      properties[key] = {
        description: `\n${spec.description}\n${camelCaseToRegularForm(key).white}:`,
        type: spec.type,
        required: spec.required,
        default: currentValue
      }
    }
    
    return { properties };
  }
}
