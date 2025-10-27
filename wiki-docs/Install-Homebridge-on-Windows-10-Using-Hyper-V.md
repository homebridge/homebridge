[comment]: <> (PLEASE DO NOT UPDATE THESE INSTRUCTIONS UNLESS YOU HAVE TESTED THE CHANGE THOROUGHLY!)

# Homebridge on Windows using Hyper-V

This guide provides instructions for installing Homebridge on Windows 10/11 using Microsoft Hyper-V virtual machines.

## Recommended Installation Method

**We recommend using the [Homebridge VM Image](https://github.com/homebridge/homebridge-vm-image)** for the best experience on Windows with Hyper-V. This provides:

- Pre-configured Debian-based virtual machine
- Automatic updates for Homebridge, Node.js, and plugins
- Better performance and stability
- Simplified setup process
- Regular security updates

**[View Homebridge VM Image Installation Instructions →](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Virtual-Machine)**

---

## Legacy Installation Method (Docker-based)

The instructions below describe the legacy Docker-based installation method using a Boot2Docker ISO. This method is still functional but is no longer actively maintained.

**Note:** New users should prefer the [Homebridge VM Image](https://github.com/homebridge/homebridge-vm-image) method above.

### Table of Contents

- [Homebridge on Windows using Hyper-V](#homebridge-on-windows-using-hyper-v)
  - [Recommended Installation Method](#recommended-installation-method)
  - [Legacy Installation Method (Docker-based)](#legacy-installation-method-docker-based)
    - [Table of Contents](#table-of-contents)
    - [Prerequisites](#prerequisites)
    - [Enable the Hyper-V Role](#enable-the-hyper-v-role)
    - [Create External Virtual Switch](#create-external-virtual-switch)
    - [Create Homebridge Virtual Machine](#create-homebridge-virtual-machine)
      - [homebridge-vm-image.iso (70 MB)](#homebridge-vm-imageiso-70-mb)
    - [Manage Homebridge](#manage-homebridge)
    - [Hyper-V Manager](#hyper-v-manager)
    - [How To Uninstall Homebridge](#how-to-uninstall-homebridge)
    - [Major Node.js Version Updates](#major-nodejs-version-updates)
    - [Configuration Reference](#configuration-reference)
  - [Need Help?](#need-help)

### Prerequisites

Before you get started, make sure you have the following:

* A computer running an up-to-date version of Windows 10/11 Enterprise, Pro, or Education (64-bit)
* ⚠️ **Windows 10/11 Home Edition is NOT supported** - it cannot run Hyper-V
* VT-x / AMD-V capability enabled in your system BIOS
* An account with Administrator privileges
* A DHCP-enabled network

### Enable the Hyper-V Role

1. Right-click on the Windows button and select **Apps and Features**
2. Select **Programs and Features** on the right under related settings
3. Select **Turn Windows Features on or off**
4. Select **Hyper-V** and click **OK**

<p align="center">
  <img alt="homebridge-win-10-enable-hyper-v" src="https://user-images.githubusercontent.com/3979615/85977323-c039fe00-ba1f-11ea-9adb-f939b02d2476.png">
</p>

When the installation has completed, you will be prompted to restart your computer.

### Create External Virtual Switch

You need to create a virtual switch that allows the Homebridge virtual machine to connect to your local network.

1. Open **Hyper-V Manager** (press the Windows key and type "Hyper-V Manager")
2. Select the server in the left pane, or click **Connect to Server...** in the right pane, then select **Local Computer** and click **OK**
3. In Hyper-V Manager, select **Virtual Switch Manager...** from the Actions menu on the right
4. Under the Virtual Switches section, select **New virtual network switch**
5. Under "What type of virtual switch do you want to create?", select **External**
6. Select the **Create Virtual Switch** button
7. Under Virtual Switch Properties, give the new switch a name such as **External VM Switch**
8. Under Connection Type, ensure that **External Network** is selected and **Allow management operating system to share this network adapter** is checked
9. Select the physical network card to be paired with the new virtual switch (your ethernet or WiFi adapter)

<p align="center">
  <img alt="homebridge-win-10-hyper-v-create-virtual-switch" src="https://user-images.githubusercontent.com/3979615/85977876-cc728b00-ba20-11ea-8ca1-c03f76c69ede.png">
</p>

10. Select **Apply** to create the virtual switch. You will likely see a warning message. Click **Yes** to continue.

<p align="center">
  <img alt="homebridge-win-10-hyper-v-create-virtual-switch-apply-changes" src="https://user-images.githubusercontent.com/3979615/85977953-f7f57580-ba20-11ea-9a7a-f44476eac58c.png">
</p>

11. Select **OK** to close the Virtual Switch Manager window

### Create Homebridge Virtual Machine

Download the legacy Homebridge VM ISO file:

<span align="center">

#### [homebridge-vm-image.iso (70 MB)](https://github.com/homebridge/homebridge-vm-image-boot2docker/releases/latest/download/homebridge-vm-image.iso)

**⚠️ Save the ISO to a permanent location - it must remain attached to your virtual machine. ⚠️**

</span>

Follow these steps to create your virtual machine:

1. In Hyper-V Manager, select **New** then **Virtual Machine...** from the Actions menu on the right
2. On the *Before You Begin* tab, click **Next**
3. On the *Specify Name and Location* tab, give your virtual machine a name, such as **Homebridge**
4. On the *Specify Generation* tab, choose **Generation 1**
5. On the *Assign Memory* tab, allocate at least 1024MB of RAM, and **UNCHECK** the "Use Dynamic Memory" checkbox
6. On the *Configure Networking* tab, set the Connection to **External VM Switch** (created in the previous step)
7. On the *Connect Virtual Hard Disk* tab, set the hard disk size to 16GB or larger
8. On the *Installation Options* tab, select "Install an operating system from a bootable CD/DVD-ROM", then select "Image File" and choose the **homebridge-vm-image.iso** file you downloaded
9. On the *Summary* tab, click **Finish**

Once created, double-click on the virtual machine in Hyper-V Manager, then click **Start**.

The VM will boot and start Homebridge. You can manage Homebridge by navigating to the address displayed in the console.

<p align="center">
  <img src="https://user-images.githubusercontent.com/3979615/86241831-fb3a5e00-bbe6-11ea-8070-f3e6c2bf5ec6.png">
</p>

### Manage Homebridge

The [Homebridge Config UI X](https://github.com/homebridge/homebridge-config-ui-x) web interface allows you to install, remove and update plugins, modify the Homebridge config.json, and manage other aspects of your Homebridge service.

Login to the web interface by navigating to `http://<ip address of your server>:8581`. You can access this from any device on your local network.

To find the IP address of your server, you can run:

```bash
hostname -I
```

<p align="center">
  <img width="600px" src="https://github.com/user-attachments/assets/5bf20298-26b3-4df4-9031-471e488d2109">
</p>

Review the [Configuration Reference](#configuration-reference) section below for important information about managing your installation.

### Hyper-V Manager

You can safely close the Hyper-V Manager and Virtual Machine windows. The Homebridge virtual machine will continue to run in the background and will automatically start when your computer restarts.

You can access the console again at any time by opening the Hyper-V Manager app and double-clicking on the Homebridge virtual machine.

### How To Uninstall Homebridge

You can remove the Homebridge Hyper-V Virtual Machine using the Hyper-V Manager program. You will need to stop the VM before you can delete it.

### Major Node.js Version Updates

To update Node.js to the latest LTS version, run the following command in the Homebridge terminal:

```bash
sudo hb-service update-node
```

### Configuration Reference

This table contains important information about your setup. Use this as a reference when configuring or troubleshooting your environment.

|                                          | File Location / Command    |
|------------------------------------------|----------------------------|
| **Config File Path** (inside container)  | `/homebridge/config.json`  |
| **Storage Path** (inside container)      | `/homebridge`              |
| **Restart Command**                      | `docker restart homebridge`|
| **Stop Command**                         | `docker stop homebridge`   |
| **Start Command**                        | `docker start homebridge`  |
| **View Logs Command**                    | `docker logs -f homebridge`|

---

## Need Help?

- For the recommended VM Image installation, see the [Homebridge VM Image Wiki](https://github.com/homebridge/homebridge-vm-image)
- For general Homebridge help, visit the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki)
- Join the [Homebridge Discord](https://discord.gg/homebridge) community