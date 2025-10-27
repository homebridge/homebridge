Adapted from [FreeNAS 9.3 and 9.10 Jail Installation](), [FreeNAS 9.10 BSD Jail]() and [FreeNAS 11 Installation using a Jail by Pez Cuckow]()

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
	ssh 
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
	root$ 
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

6. Install required packages (node-gyp and node-pre-gyp)

	```console
	npm install -g node-gyp node-pre-gyp
	```

7. Install homebridge itself

	Note the `--unsafe-perm`, which allows access to `/usr/local/lib/node_modules/homebridge/node_modules/mdns/.node-gyp`.
        Remember to set python executable location first
	```console
   setenv PYTHON /usr/local/bin/python2.7
	npm install -g --unsafe-perm homebridge
	mkdir ~/.homebridge
	cp /usr/local/lib/node_modules/homebridge/config-sample.json ~/.homebridge/config.json
	```

8. Install homebridge plugins of your choice

	 You can explore all available plugins at the NPM website by [searching for the keyword `homebridge-plugin`](). 
	
	 For example:
	
	 ```console
	 npm install -g homebridge-nest
	 ```

9. Modify the config.json with your settings.

	```console
	nano ~/.homebridge/config.json
	```

10. Test it's working by running it manually
	
	```console
	$ homebridge
	No plugins found. See the README for information on installing plugins.
	Loaded config.json with 1 accessories and 1 platforms.
	```

	Use <kbd>CTRL</kbd>+<kbd>C</kbd> to kill homebridge.
	
	_As long as homebridge boots, any errors you see are likely due to your config, check the install instructions of the plugins you added!_

11. (Optional) Install a process manager to keep homebridge running (and started on jail boot)
	
	```console
	npm install -g pm2
	pm2 startup rcd
	sysrc pm2_enable="YES"
	```

12. (Optional) Once homebridge is working, set it up to always run using pm2

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