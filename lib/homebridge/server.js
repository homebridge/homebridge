import { Provider } from './provider';

export default class Server {
  
  run() {
    // get all installed providers
    let providers:Array<Provider> = Provider.installed();
    
    // validate providers - check for valid package.json, etc.
    providers.forEach((provider) => provider.load());
    
    console.log(`Loaded ${providers.length} providers.`);
  }
}
