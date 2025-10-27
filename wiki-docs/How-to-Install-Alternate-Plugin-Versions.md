## Using the Homebridge UI

Using the [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x), it is possible to install a different version of any plugin you already have installed.

1. To do this, select the **Install Alternate Version** button on the plugin tile:

    <img width="600px" src="https://github.com/homebridge/homebridge/assets/43026681/40f09c85-8499-4e8b-8f00-1c2ddb931b64">

2. Then select the version you want to install:

    <img width="400px" src="https://github.com/homebridge/homebridge/assets/43026681/b4507b74-e29d-49d6-a75e-5a4a12bb0076">

3. Restart Homebridge (or the plugin bridge) to take effect.

## Using the Command Line

To install an alternate plugin version using the command line run, just append `@version` to the end of the regular command (don't include the `v` prefix):

```bash
$ sudo npm install -g --unsafe-perm homebridge-dummy@0.11.77
```

Restart Homebridge (or the plugin bridge) to take effect.
