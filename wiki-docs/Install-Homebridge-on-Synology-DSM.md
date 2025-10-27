[comment]: <> (PLEASE DO NOT UPDATE THESE INSTRUCTIONS UNLESS YOU HAVE TESTED THE CHANGE THOROUGHLY!)

This guide provides step-by-step instructions to show you how to install Homebridge Synology DSM 7.

- [Prerequisites](#prerequisites)
- [Installing Homebridge](#installing-homebridge)
    + [Step 1: Add the Homebridge Synology Package Source](#step-1-add-the-homebridge-synology-package-source)
    + [Step 2: Install Homebridge Package](#step-2-install-homebridge-package)
    + [Recommended Post-Install Steps](#recommended-post-install-steps)
    + [Complete: Login to the Homebridge UI](#complete-login-to-the-homebridge-ui)
- [Multiple Instances](#multiple-instances)
- [Updating](#updating)
- [How To Uninstall Homebridge](#how-to-uninstall-homebridge)
- [Configuration Reference](#configuration-reference)

# Prerequisites

Before you get started, make sure you have the following ready:

* A supported Synology NAS running DSM 7

Supported models:

* **x86_64** - All 64 bit Intel / AMD CPU Models
* **evansport** (i686) - DS214play, DS414play, DS415play
* **rtd1296** (armv8) - DS420j, DS220j, RS819, DS418, DS218, DS218play, DS118
* **armada37xx** (armv8) - DS120j, DS119j
* **armada38x** (armv7) - DS419slim, DS218j, RS217, RS816, DS416j, DS416slim, DS216, DS216j, DS116
* **alpine** (armv7) - DS1817, DS1517, DS416, DS2015xs, DS1515, DS715, DS215+

# Installing Homebridge

This package will deploy Homebridge and the Homebridge UI natively on your Synology NAS. It will create a new shared named `homebridge` to store the Homebridge configuration and user data.

This package leverages the Synology supplied NodeJS 22 package.

###  Install Homebridge Package

1. Download the correct SPK for your system from https://synology.homebridge.io (see above for arch types):
2. Go back to Package Center and click "Manual Install" - select the .spk file you downloaded.
3. Click `Agree` when warned about using a package from an unknown publisher.
4. Click `Done` to confirm installation. 

*Please note low power device make take 10-15 minutes to install the package.*

## Recommended Post-Install Steps

* [Enable compiling native modules](https://github.com/homebridge/homebridge-syno-spk/wiki/DSM-7:-Enable-Compiling-Of-Native-Modules)
* [Install ffmpeg with libfdk_aac](https://github.com/homebridge/homebridge-syno-spk/wiki/DSM-7:-ffmpeg-with-libfdk_aac)
* [Install git](https://github.com/homebridge/homebridge-syno-spk/wiki/DSM-7:-Install-git)

## Complete: Login to the Homebridge UI

The [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) web interface will allow you to install, remove and update plugins, and modify the Homebridge config.json and manage other aspects of your Homebridge service.

Once the install has completed, a new Homebridge menu item will be shown in DSM which will open the Homebridge UI or you can navigate to:

```
http://<ip address of your synology nas>:8581
```

If you have the Synology Firewall enabled, make a rule to allow access to port `8581` and the port Homebridge was assigned too. Make sure you are connecting to the LOCAL IP ADDRESS of your NAS, using the QuickConnect URL is unlikely to work.

# Multiple Instances

This installation method does not support multiple instances. Use [[Child Bridges]] instead.

# Updating

You can update Homebridge installing the latest version of the Homebridge package from Package Center.

# How To Uninstall Homebridge

You can uninstall Homebridge from Package Center.

# Configuration Reference

This table contains important information about your setup. You can use the information provided here as a reference when configuring or troubleshooting your environment after setting up Homebridge using the instructions below.

|                               | File Location / Command                     |
|-------------------------------|---------------------------------------------|
| **Config File Path**          | `/volume1/homebridge/config.json`           |
| **Storage Path**              | `/volume1/homebridge`                       |
| **Plugin Path**               | `/volume1/homebridge/node_modules`          |
| **Node Path**                 | `/volume1/@appstore/homebridge/app/bin/node`|
| **Restart Command**           | `sudo hb-service restart`                   |
| **View Logs Command**         | `sudo hb-service logs`                      |
| **Install Plugin**            | `sudo hb-service add homebridge-example`    |
| **Remove Plugin**             | `sudo hb-service remove homebridge-example` |
| **Enter Homebridge Shell**    | `sudo hb-shell`                             |

The Homebridge Synology Package is maintained by this project: https://github.com/homebridge/homebridge-syno-spk