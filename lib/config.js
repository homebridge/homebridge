import fs from 'fs';

export class Config {
  
  constructor(path, data = {}) {
    this.path = path;
    this.data = data;
  }
  
  get(key) {
    this.validateKey(key);
    let [providerName, keyName] = key.split(".");
    return this.data[providerName] && this.data[providerName][keyName];
  }
  
  set(key, value) {
    this.validateKey(key);
    let [providerName, keyName] = key.split(".");
    this.data[providerName] = this.data[providerName] || {};
    this.data[providerName][keyName] = value;
    this.save();
  }
  
  validateKey(key) {
    if (key.split(".").length != 2)
      throw new Error(`The config key '${key}' is invalid. Configuration keys must be in the form [my-provider].[myKey]`);
  }
  
  static load(configPath) {
    // load up the previous config if found
    if (fs.existsSync(configPath))
      return new Config(configPath, JSON.parse(fs.readFileSync(configPath)));
    else
      return new Config(configPath); // empty initial config
  }
  
  save() {
    fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }
}