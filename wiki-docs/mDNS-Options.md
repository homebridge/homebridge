Homebridge uses mDNS-based service discovery in order for your accessory to be discovered by your Apple devices (see [A beginner’s guide to mDNS and DNS-SD](https://iotespresso.com/a-beginners-guide-to-mdns-and-dns-sd/) for a more detailed explanation).

Homebridge provides a range of mDNS Advertisers it can interface with to advertise itself on the local network.

### Bonjour-HAP

[Bonjour-HAP](https://github.com/homebridge/bonjour) is the default and legacy advertiser. It is not as efficient in terms of system resource usage and network traffic when compared to the other options.

### Ciao

[Ciao](https://github.com/homebridge/ciao) is a [RFC 6763](https://tools.ietf.org/html/rfc6763) compliant `dns-sd` and advertising on multicast dns ([RFC 6762](https://tools.ietf.org/html/rfc6762)) library developed by Homebridge.
It is entirely written in TypeScript, and therefore tries to be platform-independent.

For non-Linux users, `ciao` should provide the best experience. It fixes a lot of the deficiencies of the `bonjour-hap` advertiser. However, you might experience issues in the following two scenarios.

#### Network Interface Selection

While `bonjour-hap` only advertises on the primary network interface, `ciao` tries to be aware of multiple network interfaces. On startup, it tries to evaluate which network interfaces to advertise on by default.  
In certain circumstances, `ciao` is unable to properly determine the set of valid network interfaces (e.g., when dealing with virtual network interfaces on containerised environments).
In those cases, it might be helpful to manually define the set of network interfaces (see [below](#how-to-select-advertised-network-interfaces)). Otherwise, fall back to the [bonjour-hap](#bonjour-hap) advertiser.

#### Multiple Advertisers

On some systems, there is already a mDNS advertiser stack running (e.g. avahi on linux).
There might be issues running multiple mDNS advertisers on the same host (see [Notice on native mDNS responders](https://github.com/homebridge/ciao#notice-on-native-mdns-responders)).

### Avahi (Linux and Docker)

[Avahi](http://avahi.org/) is a mDNS advertiser that is installed by default on many linux distributions.
As of Homebridge 1.4.0, Homebridge can be configured to advertise itself by interfacing with avahi via its dBus interface.

For Linux users, `Avahi` should provide the best experience.
Note that your system must have the `avahi-daemon` and `dbus` services installed and running for this option to work.

For using the host's `avahi-daemon` from Docker, mount `/var/run/dbus:/var/run/dbus` and `/var/run/avahi-daemon/socket:/var/run/avahi-daemon/socket` as volumes so the container has a path to communicate with the `avahi-daemon`. Unless you've disabled AppArmor on your Linux distro, or it's disabled by default, you'll also need to set a `security_opt` setting of `apparmor:unconfined`, otherwise AppArmor will block the container's attempt to talk to Avahi via `dbus`. Here's a sample snippet of what this all looks like in a `docker-compose.yml`:

```
    security_opt:
      - apparmor:unconfined
    volumes:
      - /var/run/dbus:/var/run/dbus
      - /var/run/avahi-daemon/socket:/var/run/avahi-daemon/socket
      - ...
```

### systemd-resolved (Linux only, experimental)

As of Homebridge 1.6.0, Linux users can choose the `resolved` advertiser, which uses systemd-resolved via D-Bus. If your system already uses systemd-resolved for mDNS support, this will likely provide the best experience. You can check this by running `resolvectl mdns`; if the first line is `Global: yes`, you should use this advertiser.

Using the `resolved` advertiser has the following prerequisites:

- Having `systemd-resolved` and `dbus` services installed and running.
- Having `MulticastDNS` configured and enabled (see https://linuxreviews.org/Systemd-resolved).
- Having configured the respective permissions to allow Homebridge to access `systemd-resolved` (see below).

Setting up the `resolved` advertiser is only advised for more experienced users.

#### Configuring permissions for systemd-resolved

The user that runs Homebridge must have permission to register and unregister DNS-SD services with `systemd-resolved`. If you installed Homebridge using the official [`apt`](https://github.com/homebridge/homebridge-apt-pkg#using-apt) package, this should be handled for you automatically. Otherwise, you'll need to do this manually. First, run `pkcheck --version` to see what version of Polkit you're running.

##### Polkit version 0.105 or lower

If the version is 0.105 or below, create a file in `/etc/polkit-1/localauthority/30-site.d` named `homebridge.pkla` with the following contents:

```
[Homebridge ManageService]
Identity=unix-user:homebridge
Action=org.freedesktop.resolve1.register-service;org.freedesktop.resolve1.unregister-service
ResultAny=yes
```

If you run Homebridge as a different user than `homebridge`, you'll need to adjust the `Identity` line accordingly.

##### Polkit version 0.106 or higher

If the version is 0.106 or higher, create a file in `/etc/polkit-1/rules.d` named `homebridge.rules` with the following contents:

```
polkit.addRule(function(action, subject) {
    if ((action.id == "org.freedesktop.resolve1.register-service" ||
        action.id == "org.freedesktop.resolve1.unregister-service") &&
        subject.user == "homebridge") {
        return polkit.Result.YES;
    }
});
```

If you run Homebridge as a different user than `homebridge`, you'll need to adjust the condition accordingly.

## How To Set mDNS Advertiser

You can set the mDNS Advertiser from the settings section in the Homebridge UI:

<p align="center">
  <img width="600px" src="https://github.com/user-attachments/assets/e579bae2-074e-44a4-b8a8-1d14a5825672">
</p>

Alternatively, you can manually add this to the `config.json`:

```json5
{
  "bridge": {
    // ...
    "advertiser": "ciao"  // accepts "ciao" or "bonjour-hap" or "avahi" or "resolved"
  }
}
```

## How To Select Advertised Network Interfaces

If your Homebridge host has multiple network interfaces, it may be necessary to restrict, or manually choose, which interfaces are advertised by the mDNS services. This option affects both the addresses advertised via mDNS SD and the interface the HAP server TCP socket is bound to.

Note that this configuration only has an effect on the advertised addresses when using the `bonjour-hap` or `ciao` advertiser.
A more detailed explanation can be found in the [technical documentation](https://developers.homebridge.io/HAP-NodeJS/interfaces/PublishInfo.html#bind).

You can select the network interfaces Homebridge should advertise / listen from the "Homebridge Settings" section of the Homebridge UI:

<p align="center">
  <img width="600px" src="https://github.com/user-attachments/assets/107f572d-99a5-41b1-acff-dbd5c0908c04">
</p>

Alternatively, you can manually add this to the `config.json`:

```json5
{
  "bridge": {
    // ...
    "bind": ["eth0"] // accepts an array of network interface names or IP addresses
  }
}
```
