First, these instructions are adapted from the instruction here: [FreeNAS 9.3 and 9.10 Jail Installation](https://github.com/nfarina/homebridge/wiki/FreeNAS-9.3-and-9.10-Jail-Installation).

I went through this process and wanted to share the exact steps for anyone who might need them.

1. Create BSD Jail Template in FreeNAS.
   - Jails > Templates > Add Jail Template
   - Template:
     - Name:         FreeBSD
     - OS:           FreeBSD
     - Architecture: x64
     - URL:          http://download.freenas.org/jails/10/x64/freenas-pluginjail-10.3-RELEASE.tgz
     - MTree:        http://download.freenas.org/jails/10/x64/freenas-pluginjail-10.3-RELEASE.mtree
     - Read-only:    Unchecked
2. Create BSD Jail in FreeNAS.
   - Jails > Jails > Add Jail > Advanced
   - Jail:
     - Jail Name: Homebridge
     - Template: FreeBSD
     - IPv4 address: \<static_ip\>
     - Autostart: Checked
     - VIMAGE: Checked
     - All other options default (or based on your custom configuration)
3. Open Shell to new FreeBSD Jail.
    - Jails > Jails > Homebridge > Shell (once you click on Homebridge, icons appear at the bottom).
4. Enable SSH.
    - `vi /etc/rc.conf`
      - sshd_enable="YES"
5. Allow root login. (alternatively you can add a user and use sudo)
    - `vi /etc/ssh/sshd_config`
      - PermitRootLogin YES
6. Start SSH service.
    - `service sshd start`
7. Change root password.
    - `passwd`
    - Follow prompts to change root password.
8. Use putty (or alternative) to SSH into your FreeBSD jail at the configured Static IP \<static_ip\>.
    - Login to FreeBSD jail with root:passwd.
9. Install homebridge.

        pkg install -y node npm dbus avahi-libdns gcc git
        sysrc dbus_enable="YES"
        sysrc avahi_daemon_enable="YES"
        ln -s /usr/local/include/avahi-compat-libdns_sd/dns_sd.h /usr/include/dns_sd.h
        npm install bignum
        npm install -g homebridge --unsafe-perm=true --allow-root
        service dbus start
        service avahi-daemon start
        mkdir ~/.homebridge
        cp /usr/local/lib/node_modules/homebridge/config-sample.json ~/.homebridge/config.json
        npm install -g pm2  --unsafe-perm=true --allow-root
        pm2 startup rcd
        sysrc pm2_enable="YES"

10. Test homebridge installation.
    - `homebridge`
     >Then there may be some error in the CLI (e.g. Platform error),don't  worry ,just modify you configuration file  `~/.homebridge/config.json` ,this usually because you don't install any device module but the "hue" light had been wrote in the config.json.

    - CTRL-C to kill.
11. Install homebridge plugins (example: Nest and Wink).

        npm install -g homebridge-nest
        npm install -g homebridge-wink
        touch ~/package.json #Workaround for Wink issue.
12. Retest homebridge installation.
13. Modify the config.json with your settings.
    - `vi ~/.homebridge/config.json`
14. Retest homebridge installation.
15. Once homebridge is working, set it up to always run.

        pm2 start homebridge -- -D
        pm2 save
