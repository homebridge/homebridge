_All credit to @axemann for these instructions._
***

OK everyone, I believe I have worked out how to get Homebridge installed in a jail in FreeNAS/FreeBSD 9.3. It took a bit of Googling and poking around in things, but you should be able to create a standard jail, log in, and paste the following into a terminal window to get Homebridge installed (I recommend enabling sshd and using putty or another SSH client):

## FreeNAS 9.3

    pkg install -y node npm dbus avahi-libdns
    sysrc dbus_enable="YES"
    sysrc avahi_daemon_enable="YES"
    ln -s /usr/local/include/avahi-compat-libdns_sd/dns_sd.h /usr/include/dns_sd.h
    env CC=/usr/local/bin/gcc48 CXX=/usr/local/bin/g++48 npm install -g homebridge
    npm install -g pm2
    service dbus start
    service avahi-daemon start
    pm2 startup
    sysrc pm2_enable="YES"
    mkdir ~/.homebridge
    cp /usr/local/lib/node_modules/homebridge/config-sample.json ~/.homebridge/config.json

## FreeNAS 9.10

    pkg install -y node npm dbus avahi-libdns gcc
    sysrc dbus_enable="YES"
    sysrc avahi_daemon_enable="YES"
    ln -s /usr/local/include/avahi-compat-libdns_sd/dns_sd.h /usr/include/dns_sd.h
    npm install bignum
    npm install -g homebridge
    npm install -g homebridge-smartthings
    npm install -g pm2
    service dbus start
    service avahi-daemon start
    pm2 startup rcd
    sysrc pm2_enable="YES"
    mkdir ~/.homebridge
    cp /usr/local/lib/node_modules/homebridge/config-sample.json ~/.homebridge/config.json

You'll have to edit the ~/.homebridge/config.json to work with your particular configuration, but that should be documented fairly well elsewhere in the Wiki. 

Once you have your config.json file built and working, run:

    pm2 start homebridge -- -D
    pm2 save

to start Homebridge and have it run as a daemon. PM2 will automatically start the process at boot-time, so no need for any further hackery in that department. :)

Output and Debug logs will be located at ~/.pm2/logs/ for monitoring and troubleshooting purposes.

Just an FYI: This was tested while running as root, which is probably a Very Bad Thing, but I believe it should work properly under another user (but it will have to be installed by a user with root privileges). Also, VIMAGE was enabled on the jail, since I was unable to get the Bonjour/avahi service advertisement to work properly without it during my testing.

Best of luck, and let me know how it goes!
