Homebridge requires [Node.js](https://en.wikipedia.org/wiki/Node.js) installed on your system to run. You will need to update the Node.js runtime from time to time to enable support for new features.

Homebridge (and [verified plugins](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)) supports all current **Active** and **Maintenance** LTS releases of Node.js. At the time of writing, this means we support:

* ~~Node.js `18.x` until April 2025~~
* Node.js `20.x` until April 2026
* Node.js `22.x` until April 2027
* Node.js `24.x` from October 2025 until April 2028

Homebridge does not support odd-numbered releases of Node.js, such as `21.x` and `23.x`.

## Should I Update Node.js?

Updating Node.js is not a risk-free exercise, so users should only do so when required.

* If you are running Node.js **v18.x** or below, now is a good time to update.
* If you are running Node.js **v20.x** there is no urgent need to update, as we will still be supporting this version until April 2026, however, you can still do so if you like.

## Does my operating system support an updated NodeJS

If you are running an older operating system, you will not be able to update your NodeJS installation until your operating system is updated, and the update-node command will fail with `Your version of Linux does not meet the GLIBC version requirements to use this tool to upgrade Node.js`.

To check your GLIBC version, you can run the command `getconf GNU_LIBC_VERSION` on Linux and Raspbian platforms.

| To Install Node.js: | Needed `GLIBC` Version |
|:-------------------:|:----------------------:|
|         `20`        |        `>=2.31`        |

To update your GLIBC version, you will need to update the operating system before updating NodeJS. An operating system update will require rebuilding your setup, but with some simple steps, you will not lose your existing configuration. Creating a Homebridge Archive/Backup and restoring it after the Operating System upgrade will keep your configuration and HomeKit settings. Also, upgrading the operating system on a new SD card will allow you to keep your existing card as an additional backup.

It is also recommended that you shut down your Apple Home hubs during the update and turn them on again after the update is complete.

## How To Update Node.js

If you have followed one of the [Homebridge Install Guides](https://github.com/homebridge/homebridge/wiki), you can refer to the guide for your platform to update Node.js.

### macOS and Linux

For **Linux** and **macOS** users, we have created a tool to help you safely update Node.js using `hb-service` (even if you aren't using `hb-service` to manage the process):

```shell
sudo hb-service update-node
```

This tool will only update Node.js if it can safely do so. If you've installed Node.js in a non-standard way, it will not change your system.

You can roll back to a previous version by appending the version number to the command:

```shell
sudo hb-service update-node 20.10.0
```

### Windows 10

**Windows 10** users can view update instructions [here](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Windows-10#major-nodejs-version-updates).

### Docker

Users running in Docker should update Node.js by pulling down the latest version of the [Homebridge Docker Image](https://github.com/homebridge/docker-homebridge). Please note that we moved the Homebridge Docker image into the homebridge domain in the spring of 2023, and if your install predates that, you will need to update the image location from `oznu/homebridge` to `homebridge/homebridge`.

While not recommended, if you use the "Ubuntu" or "Debian" variant of the image, you can also update inside the container using `hb-service update-node` and then restart manually. Users running the "Alpine Linux" variant cannot use `hb-service update-node`.

## What To Avoid

It is important to update Node.js using the **same method** you originally used to install it, or using `hb-service update-node`.

* Do not update Node.js using instructions you found on some random site on the internet. 
* Avoid `nvm` or `n` - these are great tools for developers but require additional configuration when running Homebridge as a service user.

Failing to adhere to these guidelines will likely result in you having multiple copies of Node.js installed, which will cause many strange problems (if you have done this, see how to fix it on [Linux](https://github.com/homebridge/homebridge/wiki/How-To-Fix-Node.js-Install-Issues-On-Linux) and [macOS](https://github.com/homebridge/homebridge/wiki/How-To-Fix-Node.js-Install-Issues-On-macOS)).
