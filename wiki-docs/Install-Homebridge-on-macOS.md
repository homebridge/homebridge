[comment]: <> (PLEASE DO NOT UPDATE THESE INSTRUCTIONS UNLESS YOU HAVE TESTED THE CHANGE THOROUGHLY!)

# Homebridge on macOS

This guide provides instructions for installing Homebridge on macOS as a service that will automatically start on boot.

## Installation Options

There are two ways to run Homebridge on macOS:

### Option 1: Virtual Machine (Recommended for Most Users)

**We recommend using the [Homebridge VM Image](https://github.com/homebridge/homebridge-vm-image)** for a streamlined experience. This provides:

- Pre-configured environment with Homebridge, Node.js, and all dependencies
- Automatic updates and easier maintenance
- Better isolation from your main system
- Works on both Intel and Apple Silicon Macs
- Simpler backup and restore process

**[View Homebridge VM Image Installation Instructions →](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Virtual-Machine)**

The VM Image supports UTM (recommended for macOS) and VirtualBox.

### Option 2: Native Installation

The instructions below describe installing Homebridge directly on your macOS system. This method is ideal for:

- Users who want Homebridge running directly on their Mac
- Users who prefer not to use virtualization
- Advanced users who need direct system access
- Users with specific hardware requirements or plugins that need native access

---

## Native Installation Instructions

### Table of Contents

- [Homebridge on macOS](#homebridge-on-macos)
  - [Installation Options](#installation-options)
    - [Option 1: Virtual Machine (Recommended for Most Users)](#option-1-virtual-machine-recommended-for-most-users)
    - [Option 2: Native Installation](#option-2-native-installation)
  - [Native Installation Instructions](#native-installation-instructions)
    - [Table of Contents](#table-of-contents)
    - [Prerequisites](#prerequisites)
    - [Installing Homebridge](#installing-homebridge)
      - [Step 1: Install Node.js](#step-1-install-nodejs)
        - [Download Node.js v22.18.0 macOS Installer](#download-nodejs-v22180-macos-installer)
      - [Step 2: Install Homebridge and Homebridge UI](#step-2-install-homebridge-and-homebridge-ui)
      - [Complete: Login to the Homebridge UI](#complete-login-to-the-homebridge-ui)
    - [How To Uninstall Homebridge](#how-to-uninstall-homebridge)
    - [Multiple Instances](#multiple-instances)
    - [Major Node.js Version Updates](#major-nodejs-version-updates)
    - [Configuration Reference](#configuration-reference)
    - [macOS 15.0 Sequoia](#macos-150-sequoia)
      - [To setup Homebridge on macOS Sequoia to use a self-signed SSL certificate...](#to-setup-homebridge-on-macos-sequoia-to-use-a-self-signed-ssl-certificate)
  - [Need Help?](#need-help)

### Prerequisites

Before you get started, make sure you have the following:

* A computer running a recent version of macOS that is always powered on
* Access to the Terminal app (found in Applications > Utilities or via Spotlight search)
* The ability to copy and paste commands from this guide into Terminal
* This guide is intended for machines that do not yet have Homebridge installed. Please remove any existing installations of Homebridge before you get started
* Apple Silicon / M1/M2/M3 devices are fully supported

### Installing Homebridge

#### Step 1: Install Node.js

Homebridge requires [Node.js](https://en.wikipedia.org/wiki/Node.js) installed on your system to run. Download the LTS version of Node.js (**v22.18.0**) and run the installer with all the default options selected:

<span align="center">

##### [Download Node.js v22.18.0 macOS Installer](https://nodejs.org/dist/v22.18.0/node-v22.18.0.pkg)

</span>

From a Terminal window, test that Node.js is working:

```bash
# Test node.js is working
node -v

# Test npm is working
npm -v
```

#### Step 2: Install Homebridge and Homebridge UI

Install [Homebridge](https://github.com/homebridge/homebridge) and the [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) using the following command:

```bash
sudo npm install -g --unsafe-perm homebridge homebridge-config-ui-x
```

To set up Homebridge as a service that will start on boot, use the provided `hb-service` command:

```bash
sudo hb-service install
```

This command will configure everything required to set up Homebridge and the Homebridge UI as a service.

The Homebridge service will be set up using the user account you are currently logged in as and does not require sudo/root privileges once set up.

The Homebridge `config.json` can be found under `~/.homebridge` and will be created automatically if it does not already exist.

#### Complete: Login to the Homebridge UI

Log in to the web interface by navigating to `http://localhost:8581`.

The [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) web interface allows you to install, remove and update plugins, modify the Homebridge config.json, and manage other aspects of your Homebridge service.

<p align="center">
  <img width="600px" src="https://github.com/user-attachments/assets/5bf20298-26b3-4df4-9031-471e488d2109">
</p>

Review the [Configuration Reference](#configuration-reference) section below for important information about managing your installation.

### How To Uninstall Homebridge

To remove the Homebridge service, run:

```bash
sudo hb-service uninstall
```

To remove Homebridge and the Homebridge UI, run:

```bash
sudo npm uninstall --location=global homebridge homebridge-config-ui-x
```

### Multiple Instances

**💡 Homebridge now supports [[Child Bridges]] which are an easier-to-manage alternative to running multiple instances.**

Some users prefer to run multiple instances of Homebridge.

The `hb-service` command makes this easy via the `--service-name` flag.

[See the `hb-service` documentation for instructions.](https://github.com/homebridge/homebridge-config-ui-x/wiki/Homebridge-Service-Command#multiple-instances)

### Major Node.js Version Updates

It is recommended to run Homebridge on the [current stable LTS](https://nodejs.org/en/about/releases/) version of Node.js. You can update Node.js to the current LTS version by running: 

```bash
sudo hb-service update-node 
```

### Configuration Reference

This table contains important information about your setup. Use this as a reference when configuring or troubleshooting your environment.

|                                  | File Location / Command                              |
|----------------------------------|------------------------------------------------------|
| **Config File Path**             | `~/.homebridge/config.json`                          |
| **Storage Path**                 | `~/.homebridge`                                      |
| **Restart Command**              | `sudo hb-service restart`                            |
| **Stop Command**                 | `sudo hb-service stop`                               |
| **Start Command**                | `sudo hb-service start`                              |
| **View Logs Command**            | `hb-service logs`                                    |
| **Launchctl Service File**       | `/Library/LaunchDaemons/com.homebridge.server.plist` |

<details>
<summary>Click here for the configuration reference for setups done before January 2020</summary>
<br>

|                                  | File Location / Command                                                  |
|----------------------------------|--------------------------------------------------------------------------|
| **Config File Path**             | `~/.homebridge/config.json`                                              |
| **Storage Path**                 | `~/.homebridge`                                                          |
| **Restart Command**              | Run the stop and start commands                                          |
| **Stop Command**                 | `launchctl unload ~/Library/LaunchAgents/com.homebridge.server.plist`    |
| **Start Command**                | `launchctl load ~/Library/LaunchAgents/com.homebridge.server.plist`      |
| **View Logs Command**            | `tail -f ~/.homebridge/homebridge.log`                                   |
| **Launchctl Service File**       | `~/Library/LaunchAgents/com.homebridge.server.plist`                     |

</details>

### macOS 15.0 Sequoia

macOS Sequoia introduced new functionality to control which applications have access to the network. If you experience connection problems, ensure that 'node' has access to the local network in **System Settings > Privacy & Security > Local network**. If there is no switch for 'node', try reinstalling Node.js.

Homebridge logs may contain messages like: `Error: connect EHOSTUNREACH 192.168.0.72:80`

#### To setup Homebridge on macOS Sequoia to use a self-signed SSL certificate...

1. **Do NOT** generate the certificate with Keychain Access. It will export certificate/key combinations in .p12 format with the RC2-40-CBC Algorithm which is NOT supported by OpenSSL 3.x

2. Install Homebrew if you haven't already:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

3. Use Homebrew to install OpenSSL (currently version 3.4.0):
   ```bash
   brew install openssl
   ```

4. Generate the key and certificate signing request (replace `My-Server-Name` with your server name, using hyphens instead of spaces):
   ```bash
   openssl req -new -newkey rsa:2048 -nodes -keyout homebridge.key -out homebridge.csr -subj "/CN=My-Server-Name.local"
   ```

5. Generate a certificate with your desired validity period:
   ```bash
   openssl x509 -req -days 365 -in homebridge.csr -signkey homebridge.key -out homebridge.crt
   ```

6. Convert the certificate and private key to a p12 file (replace `MY_SECRET` with a secure passphrase):
   ```bash
   openssl pkcs12 -export -out homebridge.p12 -inkey homebridge.key -in homebridge.crt -name "Homebridge Certificate" -passout pass:MY_SECRET
   ```

7. Change the owner and group of your p12 file to match the account Homebridge runs under:
   ```bash
   chown myusername:staff homebridge.p12
   ```

8. Change the permissions of your p12 file:
   ```bash
   chmod 600 homebridge.p12
   ```

9. In the Homebridge UI, click the three vertical dots on the upper right and select **Settings**

10. Select **UI Advanced Settings**

11. Expand the **SSL Settings** accordion

12. In the **Path To PKCS#12 Certificate** field, enter the full path to the newly created p12 file

13. In the **PKCS#12 Certificate Passphrase** field, enter the passphrase you used in place of `MY_SECRET` above

14. Click **Save**

15. **Do not** restart the server when asked

16. On the Settings page, click the button next to **JSON Config**

17. In the JSON under "platforms", find the object in the array called "Config". Change its "port" value to 443 (as long as this does not conflict with anything else running on your Mac)

18. Click the **Save** button (floppy disk icon)

19. Restart the Homebridge UI

20. Access your Homebridge server at `https://YOUR_SERVERS_IP_ADDRESS`

---

## Need Help?

- For VM Image installation, see the [Homebridge VM Image Wiki](https://github.com/homebridge/homebridge-vm-image)
- For general Homebridge help, visit the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki)
- Join the [Homebridge Discord](https://discord.gg/homebridge) community