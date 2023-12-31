# SSH / FTP - Raspberry Pi


### Enable SSH and FTP
- in Homebridge open terminal and type: `sudo raspi-config`
- go to Interface Options / SSH and confirm you want to enable SSH (this option enable / disable both: SSH and FTP)

### Default username and password 
- username: `pi`
- password: `raspberry`
    
### Change password
- in Homebridge open terminal and type: `sudo raspi-config`
- go to System options / Password

### Connect via SSH
- open your system Terminal
- type: `ssh pi@192.168.1.100`
  - replace `192.168.1.100` with your Homebridge IP
  - replace `pi` with your username if you change it
- enter your password, default: `raspberry`

### Connect via FTP
- open your FTP client (like Cyberduck)
- add new connection:
  - Connection type: `SFTP`
  - Server: `192.168.1.100` (replace with your Homebridge / Raspberry IP)
  - Port: `22`
  - username: `pi` (unless you changed)
  - password: `raspberry` (unless you changed)
 
### Default folders addresses
- Plugins: `/var/lib/homebridge/node_modules/`
- Config file: `/var/lib/homebridge/config.json`
