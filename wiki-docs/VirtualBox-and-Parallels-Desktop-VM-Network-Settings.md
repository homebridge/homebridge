If you want to run [Homebridge](https://github.com/homebridge/homebridge) in a Linux Virtual Machine using [VirtualBox](https://www.virtualbox.org/) (Linux, macOS or Windows) or [Parallels Desktop](https://www.parallels.com/au/products/desktop/) (macOS), you will need set the VM to use the "Bridged Adapter" network mode.

This mode will ensure the VM is running on the same, "real" network as your other devices, instead of a virtual network created by Virtual Box. 

## VirtualBox

* **Attached to:** Bridged Adapter
* **Name:** *Select your main network adapter, Ethernet or WiFi*

#### macOS:

![homebridge-virtual-box-network-settings-macos](https://user-images.githubusercontent.com/3979615/85188699-07234780-b2ec-11ea-9b81-089023f7ff08.png)

#### Windows:

![homebridge-virtual-box-network-settings-windows](https://user-images.githubusercontent.com/3979615/85189043-9df10380-b2ee-11ea-9893-fa3a62d38e21.png)

## Parallels Desktop

* **Source:** *Bridged Adapter* -> *Your main Ethernet or WiFi Adapter*

![image](https://user-images.githubusercontent.com/3979615/85188867-29699500-b2ed-11ea-929b-7c6905a2cece.png)

## VMware Workstation Player

* **Network Adapter:** Bridged
* **Configure Adapter:** *Select your main network adapter, Ethernet or WiFi*

![image](https://user-images.githubusercontent.com/3979615/99161489-1e554c80-2747-11eb-8b77-60f509b51190.png)

## Installing Homebridge

You can then install the Linux distribution of your choice and follow the instructions on the Wiki to install Homebridge as a service:

* [[Install Homebridge on Debian or Ubuntu Linux]]



