# Bluetooth Plugins

Most Homebridge plugins that make use of Bluetooth use the [@abandonware/noble](https://github.com/abandonware/noble) package.

The rest of this guide is meant for users of plugins which use this package.

## Plugins Using `@abandonware/noble` For BLE

Here is a subset of some of the **[verified plugins](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)** which use `@abandonware/noble`:

| Plugin  |                                                                 
|---------|
| [homebridge-govee](https://www.npmjs.com/package/homebridge-govee) |
| [homebridge-switchbot](https://github.com/OpenWonderLabs/homebridge-switchbot/) |

If you are using a plugin which uses a different package for BLE connectivity, refer to the plugin-specific instructions/guides.

## System Requirements

### Raspberry Pi/Homebridge RPi Image (Raspbian)

If the Bluetooth does not initially work then you may need to run these commands in the Homebridge terminal:

```bash
$ sudo apt-get install bluetooth bluez libbluetooth-dev libudev-dev pi-bluetooth
$ sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)
```

The second command may need to be run in a direct SSH terminal to the Pi rather than the terminal in the Homebridge UI. Don't be too concerned if it doesn't work.

### Other Debian Systems

```bash
$ sudo apt-get install bluetooth bluez libbluetooth-dev libudev-dev
$ sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)
```

The second command may need to be run in a direct SSH terminal to the Pi rather than the terminal in the Homebridge UI. Don't be too concerned if it doesn't work.

### macOS

Some plugins have reported success with BLE on macOS, others have reported no support.

The Bluetooth control may not work on the latest versions of macOS (even if `noble` is correctly installed). It seems that no discovered devices are reported to the plugin, see [noble issue #225](https://github.com/abandonware/noble/issues/225).

### Windows & Other Systems

See the [noble documentation](https://github.com/abandonware/noble#installation) for instructions specific to your system.

### Docker

For most systems, the Dbus socket is in `/run/dbus`. The socket must be available in the container for a Homebridge plugin to be able to connect to Dbus and access the Bluetooth adapter. When starting with docker run, this can be accomplished by adding `-v /run/dbus:/run/dbus:ro` to the command. If the Dbus socket is in `/var/run/dbus` on the host system, use `-v /var/run/dbus:/run/dbus:ro` instead.

If you are using Docker Compose, add something like the following (adjust as necessary) to your volumes section:

```
volumes:
  - /run/dbus:/run/dbus:ro
```

## Helpful BLE Issues

| Ref | Plugin | Issue | Description |                                                                 
|:---:|--------|-------|------|
| 1 | [homebridge-switchbot](https://github.com/OpenWonderLabs/homebridge-switchbot/) | [#425](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/425#issuecomment-1190864279) | Docker/Noble Issue |
| 2 | [homebridge-switchbot](https://github.com/OpenWonderLabs/homebridge-switchbot/) | [#511](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/511#issuecomment-1292801346) | Bluetooth HCI socket failing to download |
| 3 | [homebridge-switchbot](https://github.com/OpenWonderLabs/homebridge-switchbot/) | [#691](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/691#issuecomment-1510001817) | 404 Error when installing and related system command failure |
| 4 | [homebridge-switchbot](https://github.com/OpenWonderLabs/homebridge-switchbot/) | [#713](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/713#issuecomment-1510022812) | fails due to missing file |

### More Info Ref #3

1. SSH into the server
2. `cd /var/lib/homebridge/node_modules/@switchbot`
3. use `ls -a` to see all folders
4. due to the failed update you will most likely have 2 folders there, one has a dot at the beginning which makes it invisible (that's why you need to use ls -a). Rename both folders with `mv foldername foldername-backup`
5. open the Homebridge shell with `sudo hb-shell`
6. install the bluetooth-hci-socket manually via `npm i @abandonware/bluetooth-hci-socket`. This will remove some SwitchBot Plugin files and folders, but don't worry.
7. After finishing the installation, exit the hb-shell via `exit`
8. The folder with the dot at the beginning needs to be renamed to homebridge-switchbot with `mv .foldername-backup homebridge-switchbot`
9. Reboot time -> `sudo reboot`
10. Use the Homebridge UI to update the Switchbot plugin and afterwards use ssh to restart the server again.
11. Done


### More Info Ref #4
#### First
- @pmcdowall A workaround I found is by Installing Bluetooth tools in DSM [as referred to here.](https://github.com/homebridge/homebridge-syno-spk/wiki/DSM-7:-Enable-Compiling-Of-Native-Modules)

#### Second
- SSH into my Synology NAS and then;
    ```bash
    sudo hb-shell
    cd /volume1/homebridge/
    npm i @abandonware/bluetooth-hci-socket
    npm i @abandonware/noble
    ```
Exit the shell, return to Homebridge UI and update Switchbot.

#### Third
- In case anyone else is running into this issue and the fixes above didn't work for them, [reinstalling Entware](https://github.com/Entware/Entware/wiki/Install-on-Synology-NAS) and the [native BLE build dependencies](https://github.com/homebridge/homebridge-syno-spk/wiki/DSM-7:-Enable-Compiling-Of-Native-Modules) did the trick for me.

- It seems that sometime between my initial installation of the plugin and the most recent updates, something broke in my Entware environment that made the bluetooth-hci + noble builds fail.
