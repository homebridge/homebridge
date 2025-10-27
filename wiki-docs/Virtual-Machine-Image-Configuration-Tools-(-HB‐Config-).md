# Overview
<img width="640" alt="hb-config" align="right" src="https://github.com/user-attachments/assets/74c59272-5d0e-40b9-ad33-9174b25b111c" />

`hb-config` is a command-line configuration utility designed specifically for the Homebridge VM image. It provides an easy-to-use menu interface for managing your Homebridge installation, including updates, system configuration, and advanced options.

To launch the configuration tool, connect to your Homebridge VM via SSH and run:

```bash
sudo hb-config
```

**Important:** Most operations cannot be performed from the Homebridge UI Terminal and require a proper SSH connection.

<!-- @import "[TOC]" {cmd="toc" depthFrom=1 depthTo=6 orderedList=false} -->

<!-- code_chunk_output -->

- [Overview](#overview)
  - [Main Menu Options](#main-menu-options)
    - [1. Update Node.js](#1-update-nodejs)
    - [2. Update Homebridge](#2-update-homebridge)
    - [3. Restore Config](#3-restore-config)
    - [4. Nginx Options](#4-nginx-options)
      - [Available Options:](#available-options)
      - [Features:](#features)
      - [SSL Certificate Locations:](#ssl-certificate-locations)
    - [5. Advanced Options](#5-advanced-options)
      - [A1 - Change Hostname](#a1---change-hostname)
      - [A2 - Expand Filesystem](#a2---expand-filesystem)
    - [8. Update](#8-update)
  - [Support](#support)

<!-- /code_chunk_output -->

---

## Main Menu Options

### 1. Update Node.js

Updates Node.js to the latest LTS (Long Term Support) version using the `hb-service` utility.

- Automatically updates to the recommended version for Homebridge
- Exits after completion (restart hb-config if needed)

---

### 2. Update Homebridge

Updates Homebridge to the latest version using the official apt package repository.

**Process:**
- Adds/updates the Homebridge GPG key and repository
- Runs apt-get update
- Installs the latest Homebridge package

**Note:** Cannot be run from the Homebridge UI Terminal.

---

### 3. Restore Config

Restores Homebridge to factory default settings by removing all custom configurations, plugins, and settings.

**Warning:** This is a destructive operation that will:
- Remove all installed plugins
- Delete your Homebridge configuration
- Remove any accessories paired to HomeKit
- Require manual removal of the bridge from the iOS Home app
- Reinstall Homebridge with default settings

**Note:** Cannot be run from the Homebridge UI Terminal.

---

### 4. Nginx Options

Configure the Nginx reverse proxy settings for your Homebridge web interface.

#### Available Options:

- **Listen on port 80 (HTTP)** - Enable standard HTTP access
- **Listen on port 443 (HTTPS)** - Enable secure HTTPS access with SSL/TLS
- **Redirect HTTP to HTTPS** - Automatically redirect all HTTP traffic to HTTPS

#### Features:

- Automatically generates and manages self-signed SSL certificates
- Supports custom domain names (edit the server_name directive)
- Compatible with Let's Encrypt certificates
- Configures secure SSL/TLS protocols (TLSv1.2 and TLSv1.3)
- Sets appropriate cipher suites for security
- Enables large file uploads (up to 2GB) for backup restoration

**Warning:** This will overwrite any manual changes made to `/etc/nginx/sites-available/homebridge.local`.

#### SSL Certificate Locations:

- **Default self-signed certificate:** `/etc/nginx/ssl/homebridge.local.crt`
- **Default private key:** `/etc/nginx/ssl/homebridge.local.key`
- **Let's Encrypt example:** `/etc/letsencrypt/live/example.com/fullchain.pem`

---

### 5. Advanced Options

<img width="640" align="right" alt="Advanced Options" src="https://github.com/user-attachments/assets/197c614c-55ab-4c7d-a658-e50ff1bd3d0b" />

Access to system-level configuration options.

---

#### A1 - Change Hostname

Change the network hostname for your Homebridge VM.

**Hostname Requirements:**
- May only contain ASCII letters (a-z, case-insensitive)
- May contain digits (0-9)
- May contain hyphens (-)
- Cannot begin or end with a hyphen
- No spaces, punctuation, or special characters allowed

**Note:** Requires a reboot to take effect.

---

#### A2 - Expand Filesystem

Expands the virtual filesystem to use all available space on the virtual disk.  The virtual disk allocation needs to be increased in the Virtual Machine Settings/Configuration first.

**Details:**
- Useful after increasing the virtual disk size in your hypervisor
- Operation may take several minutes depending on disk size
- Requires a reboot to take effect
- Logs output to `/var/log/diskexpand.log`

---

### 8. Update

Updates the `hb-config` tool itself to the latest version from the official GitHub repository.

**Process:**
- Downloads the latest version from GitHub
- Performs syntax validation
- Replaces the existing tool
- Exits after successful update

**Note:** The tool will exit after updating. Run `sudo hb-config` again to use the new version.

## Support

If you find the Homebridge VM image helpful, please consider starring the project on GitHub:
https://github.com/homebridge/homebridge-vm-image