import { Provider } from './provider';
import { User, Config } from './user';

export class Server {

  constructor(providers:object) {
    this.providers = providers; // providers[name] = loaded provider JS module
  }
  
  run() {
  }
}
