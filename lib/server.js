import { Provider } from './provider';
import { User, Config } from './user';

export class Server {

  constructor(providers) {
    this.providers = providers; // providers[name] = loaded provider JS module
  }
  
  run() {
  }
}
