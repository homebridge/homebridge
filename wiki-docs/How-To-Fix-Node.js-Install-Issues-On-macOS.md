If you've found yourself with multiple copies of Node.js installed, or need to update Node.js from an old version, these instructions will help you get back to a "standard" setup using `hb-service`.

**:warning: Note that these instructions are destructive. Proceed at your own risk.**

**:warning: If you run any other tools that require Node.js, you may need to reconfigure/reinstall those tools after completing these steps.**

## Step 1: Your Existing Setup

### Existing Plugins

You will need to re-install all your Homebridge plugins after completing these steps. Make a note of which plugins you have installed.

### Remove Existing Homebridge Service

The Homebridge service what makes Homebridge automatically start on boot. As part of this change we will change your process supervisor to use `hb-service` which is backed by `launchctl`. To do this you will need to remove your existing Homebridge service.

These commands will remove most macOS Homebridge services:

```
launchctl unload ~/Library/LaunchAgents/com.homebridge.server.plist
sudo rm -rf ~/Library/LaunchAgents/com.homebridge.server.plist
```

or 

```
sudo launchctl unload /Library/LaunchDaemons/com.homebridge.server.plist
sudo rm -rf /Library/LaunchDaemons/com.homebridge.server.plist
```

### Check Homebridge Is Not Running

Check that Homebridge is no longer running before proceeding to the next step.

## Step 2: Remove Node.js and Homebridge

Run [this script](https://gist.githubusercontent.com/oznu/312b54364616082c3c1e0b6b02351f0e/raw/remove-node.sh) to remove all copies of Node.js, Homebridge, and plugins and other npm modules installed on your system:

```
curl -fL https://gist.githubusercontent.com/oznu/312b54364616082c3c1e0b6b02351f0e/raw/remove-node.sh | bash
```

## Step 3: Follow the Wiki Install Guide

You can now safely follow the wiki install guides that explain how to install Node.js and  setup Homebridge as a service again. 

* [[Install Homebridge on macOS]]

## Step 4: Re-install plugins.

You can now use the Homebridge UI to re-install any plugins you previously had installed.

## Future Node.js Updates

The wiki guides will always contain instructions on how to install the latest LTS version of Node.js. When you need to update Node.js again in the future, make sure you refer back to those guides for the correct instructions to avoid having to go through this process again.