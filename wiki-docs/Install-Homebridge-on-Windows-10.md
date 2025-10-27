[comment]: <> (PLEASE DO NOT UPDATE THESE INSTRUCTIONS UNLESS YOU HAVE TESTED THE CHANGE THOROUGHLY!)

This guide provides step-by-step instructions to show you how to install Homebridge on Windows 10 / 11 as a service so it will automatically start on boot. Note: these instructions were originally written for Windows 10, but apply equally well to Windows 11.

- [Prerequisites](#prerequisites)
- [Install Homebridge](#install-homebridge)
  * [Step 1: Install Node.js](#step-1-install-nodejs)
  * [Step 2: Install Homebridge](#step-2-install-homebridge)
  * [Step 3: Setup Homebridge as a Service](#step-3-setup-homebridge-as-a-service)
- [Manage and Configure Homebridge](#manage-and-configure-homebridge)
  * [With the Homebridge UI](#with-the-homebridge-ui)
  * [Using the command line](#using-the-command-line)
- [How To Uninstall Homebridge](#how-to-uninstall-homebridge)
- [Multiple Instances](#multiple-instances)
- [Additional Utilities](#additional-utilities)
- [Major Node.js Version Updates](#major-nodejs-version-updates)
- [Configuration Reference](#configuration-reference)

# Prerequisites

> **:warning: Some users report their iOS devices are not able to connect Homebridge running natively on Windows 10 / 11.** <br>
> For this reason we recommend running Homebridge in a Linux virtual machine instead.<br>
> If you are using Windows 10 / 11 Pro / Edu / Enterprise, you can follow [our guide for setting up Homebridge using Hyper-V](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Windows-10-Using-Hyper-V), otherwise, see the [required network settings](https://github.com/homebridge/homebridge/wiki/VirtualBox-and-Parallels-Desktop-VM-Network-Settings) for a VM running in Virtual Box or VMWare Workstation.

Before you get started, make sure you have the following ready:

* A computer running an update-to-date version of Windows 10 / 11 (this guide is based on 1903).
* An account with Administrator Privileges.

# Install Homebridge

## Step 1: Install Node.js

Homebridge requires [Node.js](https://en.wikipedia.org/wiki/Node.js) installed on your system to run. Download the Active LTS version of Node.js (August 2024: **v20**) and run the installer with all the default options selected:

<span align="center">


#### [Node.js active LTS prebuilt installer](https://nodejs.org/en/download/prebuilt-installer)

</span>

Open a new **Node.js Command Prompt** window as administrator, then check that Node.js and NPM have installed correctly by running the following commands:

```bash
# test node.js is working
node -v

# test npm is working
npm -v
```

![nodejs-admin-prompt](https://user-images.githubusercontent.com/3979615/63936518-51a8ae80-caa3-11e9-8035-12b6ebbb20cf.gif)

## Step 2: Install Homebridge

From the administrator Node.js command prompt, run the following command to install Homebridge and the [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x):

```
npm install -g --unsafe-perm homebridge homebridge-config-ui-x
```

## Step 3: Setup Homebridge as a Service

To install Homebridge as a service we use the `hb-service` command provided by the [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) plugin:

```
hb-service install
```

![hb-service-install](https://user-images.githubusercontent.com/3979615/63936029-34bfab80-caa2-11e9-8cd6-abfecdc540a4.gif)

If you see a Windows Firewall warning, make sure you grant Node.js permissions to access your private network.

# Manage and Configure Homebridge

## With the Homebridge UI

To access the Homebridge UI go to `http://localhost:8581` in your browser.

The [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) will allow you to install, remove and update plugins, and modify the Homebridge `config.json`.

<p align="center">
  <img width="600px" src="https://user-images.githubusercontent.com/3979615/71886653-b16d3f80-3190-11ea-9ff8-49dc4ae4fff0.png">
</p>

Review the [Configuration Reference](#configuration-reference) at the bottom of this guide.

## Using the command line

To view your pairing QR code, you'll need to view the logs which are stored in the `$HOME\.homebridge\homebridge.log` file. You can view the from a Node.js command prompt with this command:

```
hb-service logs
```

To edit your `config.json` file you can open the `$HOME\.homebridge\config.json` file in a code editor of your choosing ([VS Code](https://code.visualstudio.com/) is a good option with syntax checking).

**Do not edit the `config.json` file using the a word processor that does text formatting as this will corrupt the file.**

After making any changes to your `config.json` you need to restart Homebridge using by stopping and starting the service in Task Manager. You can also run this command from a Node.js command prompt:

```
hb-service stop
hb-service start
```

# How To Uninstall Homebridge

Delete the service run the following command from a Node.js administrator command prompt:

```
hb-service uninstall
```

Remove Homebridge and Homebridge Config UI X:

```
npm uninstall -g homebridge homebridge-config-ui-x
```

You can optionally delete all Homebridge data stored in `$HOME\.homebridge` and uninstall Node.js.

# Multiple Instances

**:bulb: Homebridge now supports [[Child Bridges]] which are an easier to manage alternative to running multiple instances.**

Some users like to run multiple instances of Homebridge.

The `hb-service` command makes this easy to do via the `--service-name` flag.

[See the `hb-service` documentation for instructions.](https://github.com/homebridge/homebridge-config-ui-x/wiki/Homebridge-Service-Command#multiple-instances)

# Additional Utilities

Some plugins may require you to have [`git`](https://en.wikipedia.org/wiki/Git) installed, or the [`windows-build-tools`](https://www.npmjs.com/package/windows-build-tools) to compile native modules.

### git

While installing certain plugins you may encounter the `spawn git ENOENT` or `ENOGIT` error. To resolve this issue you need to install the `git` utility. You can download the installer from https://git-scm.com/downloads.

### windows-build-tools

The [`windows-build-tools`](https://www.npmjs.com/package/windows-build-tools) allow Homebridge plugins to compile native code for your platform. While increasingly rare, some plugins will require this. To install the [`windows-build-tools`](https://www.npmjs.com/package/windows-build-tools) open a **Node.js command prompt as an Administrator** and run:

```
npm install --global windows-build-tools
```

# Major Node.js Version Updates

It is recommended to run Homebridge on the [current stable LTS](https://nodejs.org/en/about/releases/) version of Node.js. As at August 2024, the Active LTS version was v20. You can download new releases from the [Node.js website](https://nodejs.org/en/download/).

Before updating Node.js, stop Homebridge:

```shell
hb-service stop
```

Run the Node.js installer with the default options.

Once installed, run this command to rebuild the modules:

```shell
# This command can take a very long time to run. Be patient.
hb-service rebuild
```

Then start Homebridge again:

```
hb-service start
```



# Configuration Reference

This table contains important information about your setup. You can use the information provided here as a reference when configuring or troubleshooting your environment after setting up Homebridge using the instructions below.

|                       | File Location / Command                                    |
|-----------------------|------------------------------------------------------------|
| **Config File Path**  | `%HOMEPATH%\.homebridge\config.json`                       |
| **Storage Path**      | `%HOMEPATH%\.homebridge`                                   |
| **Restart Command**   | `hb-service restart`                                       |
| **Stop Command**      | `hb-service stop`                                          |
| **Start Command**     | `hb-service start`                                         |
| **View Logs Command** | `hb-service logs`                                          |