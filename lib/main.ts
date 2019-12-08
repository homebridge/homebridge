import * as cli from './cli';
import {_system as log} from "./logger";

async function bootstrap() {
    process.title = 'homebridge';
    log.warn(`bootstrap [${process.title}]`);
    cli.run();
}

bootstrap();