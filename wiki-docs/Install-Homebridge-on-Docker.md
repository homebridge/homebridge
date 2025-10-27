[comment]: <> (PLEASE DO NOT UPDATE THESE INSTRUCTIONS UNLESS YOU HAVE TESTED THE CHANGE THOROUGHLY!)

This guide provides step-by-step instructions to show you how to install Homebridge on Docker as a service so it will automatically start on boot.

- [Prerequisites](#prerequisites)
    - [Synology, Unraid, or QNAP NAS Users:](#synology-unraid-or-qnap-nas-users)
    - [Portainer Users:](#portainer-users)
    - [Firewalla Gold and Purple Users:](#firewalla-gold-and-purple-users)
- [Install Homebridge](#install-homebridge)
  - [Step 1: Ensure Docker Compose is installed](#step-1-ensure-docker-compose-is-installed)
  - [Step 2: Create Docker Compose Manifest](#step-2-create-docker-compose-manifest)
  - [Step 3: Start Homebridge](#step-3-start-homebridge)
  - [Complete: Login to the Homebridge UI](#complete-login-to-the-homebridge-ui)
- [Major Node.js Version Updates](#major-nodejs-version-updates)
- [Configuration Reference](#configuration-reference)

# Prerequisites

Before you get started, make sure you have the following ready:

* A Linux host with [Docker installed](https://docs.docker.com/install/) or a NAS that supports Docker.
* Homebridge **does not work** when running in Docker for Mac or Docker for Windows due to [this](https://github.com/docker/for-mac/issues/68) and [this](https://github.com/docker/for-win/issues/543).

### Synology, Unraid, or QNAP NAS Users:

* [Homebridge with Docker on Synology DSM](https://github.com/homebridge/docker-homebridge/wiki/Homebridge-on-Synology)
* [Homebridge with Docker on QNAP Container Station](https://github.com/homebridge/docker-homebridge/wiki/Homebridge-on-QNAP)
* [Homebridge with Docker on Unraid](https://github.com/homebridge/docker-homebridge/wiki/Homebridge-on-Unraid)
* [Homebridge with Docker on TrueNAS Scale](https://github.com/homebridge/docker-homebridge/wiki/Homebridge-on-TrueNAS-Scale)

### Portainer Users:

* [Homebridge with Docker using Portainer](https://github.com/homebridge/docker-homebridge/wiki/Homebridge-on-Portainer)

### Firewalla Gold and Purple Users:

* [Running Homebridge on Firewalla Gold & Purple with Docker](https://github.com/homebridge/docker-homebridge/wiki/Running-Homebridge-on-Firewalla-Gold)

# Install Homebridge

The [Homebridge Docker image](https://github.com/homebridge/docker-homebridge) supports `amd64`, `arm32v6` and `arm64v8` host architectures. The correct image for your system will automatically be downloaded.

## Step 1: Ensure Docker Compose is installed

[Docker Compose](https://docs.docker.com/compose/install/) is the easiest way to start and maintain your Homebridge Docker image. Make sure you have the latest version of the `docker-compose` command installed on your system.

See https://docs.docker.com/compose/install/ for instructions.

## Step 2: Create Docker Compose Manifest

After ensuring Docker Compose is installed create a new file named `docker-compose.yml` that contains the following:

```yml
version: '2'
services:
  homebridge:
    image: homebridge/homebridge:latest
    restart: always
    network_mode: host
    volumes:
      - ./volumes/homebridge:/homebridge
    logging:
      driver: json-file
      options:
        max-size: "10mb"
        max-file: "1"
```

For more details on the environment options see the [homebridge/docker-homebridge project page](https://github.com/homebridge/docker-homebridge).

## Step 3: Start Homebridge

Run the following command to start the Homebridge Docker container:

```
docker-compose up -d
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

# Major Node.js Version Updates

To upgrade Node.js you will need to download the latest version of the Docker image. This can be done using the following commands:

```shell
# run these commands from the same directory you created the docker-compose.yml file in
docker-compose pull
docker-compose up -d
```

After running these commands your Homebridge Docker container will automatically restart if there was an update available.

# Configuration Reference

This table contains important information about your setup. You can use the information provided here as a reference when configuring or troubleshooting your environment after setting up Homebridge using the instructions below.

|                       | File Location / Command                      |
|-----------------------|----------------------------------------------|
| **Config File Path**  | `/homebridge/config.json` (inside container) |
| **Storage Path**      | `/homebridge` (inside container)             |
| **Restart Command**   | `docker restart homebridge`                  |
| **Stop Command**      | `docker stop homebridge`                     |
| **Start Command**     | `docker start homebridge`                    |
| **View Logs Command** | `docker logs -f homebridge`                  |