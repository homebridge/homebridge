Adapted from [FreeNAS 9.3 and 9.10 Jail Installation](https://github.com/nfarina/homebridge/wiki/FreeNAS-9.3-and-9.10-Jail-Installation) and [FreeNAS 9.10 BSD Jail](https://github.com/nfarina/homebridge/wiki/FreeNAS-9.10-BSD-Jail).

1. Create a jail

	- Jails > Add Jail
	- Jail:
		- Jail Name: Homebridge
		- Template: ---
		- IPv4 address: <static_ip>
		- Autostart: Yes
		- VIMAGE: Yes
	
2. Open a Shell to the Jail

	- SSH into your FreeNas Box
	
	```shell
	ssh root@192.168.0.100
	```
	
	- Lookup the jail id of the HomeBridge jail
	
	```console
	$ jls
	   JID  IP Address      Hostname                      Path
	    17  192.168.0.151   homebridge                    /mnt/Jails/homebridge
	```

3. Login to that jail (optionally specifying a shell)

	```console
	$ jexec 17 csh
	root@homebridge$ 
	```
	
4. Update any packages in that shell (optional, but good practice)

	```console
	pkg update && pkg upgrade
	```

5. Install and activate system dependencies

	```console
	pkg install -y node npm dbus avahi-libdns gcc
	sysrc dbus_enable="YES"
	sysrc avahi_daemon_enable="YES"
	ln -s /usr/local/include/avahi-compat-libdns_sd/dns_sd.h /usr/include/dns_sd.h
	service dbus start
	service avahi-daemon start
	```

6. Install homebridge itself

	Note the `--unsafe-perm`, which allows access to `/usr/local/lib/node_modules/homebridge/node_modules/mdns/.node-gyp`

	```console
	npm install -g --unsafe-perm homebridge
	mkdir ~/.homebridge
	cp /usr/local/lib/node_modules/homebridge/config-sample.json ~/.homebridge/config.json
	```

7. Install homebridge plugins of your choice

	 You can explore all available plugins at the NPM website by [searching for the keyword `homebridge-plugin`](https://www.npmjs.com/search?q=homebridge-plugin). 
	
	 For example:
	
	 ```console
	 npm install -g homebridge-nest
	 ```

8. Modify the config.json with your settings.

	```console
	nano ~/.homebridge/config.json
	```

9. Test it's working by running it manually
	
	```console
	$ homebridge
	No plugins found. See the README for information on installing plugins.
	Loaded config.json with 1 accessories and 1 platforms.
	```

	Use <kbd>CTRL</kbd>+<kbd>C</kbd> to kill homebridge.
	
	_As long as homebridge boots, any errors you see are likely due to your config, check the install instructions of the plugins you added!_

10. (Optional) Install a process manager to keep homebridge running (and started on jail boot)
	
	```console
	npm install -g pm2
	pm2 startup rcd
	sysrc pm2_enable="YES"
	```

11. (Optional) Once homebridge is working, set it up to always run using pm2

	```console
	pm2 start homebridge -- -D
	pm2 save
	```

# Common Errors

### gyp WARN EACCES user "root" does not have permission to access the dev dir

Make sure you're using the `--unsafe-perm` flag

### Cannot find module '../build/Release/dns_sd_bindings'

You need to re-insall the mdns dependency:

```
$ cd /usr/local/lib/node_modules/homebridge
$ npm install --unsafe-perm mdns
$ npm rebuild --unsafe-perm
```