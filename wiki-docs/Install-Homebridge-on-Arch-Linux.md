[comment]: <> (PLEASE DO NOT UPDATE THESE INSTRUCTIONS UNLESS YOU HAVE TESTED THE CHANGE THOROUGHLY!)

This guide provides step-by-step instructions to show you how to install Homebridge on Arch or Manjaro Linux as a service so it will automatically start on boot.

- [Prerequisites](#prerequisites)
- [Installing Homebridge](#installing-homebridge)
  * [Step 1: Install Node.js](#step-1-install-nodejs)
  * [Step 2: Install Homebridge and Homebridge UI](#step-2-install-homebridge-and-homebridge-ui)
  * [Complete: Login to the Homebridge UI](#complete-login-to-the-homebridge-ui)
- [How To Uninstall Homebridge](#how-to-uninstall-homebridge)
- [Multiple Instances](#multiple-instances)
- [Major Node.js Version Updates](#major-nodejs-version-updates)
- [Configuration Reference](#configuration-reference)

# Prerequisites

Before you get started, make sure you have the following ready:

* An Arch or Manjaro Linux machine
* Access to the Terminal. This can be via a desktop Terminal app, or remotely via SSH. You will need the ability to copy and paste commands from this guide into the terminal.
* This guide is intended for a fresh install of Arch Linux, at the very least you should ensure you do not already have Homebridge or Node.js installed on your system before getting started.

# Installing Homebridge

## Step 1: Install Node.js

Install the LTS version of Node.js as well as additional dependencies:

```shell
# Install Node.js and other deps
sudo pacman -Sy nodejs-lts-gallium npm make gcc net-tools

# confirm node is working
node -v
```

## Step 2: Install Homebridge and Homebridge UI

Install [Homebridge](https://github.com/homebridge/homebridge) and the [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) using the following command:

```
sudo npm install -g --unsafe-perm homebridge homebridge-config-ui-x
```

To setup Homebridge as a service that will start on boot you can use the provided `hb-service` command.

```
sudo hb-service install --user homebridge
```

<p align="center">
  <img width="600px" src="https://user-images.githubusercontent.com/3979615/71888439-4291e580-3194-11ea-8687-a3d58f94ba47.gif">
</p>

This command will do everything that is required to setup Homebridge and the Homebridge UI as a service on your system, it will create the user if it does not already exist, and create the default Homebridge `config.json` under `/var/lib/homebridge` if it does not already exist.

When setting up Homebridge as a service using this command, the UI will stay online even if Homebridge is crashing due to a bad plugin or configuration error.

## Complete: Login to the Homebridge UI

The [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) web interface will allow you to install, remove and update plugins, and modify the Homebridge config.json and manage other aspects of your Homebridge service.

Login to the web interface by going to `http://<ip address of your server>:8581`.

<p align="center">
  <img width="600px" src="https://github.com/user-attachments/assets/5bf20298-26b3-4df4-9031-471e488d2109">
</p>

Review the [Configuration Reference](#configuration-reference) at the bottom of this guide.

# How To Uninstall Homebridge

To remove the Homebridge service run:

```
sudo hb-service uninstall
```

To remove Homebridge and Homebridge Config UI X run:

```
sudo npm uninstall -g homebridge homebridge-config-ui-x
```

# Multiple Instances

**:bulb: Homebridge now supports [[Child Bridges]] which are an easier to manage alternative to running multiple instances.**

Some users like to run multiple instances of Homebridge.

The `hb-service` command makes this easy to do via the `--service-name` flag.

[See the `hb-service` documentation for instructions.](https://github.com/homebridge/homebridge-config-ui-x/wiki/Homebridge-Service-Command#multiple-instances)

# Major Node.js Version Updates

It is recommended to run Homebridge on the [current stable LTS](https://nodejs.org/en/about/releases/) version of Node.js. You can update Node.js to the current LTS version of Node.js by running: 

```shell
sudo hb-service update-node 
```

# Configuration Reference

This table contains important information about your setup. You can use the information provided here as a reference when configuring or troubleshooting your environment after setting up Homebridge using the instructions below.

|                               | File Location / Command                  |
|-------------------------------|------------------------------------------|
| **Config File Path**          | `/var/lib/homebridge/config.json`        |
| **Storage Path**              | `/var/lib/homebridge`                    |
| **Restart Command**           | `sudo hb-service restart`                |
| **Stop Command**              | `sudo hb-service stop`                   |
| **Start Command**             | `sudo hb-service start`                  |
| **View Logs Command**         | `sudo hb-service logs`                   |
| **Systemd Service File**      | `/etc/systemd/system/homebridge.service` |
| **Systemd Env File**          | `/etc/default/homebridge`                |