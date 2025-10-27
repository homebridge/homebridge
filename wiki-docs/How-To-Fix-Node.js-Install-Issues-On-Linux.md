If you've found yourself with multiple copies of Node.js installed, or need to update Node.js from an old version, these instructions will help you get back to a "standard" setup using `hb-service`.

**:warning: Note that these instructions are destructive. Proceed at your own risk.**

**:warning: If you run any other tools that require Node.js, you may need to reconfigure/reinstall those tools after completing these steps.**

**:warning: If you have access to the Homebridge UI, [[do a backup first|Backup and Restore]]!**

## Step 1: Your Existing Setup

### Check Your OS Version

To run modern versions of Node.js you need to by running Ubuntu 16 / Debian Stretch (9) / Raspbian Stretch (9) or later. You can check your OS version by running this command:

```
cat /etc/os-release | grep VERSION
```

You should not proceed with these instructions if you are running an earlier operating system, instead you should upgrade or re-install your operating system with an up-to-date OS.

:bulb: **Homebridge also provides a [Raspberry Pi Image](https://github.com/homebridge/homebridge-raspbian-image#readme) built on Raspbian Lite with the latest LTS version of Node.js included.**

### Homebridge Storage Folder

Note down where your Homebridge storage folder is, this is the folder than contains your Homebridge `config.json` file.

This could be in one of a few locations, some possibilities are:

* `/home/pi/.homebridge`
* `/home/<YOUR USER>/.homebridge`
* `/var/homebridge`
* `/var/lib/homebridge`

### Existing Plugins

You will need to re-install all your Homebridge plugins after completing these steps. Make a note of which plugins you have installed.

### Remove Existing Homebridge Service

The Homebridge service what makes Homebridge automatically start on boot. As part of this change we will change your process supervisor to use `hb-service` which is backed by `systemd`. To do this you will need to remove your existing Homebridge service.

There are several tools you might be using to run Homebridge as a service:

* `systemd` / `systemctl` / `hb-service`
* `init.d`
* `pm2`

If you are using `systemd` or `hb-service` you can run these commands to remove the service (adjust for your Homebridge service name):

```
sudo systemctl stop homebridge
sudo systemctl disable homebridge
sudo rm -rf /etc/systemd/system/homebridge.service
sudo systemctl daemon-reload
```

If you are running Homebridge with `init.d` you can use these commands to remove the service:

```
sudo service homebridge stop
sudo update-rc.d homebridge remove
rm -rf /etc/init.d/homebridge
```

If you are running Homebridge with `pm2` you can use these commands to remove the service:

```
sudo pm2 stop all
sudo pm2 delete all
```

### Check Homebridge Is Not Running

Check that Homebridge is no longer running before proceeding to the next step.

## Step 2: Remove Node.js and Homebridge

Run [this script](https://gist.githubusercontent.com/oznu/312b54364616082c3c1e0b6b02351f0e/raw/remove-node.sh) to remove all copies of Node.js, Homebridge, and plugins and other npm modules installed on your system:

```
sudo curl -fL https://gist.githubusercontent.com/oznu/312b54364616082c3c1e0b6b02351f0e/raw/remove-node.sh | sudo bash
```

**You should now exit your current terminal session and start a fresh one.**

## Step 3: Copy Homebridge Config To `/var/lib/homebridge`

If your Homebridge storage folder is not already set to `/var/lib/homebridge`, you will need to move it to this location to avoid loosing any Homebridge settings.

```bash
sudo mkdir -p /var/lib
sudo cp -R <PATH TO EXISTING HOMEBRIDGE> /var/lib/homebridge

## EXAMPLES ONLY - RUN ONLY THE COMMAND RELEVANT TO YOU:
sudo cp -R /home/pi/.homebridge /var/lib/homebridge
sudo cp -R /home/<YOUR USER>/.homebridge /var/lib/homebridge
sudo cp -R /var/homebridge /var/lib/homebridge
```

## Step 4: Follow the Wiki Install Guide

You can now safely follow the wiki install guides that explain how to install Node.js and  setup Homebridge as a service again. If you have correctly moved your config to `/var/lib/homebridge` then you won't loose any existing settings.

* [[Install Homebridge on Raspbian]]
* [[Install Homebridge on Debian or Ubuntu Linux]]

## Step 5: Re-install plugins.

You can now use the Homebridge UI to re-install any plugins you previously had installed.

## Future Node.js Updates

The wiki guides will always contain instructions on how to install the latest LTS version of Node.js. When you need to update Node.js again in the future, make sure you refer back to those guides for the correct instructions to avoid having to go through this process again.