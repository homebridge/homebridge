This article will explain how to backup and restore your Homebridge instance.

A Homebridge backup generated using the [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) contains the entire contents of your Homebridge storage directory, which includes your Homebridge config, cached accessories, HomeKit pairings, plugin information, and Homebridge UI user accounts.

The backups can be used to rollback your existing system, or migrate to a new server.

Backup archives are cross-platform compatible, for example, a backup archive generated on Homebridge running on Windows 10 can be restored to Homebridge running on a Raspberry Pi, or vice versa.

## Backup

1. Log in to the [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x), and from the side menu, click `Settings` and select `Backup & Restore` option.
2. Clicking the *Backup Now* button

This will generate and download a `.tar.gz` file containing the entire contents of your Homebridge storage folder, including your `config.json`, a list of installed plugins, cached accessories, and HomeKit pairing information.

<p align="center">
<img alt="homebridge-ui-backup" width="600px" src="https://github.com/user-attachments/assets/6e133616-f746-4ae9-85be-93da57c1f11c">
</p>

## Restore

You can restore a previously generated backup archive using the [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x).

**:warning: If you use this tool to migrate from one host to another, shut down or stop the old host before restoring!**

<p align="center">
<img alt="homebridge-ui-backup" width="600px" src="https://github.com/user-attachments/assets/a3bbf73e-cf06-4871-80c1-54d25f1c33c5">
</p>

1. Ensure you have set up Homebridge using one of the methods described in the [Homebridge wiki](https://github.com/homebridge/homebridge/wiki).
2. Log in to the [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x), and from the side menu, click `Settings` and select `Backup & Restore` option.
3. Select the `Restore Now` option, and a new window will appear where you can upload your backup file.
4. Click `Restore`.

Your Homebridge backup will be restored, and any missing plugins will be installed. Once the operation has completed, click *Restart Homebridge*.

You can use the `Backup & Restore` window to manage the automated backups that your system may create. Use the three buttons to:

- Directly restore this backup without having to download and re-upload the file
- Download this backup file
- Delete this backup file

## Connection Issues After Restoring

In some cases, after doing a restore, you may need to [[Reset Homebridge|Connecting-Homebridge-To-HomeKit#how-to-remove-homebridge]] and re-add the bridge in the Home app. 

## Backup and Restore without the Homebridge UI

To make a backup without the Homebridge UI, you can archive or make a copy of the Homebridge storage directory (the one that contains your `config.json` file). To restore, extract or copy the contents to the Homebridge storage directory. You will need to manually reinstall any plugins.
