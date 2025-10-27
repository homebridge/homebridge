This guide provides step-by-step instructions to show you how to install Homebridge on Raspbian, Debian or Ubuntu as a service so it will automatically start on boot.

This guide will show you how to install Homebridge as a service using systemd manually without Homebridge Config UI X. If you want to use a Homebridge Config UI X to manage your Homebridge server see [[the wiki|Home]].

- [Prerequisites](#prerequisites)
- [Installing Homebridge](#installing-homebridge)
  * [Step 1: Assume Root](#step-1-assume-root)
  * [Step 2: Install Node.js and Homebridge](#step-2-install-nodejs-and-homebridge)
  * [Step 3: Create Homebridge Service User](#step-3-create-homebridge-service-user)
  * [Step 4: Create Homebridge Storage Directory](#step-4-create-homebridge-storage-directory)
  * [Step 5: Create Default config.json](#step-5-create-default-configjson)
  * [Step 6: Create Systemd Service](#step-6-create-systemd-service)
    + [Create Service File](#create-service-file)
    + [Create Environment File](#create-environment-file)
  * [Step 7: Fix Permissions](#step-7-fix-permissions)
  * [Step 8: Reload Systemd and Start Homebridge](#step-8-reload-systemd-and-start-homebridge)
- [Manage and Configure Homebridge](#manage-and-configure-homebridge)
  * [Using the command line](#using-the-command-line)
- [Major Node.js Version Updates](#major-nodejs-version-updates)
- [Configuration Reference](#configuration-reference)

# Prerequisites

Before you get started, make sure you have the following ready:

* A Debian or Ubuntu Linux machine, or a Raspberry Pi running Raspbian.
* Access to the Terminal. This can be via a desktop Terminal app, or remotely via SSH. You will need the ability to copy and paste commands from this guide into the terminal.
* This guide is intended for a fresh install of Ubuntu or Debian Linux, at the very least you should ensure you do not already have Homebridge or Node.js installed on your system before getting started.

# Installing Homebridge

## Step 1: Assume Root

All the steps in this guide assume you are running as the `root` user.

```shell
sudo su
```

## Step 2: Install Node.js and Homebridge

Install the LTS version of Node.js from the official repository, as well as additional dependencies:

```shell
curl -sL https://deb.nodesource.com/setup_16.x | bash -
apt-get install -y nodejs gcc g++ make python

# test node is working
node -v
```

<details>
<summary>Raspberry Pi 1 and Zero users click here for alternative Node.js installation instructions.</summary>
<br>

> The installation of Node.js on arm32v6 devices such as the Raspberry Pi 1 and Raspberry Pi Zero is not supported by the official repository using the steps above. Instead use the following commands to install Node.js.

```shell
# update repos
sudo apt-get update

# install deps
sudo apt-get install -y gcc g++ make python git

# install node and npm
curl -Lf# "https://unofficial-builds.nodejs.org/download/release/v16.16.0/node-v16.16.0-linux-armv6l.tar.gz" | sudo tar xzf - -C /usr/local --strip-components=1 --no-same-owner

# test node is working
node -v
```

</details>

Now install Homebridge:

```
npm install -g --unsafe-perm homebridge
```

## Step 3: Create Homebridge Service User

This is the user Homebridge will run under.

```shell
useradd -m --system homebridge
```

## Step 4: Create Homebridge Storage Directory

This is where Homebridge will store all it's config and cache. Other plugins may also use this directory to store persistent data.

```shell
mkdir -p /var/lib/homebridge
```

## Step 5: Create Default config.json

Your Homebridge `config.json` file is located at `/var/lib/homebridge`. Please select **one** of the options below to create the initial `config.json` file on your system:

Use the following command to create the default `config.json` file:

> **Copy and paste this entire block into the terminal as one command, then press enter!**

```shell
cat >/var/lib/homebridge/config.json <<EOL
{
    "bridge": {
        "name": "Homebridge",
        "username": "CB:22:3D:E2:CE:31",
        "port": 51826,
        "pin": "033-44-254"
    },
    "accessories": [],
    "platforms": []
}
EOL
```

## Step 6: Create Systemd Service

### Create Service File

Use the command below to create the required `/etc/systemd/system/homebridge.service` file:

> **Copy and paste this entire block into the terminal as one command, then press enter!**<br>
> **Do not use a text editor. This template includes variables that get populated by bash as the command is executed.**

```shell
cat >/etc/systemd/system/homebridge.service <<EOL
[Unit]
Description=Homebridge
After=syslog.target network-online.target

[Service]
Type=simple
User=homebridge
EnvironmentFile=/etc/default/homebridge
ExecStart=$(which homebridge) \$HOMEBRIDGE_OPTS
Restart=on-failure
RestartSec=3
KillMode=process
CapabilityBoundingSet=CAP_IPC_LOCK CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW CAP_SETGID CAP_SETUID CAP_SYS_CHROOT CAP_CHOWN CAP_FOWNER CAP_DAC_OVERRIDE CAP_AUDIT_WRITE CAP_SYS_ADMIN
AmbientCapabilities=CAP_NET_RAW

[Install]
WantedBy=multi-user.target
EOL
```

### Create Environment File

Use the command below to create the required `/etc/default/homebridge` file:

> **Copy and paste this entire block into the terminal as one command!**<br>
> **Do not use a text editor. This template includes variables that get populated by bash as the command is executed.**

```shell
cat >/etc/default/homebridge <<EOL
# Defaults / Configuration options for homebridge
# The following settings tells homebridge where to find the config.json file and where to persist the data (i.e. pairing and others)
HOMEBRIDGE_OPTS=-U /var/lib/homebridge -I

# If you uncomment the following line, homebridge will log more
# You can display this via systemd's journalctl: journalctl -f -u homebridge
# DEBUG=*
EOL
```

## Step 7: Fix Permissions

Ensure the `homebridge` user can access the storage directory:

```shell
chown -R homebridge: /var/lib/homebridge
```

## Step 8: Reload Systemd and Start Homebridge

This will ensure Homebridge starts on boot:

```shell
systemctl daemon-reload
systemctl enable homebridge
systemctl start homebridge
```

# Manage and Configure Homebridge

## Using the command line

To view your pairing QR code, you'll need to view the logs. To do this run this command:

```
sudo journalctl -f -n 500 -u homebridge
```

To edit your `config.json` file you can use the `nano` text editor:

```
sudo nano /var/lib/homebridge/config.json
```

After making any changes to your `config.json` you need to restart Homebridge:

```
systemctl restart homebridge
```

# Major Node.js Version Updates

This guide provides instructions on how to install the [current stable LTS](https://nodejs.org/en/about/releases/) version of Node.js. Should you need to upgrade to the next LTS in the future repeat the commands in Step 2 (this guide will be updated for each LTS).

# Configuration Reference

This table contains important information about your setup. You can use the information provided here as a reference when configuring or troubleshooting your environment after setting up Homebridge using the instructions below.

|                       | File Location / Command              |
|-----------------------|--------------------------------------|
| **Config File Path**  | `/var/lib/homebridge/config.json`    |
| **Storage Path**      | `/var/lib/homebridge`                |
| **Restart Command**   | `systemctl restart homebridge`       |
| **Stop Command**      | `systemctl stop homebridge`          |
| **Start Command**     | `systemctl start homebridge`         |
| **View Logs Command** | `journalctl -f -n 100 -u homebridge` |