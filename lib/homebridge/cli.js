import Server from './server';
import program from 'commander';
import { HOMEBRIDGE_VERSION } from '../homebridge';

export default function() {

  // Global options (none currently) and version printout
  program
    .version(HOMEBRIDGE_VERSION);

  // Run the HomeBridge server
  program
    .command('server')
    .description('Run the HomeBridge server')
    .action((options) =>  new Server(options).run());

  // Parse options and execute HomeBridge
  program.parse(process.argv);

  // Display help by default if no commands or options given
  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}
