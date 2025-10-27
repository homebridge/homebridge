[comment]: <> (PLEASE DO NOT UPDATE THESE INSTRUCTIONS UNLESS YOU HAVE TESTED THE CHANGE THOROUGHLY!)

# Homebridge Virtual Machine Installation Guide

<img align="right" src="https://github.com/homebridge/homebridge-vm-image/raw/latest/assets/Console.png" width="640px">

This guide provides step-by-step instructions for installing Homebridge as a Virtual Machine. We provide Virtual Machine Appliances and Virtual Disks for both x86 and ARM architecture hosts. The Virtual Machine is a preconfigured implementation of Homebridge running on a Debian-based system.

**Recommended for:** Non-Linux systems where Docker or native installation cannot be used, such as Windows or macOS hosts.

The virtual disk is created using a similar process to the Homebridge Raspbian image. It leverages Debian as the operating system, with Node.js, Homebridge, and the Homebridge UI pre-installed and configured.

## Table of Contents

- [Homebridge Virtual Machine Installation Guide](#homebridge-virtual-machine-installation-guide)
  - [Table of Contents](#table-of-contents)
  - [Available Image Formats](#available-image-formats)
    - [Appliance Images](#appliance-images)
    - [Virtual Disk Images](#virtual-disk-images)
    - [Supported CPU Architectures](#supported-cpu-architectures)
  - [Virtual Machine Specifications](#virtual-machine-specifications)
  - [Release Streams](#release-streams)
    - [Download Locations](#download-locations)
  - [Installation Instructions - Appliance](#installation-instructions---appliance)
    - [Using Microsoft Hyper-V Appliance](#using-microsoft-hyper-v-appliance)
      - [Step 1: Download](#step-1-download)
      - [Step 2: Import the Virtual Machine](#step-2-import-the-virtual-machine)
      - [Step 3: Start and Configure](#step-3-start-and-configure)
    - [Using VirtualBox Appliance](#using-virtualbox-appliance)
      - [Step 1: Download](#step-1-download-1)
      - [Step 2: Import the Appliance](#step-2-import-the-appliance)
      - [Step 3: Configure Network (Important)](#step-3-configure-network-important)
      - [Step 4: Start and Configure](#step-4-start-and-configure)
    - [Using UTM Appliance](#using-utm-appliance)
      - [Step 1: Download](#step-1-download-2)
      - [Step 2: Extract and Import](#step-2-extract-and-import)
      - [Step 3: Start and Configure](#step-3-start-and-configure-1)
  - [Installation Instructions - Virtual Disk](#installation-instructions---virtual-disk)
    - [Using Virtual Disk Images](#using-virtual-disk-images)
      - [Step 1: Download the Image](#step-1-download-the-image)
      - [Step 2: Create a New Virtual Machine](#step-2-create-a-new-virtual-machine)
      - [Step 3: Start and Configure](#step-3-start-and-configure-2)
  - [First Boot Setup](#first-boot-setup)
    - [Creating Your Account](#creating-your-account)
    - [What Happens Next](#what-happens-next)
    - [Managing Virtual Machine Settings](#Managing-Virtual-Machine-Settings)
  - [Configuration Reference](#configuration-reference)
  - [Support](#support)

---

## Available Image Formats

### Appliance Images

Appliance images are ready-to-import virtual machines with all settings preconfigured.

| Format | Description | Best For |
|:-------|:------------|:---------|
| OVA | Open Virtual Appliance | VirtualBox |
| UTM | UTM Appliance | UTM on macOS |
| HYPERV | Microsoft Hyper-V Virtual Machine | Windows 10/11 Enterprise, Pro, or Education (Hyper-V) |

> **Windows Users:** Hyper-V is only available on Windows 10/11 Enterprise, Pro, or Education editions. Windows Home Edition does not support Hyper-V. Home Edition users should use VirtualBox instead.

### Virtual Disk Images

Virtual disk images require manual VM creation but offer more flexibility.

| Format | Description | Best For |
|:-------|:------------|:---------|
| QCOW2 | QEMU Copy-On-Write disk image | QEMU/KVM environments |
| VDI | Virtual Disk Image | VirtualBox (alternative format) |
| VHDX | Virtual Hard Disk | Microsoft Hyper-V |
| VMDK | Virtual Machine Disk | VMware products, ESXi |

### Supported CPU Architectures

Choose the architecture that matches your host machine's processor:

| Architecture | Description | Example Hardware |
|:-------------|:------------|:-----------------|
| amd64 | 64-bit Intel/AMD processors | Most Windows PCs, Intel Macs |
| arm64 | 64-bit ARM processors | Apple Silicon Macs (M1/M2/M3), ARM servers |

> **Important:** You must select the image matching your host CPU architecture. An amd64 image will not work on ARM hardware and vice versa.

---

## Virtual Machine Specifications

All Homebridge VM images include the following:

- **Operating System:** Debian 12 ("Bookworm") Lite
- **CPU Architectures:** x86-64 (Intel/AMD) and ARM64 (including Apple Silicon)
- **Virtual Disk Size:** 
  - VHDX and VMDK: 5GB allocated
  - QCOW2 and VDI: 50GB allocated (dynamically expanded)
- **Pre-installed Packages:** Node.js, Homebridge, Homebridge UI, and FFmpeg
  - Exact versions are listed in the manifest file included with each release
- **Guest Additions:** UTM and Hyper-V kernel modules pre-installed

> **Note:** The legacy build documentation is available [here](./README-deprecated.md).

---

## Release Streams

Homebridge VM images are available in three release streams to suit different needs:

| Stream | Node.js[*](https://github.com/nodejs/Release?tab=readme-ov-file#nodejs-release-working-group) | Homebridge | UI | FFmpeg | Recommended For |
|--------|---------|------------|-------|--------|-----------------|
| **Stable/Latest** | LTS | Latest | Latest | Latest | Production use - most stable |
| **Beta** | Current | Beta V2 | Beta | Latest | Testing new features |
| **Alpha** | Current | Alpha | Alpha | Latest | Experimental - developers only |

### Download Locations

All virtual disk and appliance images are packaged in a GitHub releases:

- **Stable/Latest:** [Latest Release](https://github.com/homebridge/homebridge-vm-image/releases/latest)
- **Beta/Alpha:** Select the appropriate tag from [All Releases](https://github.com/homebridge/homebridge-vm-image/tags)

## Installation Instructions - Appliance

---

### Using Microsoft Hyper-V Appliance

The Hyper-V appliance provides the fastest setup for Windows users.

> **Requirements:** Windows 10/11 Enterprise, Pro, or Education (64-bit). Windows Home Edition does not support Hyper-V - use VirtualBox instead.

#### Step 1: Download

1. Download the latest Hyper-V appliance image (**HYPERV**) for your CPU architecture

2. Extract the downloaded archive

#### Step 2: Import the Virtual Machine

1. Open Hyper-V Manager
2. Select **Action** → **Import Virtual Machine**
3. Browse to the extracted appliance folder
4. Complete the import wizard

**Pre-configured Settings:**
- Generation 2 VM
- 4096MB memory (Dynamic Memory disabled)
- Network: Default Switch
- Security: Secure Boot disabled

#### Step 3: Start and Configure

1. Start your VM from Hyper-V Manager
2. Follow the [First Boot Setup](#first-boot-setup) instructions below
3. Connect to the Homebridge UI at the address shown in the console (e.g., `http://192.168.1.100:8581`)

---

### Using VirtualBox Appliance

The OVA appliance provides the simplest setup for VirtualBox users.

#### Step 1: Download

Download the OVA appliance for your CPU architecture:

#### Step 2: Import the Appliance

1. Open VirtualBox
2. Select **File** → **Import Appliance**
3. Browse to the downloaded OVA file
4. Review the settings and click **Import**
5. Wait for the import process to complete

#### Step 3: Configure Network (Important)

1. Select your imported VM
2. Click **Settings** → **Network**
3. Change "Attached to" from NAT to **Bridged Adapter**
4. Select your active network interface
5. Click **OK**

#### Step 4: Start and Configure

1. Start your VM
2. Follow the [First Boot Setup](#first-boot-setup) instructions below
3. Connect to the Homebridge UI at the address shown in the console (e.g., `http://192.168.1.100:8581`)

---

### Using UTM Appliance

The UTM appliance is optimized for macOS users, especially those with Apple Silicon.

#### Step 1: Download

Download the UTM appliance for your CPU architecture:

#### Step 2: Extract and Import

1. Extract the downloaded UTM archive
2. Store the extracted .utm file in a permanent location
3. Open UTM
4. Click the **+** button to create a new VM
5. Select **Open Existing**
6. Browse to the extracted .utm file

#### Step 3: Start and Configure

1. Start your VM from UTM
2. Follow the [First Boot Setup](#first-boot-setup) instructions below
3. Connect to the Homebridge UI at the address shown in the console (e.g., `http://192.168.1.100:8581`)

---

## Installation Instructions - Virtual Disk

### Using Virtual Disk Images

Virtual disk images provide maximum flexibility and work with most virtualization platforms.

#### Step 1: Download the Image

1. Navigate to the appropriate release (Stable, Beta, or Alpha)
2. Download the virtual disk image matching:
   - Your host CPU architecture (amd64 or arm64)
   - Your virtualization platform (QCOW2, VDI, VHDX, or VMDK)
3. Extract the downloaded file if compressed (.gz)

#### Step 2: Create a New Virtual Machine

1. Open your virtualization software (Hyper-V, VirtualBox, Parallels Desktop, ESXi, etc.)
2. Create a new virtual machine with these settings:

**Basic Settings:**
- **Operating System:** Linux → Debian → Debian 12 (64-bit) or Debian 12 (ARM 64-bit)
- **Hyper-V Users:** Select "Generation 1 VM"

**Hardware Requirements:**
- **RAM:** 4GB minimum (recommended: 8GB)
- **CPU:** 1 core minimum (recommended: 2+ cores)
- **Network Adapter:** 
  - **VirtualBox/Parallels:** [Bridged Adapter](https://github.com/homebridge/homebridge/wiki/VirtualBox-and-Parallels-Desktop-VM-Network-Settings)
  - **Hyper-V:** [External Switch](https://docs.microsoft.com/en-us/windows-server/virtualization/hyper-v/get-started/create-a-virtual-switch-for-hyper-v-virtual-machines)
  - **UTM:** Network Mode: Bridged
  - **Others:** The virtual machine needs to use a bridged network interface.

**Disk Configuration:**
- Select "Use an existing virtual hard disk"
- Browse to the extracted virtual disk image file
- **Important:** Store the disk image in a permanent location - it must remain accessible to the VM

3. Complete the VM creation wizard

#### Step 3: Start and Configure

1. Start your VM
2. Follow the [First Boot Setup](#first-boot-setup) instructions below
3. Connect to the Homebridge UI at the address shown in the console (e.g., `http://192.168.1.100:8581`)

---

## First Boot Setup

<img align="right" src="https://github.com/homebridge/homebridge-vm-image/raw/latest/assets/First%20Boot.png" width="640px">

When you first start your Homebridge VM, you'll need to create a local user account.

### Creating Your Account

1. The VM will display a setup wizard in the console window
2. Enter a username (lowercase letters, no spaces)
3. Create a strong password
4. Confirm your password
5. **Save these credentials securely** - you'll need them to:
   - Log into the VM console
   - SSH into the VM for maintenance
   - Perform system updates

### What Happens Next

- The VM will complete its initial configuration
- Network settings will be applied
- The Homebridge UI will start automatically
- The console will display the web interface URL
- On UTM and VirtualBox, the virtual hard disk will automatically expand to 50GB

> **Troubleshooting:** If the first boot setup screen doesn't appear or you accidentally cancel it, simply restart the VM to display it again.


### Managing Virtual Machine Settings

[Virtual Machine Image Configuration Tools](https://github.com/homebridge/homebridge/wiki/Virtual-Machine-Image-Configuration-Tools-(-HB%E2%80%90Config-))

---

## Configuration Reference

For detailed configuration options, system management, and troubleshooting, please refer to the [Debian/Ubuntu Configuration Reference](https://github.com/homebridge/homebridge/wiki/Install-Homebridge-on-Debian-or-Ubuntu-Linux#configuration-reference).

This includes information on:
- Updating Homebridge and Node.js
- Managing the Homebridge service
- Configuring automatic backups
- Troubleshooting common issues
- Security best practices

---

## Support

If you encounter issues or have questions:

1. Check the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki)
2. Search existing [GitHub Issues](https://github.com/homebridge/homebridge-vm-image/issues)
3. Join the [Homebridge Discord #hb-vm-image](https://discord.gg/homebridge) community
4. Create a new issue with detailed information about your problem