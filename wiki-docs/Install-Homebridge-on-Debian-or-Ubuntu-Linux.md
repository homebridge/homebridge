[comment]: <> (PLEASE DO NOT UPDATE THESE INSTRUCTIONS UNLESS YOU HAVE TESTED THE CHANGE THOROUGHLY!)

This guide provides step-by-step instructions to show you how to install Homebridge on Debian, Ubuntu or Raspberry Pi OS or other debian-based distros as a service so it will automatically start on boot.

- [Prerequisites](#prerequisites)
- [Installing Homebridge](#installing-homebridge)
  * [Step 1: Add Homebridge Repository](#step-1-add-homebridge-repository)
  * [Step 2: Install Homebridge](#step-2-install-homebridge)
  * [Complete: Login to the Homebridge UI](#complete-login-to-the-homebridge-ui)
- [Multiple Instances](#multiple-instances)
- [Updating](#updating)
- [How To Uninstall Homebridge](#how-to-uninstall-homebridge)
- [Configuration Reference](#configuration-reference)

# Prerequisites

Before you get started, make sure you have the following ready:

* A Debian, Ubuntu or Raspberry Pi OS Linux machine (or similar).
* Access to the Terminal. This can be via a desktop Terminal app, or remotely via SSH. You will need the ability to copy and paste commands from this guide into the terminal.

Supported architectures:

* x86_64
* armhf (armv6 / armv7)
* aarch64 (arm64)

# Installing Homebridge

## Step 1: Add Homebridge Repository

Add the Homebridge Repository GPG key:

```bash
curl -sSfL https://repo.homebridge.io/KEY.gpg | sudo gpg --dearmor | sudo tee /usr/share/keyrings/homebridge.gpg  > /dev/null
```

Add the Homebridge Repository to the system sources:

```bash
echo "deb [signed-by=/usr/share/keyrings/homebridge.gpg] https://repo.homebridge.io stable main" | sudo tee /etc/apt/sources.list.d/homebridge.list > /dev/null
```


## Step 2: Install Homebridge

Update repositories:

```
sudo apt-get update
```

Install Homebridge:

```
sudo apt-get install homebridge
```

## Complete: Login to the Homebridge UI

The [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) web interface will allow you to install, remove and update plugins, and modify the Homebridge config.json and manage other aspects of your Homebridge service.

Login to the web interface by going to `http://<ip address of your server>:8581`.

To find the IP address of your server you can run:

```
hostname -I
```

<p align="center">
  <img width="600px" src="https://github.com/user-attachments/assets/5bf20298-26b3-4df4-9031-471e488d2109">
</p>

Review the [Configuration Reference](#configuration-reference) at the bottom of this guide.



# Multiple Instances

This installation method does not support multiple instances. Use [[Child Bridges]] instead.

# Updating

You can update Homebridge and the bundled Node.js runtime by installing the latest version of the Homebridge package using `apt`, and not impact your existing homebridge configuration.

Update repositories:

```
sudo apt-get update
```

Install latest version of the Homebridge package:

```
sudo apt-get upgrade homebridge
```

Please note that this will install the homebridge apt pkg versions of NodeJS, Homebridge and Homebridge-Config-UI-X overwriting any local changes to those packages. 

## Downgrading to previous release

This will downgrade the homebridge apt package version to an earlier release ie `1.1.0` and not remove your existing homebridge configuration.  A list of previous releases is [here.](https://github.com/homebridge/homebridge-apt-pkg/releases) This will install the homebridge apt pkg versions of NodeJS, Homebridge and Homebridge-Config-UI-X overwriting any local changes.

```
sudo apt-get remove homebridge
sudo apt-get install homebridge=1.1.0
```

# How To Uninstall Homebridge

To uninstall Homebridge run:

```
sudo apt-get remove homebridge
```

Optionally, remove the Homebridge repository:

```
sudo rm -rf /etc/apt/sources.list.d/homebridge.list
```

Optionally, to uninstall and **remove all plugins and user config run**: 

```bash
# WARNING: This will delete /var/lib/homebridge, all your plugins, and Homebridge config.
sudo apt-get purge homebridge
```

# Configuration Reference

This table contains important information about your setup. You can use the information provided here as a reference when configuring or troubleshooting your environment after setting up Homebridge using the instructions below.

|                               | File Location / Command                     |
|-------------------------------|---------------------------------------------|
| **Config File Path**          | `/var/lib/homebridge/config.json`           |
| **Storage Path**              | `/var/lib/homebridge`                       |
| **Plugin Path**               | `/var/lib/homebridge/node_modules`          |
| **Node Path**                 | `/opt/homebridge/bin/node`                  |
| **Restart Command**           | `sudo hb-service restart`                   |
| **Stop Command**              | `sudo hb-service stop`                      |
| **Start Command**             | `sudo hb-service start`                     |
| **View Logs Command**         | `sudo hb-service logs`                      |
| **Install Plugin**            | `sudo hb-service add homebridge-example`    |
| **Remove Plugin**             | `sudo hb-service remove homebridge-example` |
| **Enter Homebridge Shell**    | `sudo hb-shell`                             |

<details>
<summary>Click here for the configuration reference for setups done before May 2022</summary>
<br>

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

</details>

<details>
<summary>Click here for the configuration reference for setups done before January 2020</summary>
<br>

|                               | File Location / Command                  |
|-------------------------------|------------------------------------------|
| **Config File Path**          | `/var/lib/homebridge/config.json`        |
| **Storage Path**              | `/var/lib/homebridge`                    |
| **Restart Command**           | `systemctl restart homebridge`           |
| **Stop Command**              | `systemctl stop homebridge`              |
| **Start Command**             | `systemctl start homebridge`             |
| **View Logs Command**         | `journalctl -f -n 100 -u homebridge`     |
| **Systemd Service File**      | `/etc/systemd/system/homebridge.service` |
| **Systemd Env File**          | `/etc/default/homebridge`                |

</details>