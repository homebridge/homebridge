This page contains the possible characteristic warnings and errors you may see in the Homebridge log.

> :warning: **These warnings / errors do not indicate a problem with Homebridge, but with the offending plugin. Any issues should be directed to the plugin's project page, not the Homebridge project.**

## This plugin slows down Homebridge...

If you see this message in the logs it means the plugin was very slow to respond from a request to get the current status or update the state of an accessory. Plugins that respond slowly can impact the responsiveness of the entire bridge.

👤 **If you're an end user, you should report this issue to the plugin developer.**
* Moving slow plugins to a [[Child Bridge|Child Bridges]] can prevent it from impacting other plugins.

🧑‍💻 **If you're the plugin developer:**

* Make sure the `callback()` is called. 
* Make sure you are catching any possible exceptions and still calling the `callback()` even if an error occurred.
* If the action does take some time to complete, adjust your plugin code to return the `callback()` instantly, and call [characteristic.updateValue](https://developers.homebridge.io/#/api/characteristics#characteristicupdatevalue) once the action has completed.
* Recommend your users run your plugin as a [[Child Bridge|Child Bridges]]. This won't prevent the log message from occurring, but will prevent your plugin from impacting other plugins. 

## This plugin generated a warning from the characteristic...

If you see this message in the log, the plugin attempted to set an invalid value for a certain characteristic. This is just an informative warning message, Homebridge will automatically correct the value to a valid one.

👤 **If you're an end user, you should report this issue to the plugin developer.**
* If the plugin is still functioning correctly, you can ignore these warnings.
* Run Homebridge in debug mode `(-D)` to provide the developer with the full stack trace.

🧑‍💻 **If you're the plugin developer:**

* Ensure you are only setting valid values.
* Valid values for each characteristic type are available here: https://developers.homebridge.io/
* Check that you don't set `null` or `undefined` values when they are not supported. 
* You can get a full stack trace to see where this exception was thrown by starting Homebridge in debug mode (`-D`).

## This plugin threw an error from the characteristic...

If you see this message in the log, the plugin threw an unhandled exception while processing the SET or GET request for the characteristic.

👤 **If you're an end user, you should report this issue to the plugin developer.**
* Run Homebridge in debug mode `(-D)` to provide the developer with the full stack trace.

🧑‍💻 **If you're the plugin developer:**
* Make sure you catch and handle any potential exception that may be thrown while processing your plugin's GET or SET handlers.
* You can get a full stack trace to see where this exception was thrown by starting Homebridge in debug mode (`-D`).

## This plugin is taking long time to load...

If you see this message, the plugin is preventing Homebridge from starting up while, this could be because it's waiting for additional configuration, or a bug in the plugin code.

👤 **If you're an end user:**
* Check the plugin logs to see if it's waiting for configuration, for example the `homebridge-hue` plugin might be waiting for you to press the "Link" button on your Hue hub.
* If you are sure the plugin is configured correctly and the logs give no indication of what the problem is, then you should report this issue to the plugin developer. 

🧑‍💻 **If you're the plugin developer:**
* This message will only appear if you are using the legacy "Static Platform" type, consider moving to a "Dynamic Platform". Dynamic platforms allow you to add and remove accessories at anytime and don't prevent Homebridge from loading other plugins while your plugin discovers accessories.
* Make sure you catch any errors that could possibly occur during startup that might prevent your code from reaching the `callback()` function.
