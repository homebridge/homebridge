# Homebridge on Intel Edison

Installing Homebridge on [Edison](https://en.wikipedia.org/wiki/Intel_Edison) wasn't particularly straightforward. Intel's [Yocto Linux](https://www.yoctoproject.org/) image has some outdated tools, its existing mDNS service clashes with Homebridge's dependencies and its package manager doesn't have all the requirements. But I eventualy figured it out, and guess it should take about five hours to complete these steps (including downloading and some lengthy build times). 

## OS

You may want to start with a fresh install of Linux. See the [official instructions](https://software.intel.com/en-us/flashing-firmware-on-your-intel-edison-board-mac-os-x) also. 

Download: [Intel Edison Yocto Poky image](https://downloadcenter.intel.com/download/27074/Intel-Edison-Yocto-Poky-image) from Intel.com and decompress it. The filename is `iot-devkit-prof-dev-image-edison-20160606.zip`. Intel refer to it as version 3.5 on the site but it appears as `Poky (Yocto Project Reference Distro) 1.7.3` when booting.

To flash the Edison via the Arduino breakout board, ensure the switch beside the USB cables is switched towards them and connect both cables _without a USB hub_. 

On OS X, install [dfu-util - Device Firmware Upgrade Utilities](http://dfu-util.sourceforge.net/) using [Homebrew](https://brew.sh/) in Terminal with:

`brew install dfu-util coreutils gnu-getopt`

If you can already connect via serial to the Edison, you can watch the progress better. 

List connected serial devices with: 

`ls /dev/cu.usb*`

```
/dev/cu.usbserial-A903BYXU
```

Connect to your Edison (changing the identifier as appropriate): 

`screen /dev/cu.usbserial-A903BYXU 15200 -L`

You might need to press Enter before anything appears on screen.

In another Terminal tab, `cd` into the image directory and run the flash tool:

`./flashall.sh`

You'll be asked to restart the Edison. 

```
Using U-Boot target: edison-blankcdc
Now waiting for dfu device 8087:0a99
Please plug and reboot the board
```
There is a reset button on Arduino breakout board immediately to the top right of the Intel logo labelled "SW1U15 RESET". Press this for ten seconds and release. When the second LED turns on, the install should start. The image should take a few minutes to install. 

In the serial tab keep an eye on the progress, then login as `root` (you won't be asked for a password) when prompted:

```
Poky (Yocto Project Reference Distro) 1.7.3 edison ttyMFD2

edison login:     
```

*If you have trouble connecting by serial*, read [this article](http://rexstjohn.com/solving-could-not-find-a-pty-with-intel-edison/) by [Rex St John](https://github.com/rexstjohn). I found the [Bloop](https://www.npmjs.com/package/bloop) tool very useful. Install using: `npm install bloop`. Reset previous serial connections with: `bloop clean`. Connect to the Edison without knowing the serial address with: `bloop c`.

*If you're having trouble flashing but can connect by serial*, copy the still compressed zip file to the mounted drive, copy the `ota_update.scr` file from the zip to the root of the drive, and from the Edison run `reboot ota` via SSH.

*If flashing finished too quickly*, you can enter another mode by rebooting and quickly pressing a key before Linux begins to load, where you can find a list of tools with: `env print`

Once logged in, finish the setup through the serial terminal with:

`configure_edison --setup`

I prefer working over SSH because I can scroll back further. Find the Edison's wlan IP address ("inet addr") with:

`ifconfig`

```
...
wlan0     Link encap:Ethernet  HWaddr fc:c2:de:30:a4:19  
          inet addr:192.168.1.9  Bcast:192.168.1.255  Mask:255.255.255.0
...
```

Change back to the other Terminal tab and:

`ssh root@192.168.1.9`

If you get an error because you have a saved SSH key which is no longer valid for that address, remove it with: `ssh-keygen -R 192.168.1.9`

Before doing anything specific, we need to update the package list in the [opkg  package manager](https://wiki.openwrt.org/doc/techref/opkg):

`opkg update`


## NodeJS

The version of Node JS already on Poky is quite old. 

```
root@homebridge:~# node --version
v4.4.3
root@homebridge:~# npm --version
2.15.1
```
It's new enough to run Homebridge itself but the first plugin I tried to install needed a newer version. Unfortunately, it doesn't seem possible to update via NPM:

```
ERROR: npm is known not to run on Node.js v4.4.3
Node.js 4 is supported but the specific version you're running has
a bug known to break npm. Please update to at least 4.7.0 to use this
version of npm. You can find the latest release of Node.js at https://nodejs.org/
```

Node will need [Tar](https://www.gnu.org/software/tar/) to decompress the files, but the version on Edison doesn't have the required `--strip-components` option.

```
root@homebridge:~# tar
BusyBox v1.22.1 (2016-06-06 14:50:27 PDT) multi-call binary.
...
```

So update with:

`opkg install tar`

```
root@homebridge:~# tar --version
tar (GNU tar) 1.27.1
...
```

Install the [N version management tool](https://github.com/tj/n):

`npm install	 -g n`

You can ignore the list of `npm WARN unmet dependency` warnings, all [mraa](https://github.com/intel-iot-devkit/mraa) related.

Install the stable version of Node:

`n stable`

Update NPM:

`npm install -g npm@latest`

To get:

```
root@homebridge:~# node --version
v9.4.0
root@homebridge:~# npm --version
5.6.0
```

## MDNS

Homebridge requires us to use 
[Avahi](http://avahi.org/) mDNS implementation.

We can see the Apple implementation already installed:

```
root@homebridge:~# systemctl list-unit-files | grep mdns
mdns.service                           enabled 
root@homebridge:~# opkg list_installed | grep mdns
mdns - 544-r1
mdns-dev - 544-r1
```

Remove it:

`opkg remove mdns --force-removal-of-dependent-packages`

On other platforms, Avahi is installed from the `libavahi-compat-libdnssd-dev` package, but this specifically is not published to Intel's opkg repository.

First, install Avahi:

`opkg install avahi avahi-dev`

Then we'll build it and copy the missing files. These following instructions were posted as [an issue solution](https://github.com/agnat/node_mdns/issues/73) by [Ashu Joshi](https://github.com/AshuJoshi) and [Alasdair Allan](https://github.com/aallan) – compiled files were also uploaded but are not compatible.

`opkg install texinfo`  
`git clone git://git.0pointer.de/libdaemon && cd libdaemon`  
`autoreconf -i`  
`autoconf configure.ac > configure`  
`chmod uog+x configure`  
`./configure`  
`make`  
`make install`  
`export LIBDAEMON_CFLAGS=-I/usr/local/include`  
`export LIBDAEMON_LIBS=-L/usr/local/lib`  

`cd ~`  
`wget -qO- http://avahi.org/download/avahi-0.6.31.tar.gz | tar xvz && cd avahi-0.6.31`  
`export PTHREAD_CFLAGS='-lpthread'`  
`opkg install libssp-dev intltool`  
`./configure --disable-static --disable-mono --disable-monodoc --disable-gtk3 --disable-gtk --disable-qt3 --disable-python --disable-qt4 --disable-core-docs --enable-compat-libdns_sd --disable-tests --with-distro=none`  
`make -B`  

Ignore the error returned:

```
...
Makefile:621: recipe for target 'all' failed
make: *** [all] Error 2
```

`cd avahi-compat-libdns_sd/`  
`make`

`cp .libs/*.* /usr/lib/`  
`cp dns_sd.h /usr/include/`  


`cd ~`  
`rm -rf libdaemon`  
`rm -rf avahi-0.6.31*`  

`reboot`

## Homebridge

Installing Homebridge with the main command listed on Github didn't work for me but I followed the [fix in an issue](https://github.com/nfarina/homebridge/issues/780#issuecomment-248703377):

`npm install -g --unsafe-perm homebridge hap-nodejs node-gyp`

Ignore the deprecation warnings.

`cd /usr/local/lib/node_modules/homebridge/`  
`npm install --unsafe-perm bignum`  
`cd /usr/local/lib/node_modules/hap-nodejs/node_modules/mdns`  
`node-gyp BUILDTYPE=Release rebuild`

And run Homebridge!

`cd ~`  
`homebridge`

The following warning [can be ignored](https://github.com/nfarina/homebridge#errors-on-startup):
```
*** WARNING *** The program 'nodejs' uses the Apple Bonjour compatibility layer of Avahi
```


## Autostart
To configure autostart, following [this gist](https://gist.github.com/johannrichard/0ad0de1feb6adb9eb61a) by [Johann Richard](https://github.com/johannrichard), first add a service user:

`useradd -M --system homebridge`

Create new directories:

`mkdir /var/lib/homebridge`  
`mkdir /usr/local/lib/node_modules/homebridge/node_modules/node-persist/storage`  

Download and configure config.json – i.e. delete the sample accessories:
 
`wget https://raw.githubusercontent.com/nfarina/homebridge/master/config-sample.json -O /var/lib/homebridge/config.json`  
`nano /var/lib/homebridge/config.json`

Copy the default config:

`cp -r ~/.homebridge/persist /var/lib/homebridge`

Give the service user ownership:

`chown -R homebridge: /var/lib/homebridge`
`chmod 777 /usr/local/lib/node_modules/homebridge/node_modules/node-persist/storage`

Create the service:

`wget https://gist.githubusercontent.com/johannrichard/0ad0de1feb6adb9eb61a/raw/1cf926e63e553c7cbfacf9970042c5ac876fadfa/homebridge -O /etc/default/homebridge`  
`wget https://gist.githubusercontent.com/johannrichard/0ad0de1feb6adb9eb61a/raw/1cf926e63e553c7cbfacf9970042c5ac876fadfa/homebridge.service -O /etc/systemd/system/homebridge.service`

Start the service:

`systemctl daemon-reload`  
`systemctl enable homebridge`  
`systemctl start homebridge`  

Check it's running:

`systemctl status homebridge`

```
● homebridge.service - Node.js HomeKit Server
   Loaded: loaded (/etc/systemd/system/homebridge.service; enabled)
   Active: active (running) since Wed 2018-02-14 19:51:41 UTC; 3s ago
 Main PID: 479 (homebridge)
   CGroup: /system.slice/homebridge.service
           ├─479 homebridge
           ├─485 /bin/sh -c /bin/echo -n "$(npm -g prefix)/lib/node_modules"
           ├─486 /bin/sh -c /bin/echo -n "$(npm -g prefix)/lib/node_modules"
           └─487 npm
```

## Troubleshooting

For logs, run: `journalctl -fu homebridge`.

Try change the username and pin in `config.json`.

## Plugins

I guess the `-g` global option is exceptionally important to remember when installing plugins because of the service user, e.g. `npm install -g homebridge-tplink-smarthome`

After installing a plugin, if necessary edit the correct `config.json` with:
 
`nano /var/lib/homebridge/config.json`

And always restart Homebridge:

`systemctl restart homebridge`  

## Hardware

I bought the [SparkFun Power Block for Intel Edison](https://www.sparkfun.com/products/13727) but it didn't connect to WiFi when I powered it on. If you do decide to try it, you'll need a \#000 philiips head screwdriver.

