There does not yet exist a way to do systematic troubleshooting. However, we encourage you to isolate your issues into the smallest parts possible and come up with a way to test each issue. 

For example, if you have permissions trouble or errors installing npm, solve that problem first by using any error messages to search for solutions. Once that problem is solved, move on to the next problem.

### Homebridge Troubleshooting (on this page)

- [Home](https://github.com/homebridge/homebridge/wiki/Basic-Troubleshooting)
- [Debug Mode](https://github.com/homebridge/homebridge/wiki/Basic-Troubleshooting#Debug_Mode)
- [Validate `config.json` Format](https://github.com/homebridge/homebridge/wiki/Basic-Troubleshooting#validate-configjson-format)
- [Understanding Where Your Files Are (macOS)](https://github.com/homebridge/homebridge/wiki/Basic-Troubleshooting#understanding-where-your-files-are-macos)
- [Reset Pairing/Accessories](https://github.com/homebridge/homebridge/wiki/Basic-Troubleshooting#reset-pairingaccessories)
- [Home Can't Connect To Accessory](https://github.com/homebridge/homebridge/wiki/Basic-Troubleshooting#home-cant-connect-to-accessory)
- [Examine Logs For Errors](https://github.com/homebridge/homebridge/wiki/Basic-Troubleshooting#examine-logs-for-errors)
- [Error - Not A Valid Username](https://github.com/homebridge/homebridge/wiki/Basic-Troubleshooting#error---not-a-valid-username)
- [Error - `EADDRINUSE`](https://github.com/homebridge/homebridge/wiki/Basic-Troubleshooting#error---eaddrinuse)
- [Best HomeKit App](https://github.com/homebridge/homebridge/wiki/Basic-Troubleshooting#best-homekit-app)

### Homebridge UI Troubleshooting

- [Home](https://github.com/homebridge/homebridge-config-ui-x/wiki/Troubleshooting)
- [Errors During Installation](https://github.com/homebridge/homebridge-config-ui-x/wiki/Troubleshooting#errors-during-installation)
- [Home App Says Accessory Already Added](https://github.com/homebridge/homebridge-config-ui-x/wiki/Troubleshooting#home-app-says-accessory-already-added)
- [My iOS App Can't Find Homebridge](https://github.com/homebridge/homebridge-config-ui-x/wiki/Troubleshooting#my-ios-app-cant-find-homebridge)
- [NPM Registry Issues](https://github.com/homebridge/homebridge-config-ui-x/wiki/Troubleshooting#npm-registry-issues)
- [Eero Routers](https://github.com/homebridge/homebridge-config-ui-x/wiki/Troubleshooting#eero-routers)
- [Multiple Instances Of Homebridge Found Installed](https://github.com/homebridge/homebridge-config-ui-x/wiki/Troubleshooting#multiple-instances-of-homebridge-found-installed)
- [Unable To Find Homebridge Installation](https://github.com/homebridge/homebridge-config-ui-x/wiki/Troubleshooting#unable-to-find-homebridge-installation)
- [Error - `update-node` - Your Version Of Linux Does Not Meet The GLIBC Version](https://github.com/homebridge/homebridge-config-ui-x/wiki/Troubleshooting#error---update-node---your-version-of-linux-does-not-meet-the-glibc-version)

## Debug Mode
To run Homebridge in full debug mode run the following command `DEBUG=* homebridge -D`.    

## Validate `config.json` Format
By far the most common issue new Homebridge users run into is formatting their configuration file. Many users will have misplaced a comma for example.

To prevent these errors, use an online JSON validator like [JSON Lint](https://jsonlint.com/) or one of the many utilities here: [Google Search: Json Validator](http://bit.ly/2akDXn0)

As a side effect, most utilities format your configuration.

## Understanding Where Your Files Are (macOS)
Users running Homebridge on macOS may have difficulty locating their Homebridge install and logs. This is because Homebridge is installed in a _hidden_ folder that begins with a period: `.homebridge`

By default, macOS hides folders and files that start with a "period". To toggle the visibility of these hidden files and folders, open a finder window and use the following shortcut: `cmd-shift .`

Once hidden file/folder visibility is toggled to the _on_ position, navigate to `Users/Your_Username` and the `.homebridge` folder will be visible.

## Reset Pairing/Accessories
Configuring Homebridge with platforms and accessories typically requires a lot of trial and error. This applies both to the software setup, and adding accessories to HomeKit. 

If you are stuck, you can reset Homebridge/HomeKit and start again. Here's how:
1. Delete any Homebridge platforms/accessories from your Home app.
2. Delete/remove any homebridge platforms/accessories from HomeKit.
3. Delete all the files in the `.homebridge/persist` and `.homebridge/accessories`. Eg. `cd ~/.homebridge
rm -rf persist`. If you prefer using a GUI to access the files use `open ~/.homebridge`.
4. Change your username in the `config.json` file.
5. Restart your computer/server (advanced users can quit/restart Homebridge and any boot processes rather than reboot).

## Home Can't Connect To Accessory

#### Potential Solution 1
Once you have Homebridge successfully running, you may also get errors in the Home app when adding accessories. One common error occurs after scanning the QR code. While trying to connect for 20 seconds or so, the following error is displayed: `Home couldn't connect to this accessory`.

This _appears_ to result from some cache issue in the Home app as resetting Homebridge (above) does not resolve the issue. This [WiFi trick](https://github.com/nfarina/homebridge/issues/1794) appears to work however:
1. Reset Pairing/Accessories as described above.
2. On your iOS device, use the `Forget Network` feature in your WiFi settings.
3. Rejoin your WiFi network.
4. Attempt to add the Homebridge platforms/accessories as you normally would.

This error can also occur when [mDNS](https://github.com/homebridge/homebridge/wiki/mDNS-Options) needs to be configured, e.g. when Avanti needs to be set up on Linux.

#### Potential Solution 2 (User Solution, thanks [@flowoy96](https://github.com/flowoy96)!)

I opened Container Manager (DSM7) on my Synology NAS and stopped the container. I deleted it and started a new one. I did NOT remove the settings and files from the mounted folder, so I was able to keep my configuration. When starting the new container, I switch the network setting from "bridge" to "host". After that, the container had the correct IPv4 (my NAS's address) and I was able to connect to the UI <NAS-IP>:8581. Then I could easily add Homebridge to HomeKit and everything was exposed correctly.

## Examine Logs For Errors
Homebridge logs to:

- `/var/lib/homebridge/homebridge.log`


**PROTIP**: Unix has the `tail` command, which makes it nice to see logs in real-time.

Assuming you have Homebridge running, from that server run one of the following commands to see what is getting logged live.

```
tail -f /var/lib/homebridge/homebridge.log
```

## Error - Not A Valid Username
This error results from a problem in the config.json file and may look something like this:

```
Receiving " Error: Not a valid username: DD: 33: 4E: F4: DF: 31 . Must be 6 pairs of colon-separated hexadecimal chars (A-F 0-9), like a MAC address." 
```

In this example, the issue is the second "D". The correctly formatted version would look like "D3:33:4E:F4:DF:31".   

## Error - `EADDRINUSE`
This error is a Generic TCP/IP message thrown by Node.js apps trying to listen on a port already being listened to. This is normally caused by a homebridge process running in the background without you realizing it. If you've set your homebridge install to run when your system starts up, try removing this until your setup/config is complete. 

## Best HomeKit App
Originally (2016) there was some [discussion](https://github.com/nfarina/homebridge/issues/520) about apps to use to manage homekit apps. However, many people are simply using Apple's native Home app. This is the best choice for beginners.

Alternatives to Home that are well-rated and actively developed as of this writing (Jan 2019) include [Home 3](https://itunes.apple.com/us/app/home-3/id995994352?mt=8) (paid) and [Home Assistant](https://itunes.apple.com/us/app/home-assistant-open-source-home-automation/id1099568401?mt=8) (the latter is for super-advanced users who are running home-assistant.io and have integrated their homekit devices into home assistant).  