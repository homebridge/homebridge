export type ConfigType = 'accessory' | 'platform';

export type Config = {
  accessories?: any[];
  bridge: {
    name: string;
    username: string;
    pin: string;
  }
  platforms?: any[];
};
