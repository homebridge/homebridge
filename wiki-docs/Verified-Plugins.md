[comment]: <> (The requirements listed here should be kept in sync with https://github.com/homebridge/verified)
[comment]: <> (If you have a suggestion for additional requirements or think a requirement should be removed please start a discussion there.)

Homebridge plugins that are marked as **verified** have been reviewed by the Homebridge project team to ensure they meet various requirements that encourage best practices and a trouble-free user experience.

## Current Requirements

- **General**
  - The plugin must be of type [dynamic platform](https://developers.homebridge.io/#/#dynamic-platform-template).
  - The plugin must not offer the same nor less functionality than that of any existing **verified** plugin.
- **Repo**
  - The plugin must be published to NPM and the source code available on a GitHub repository, with issues enabled.
  - A GitHub release should be created for every new version of your plugin, with release notes.
- **Environment**
  - The plugin must run on all [supported LTS versions of Node.js](https://github.com/homebridge/homebridge/wiki/How-To-Update-Node.js), at the time of writing this is Node v18 and v20.
  - The plugin must successfully install and not start unless it is configured.
  - The plugin must not execute post-install scripts that modify the users' system in any way.
  - The plugin must not require the user to run Homebridge in a TTY or with non-standard startup parameters, even for initial configuration.
- **Codebase**
  - The plugin must implement the [Homebridge Plugin Settings GUI](https://developers.homebridge.io/#/config-schema).
  - The plugin must not contain any analytics or calls that enable you to track the user.
  - If the plugin needs to write files to disk (cache, keys, etc.), it must store them inside the Home

These verification requirements were last updated on 2023-12-08. Existing verified plugins will have met the requirements at the time of verification, and not necessarily the current requirements.

## How To Get Your Plugin Verified

See https://github.com/homebridge/verified

## Verified Plugins

These plugins have been verified by the Homebridge team:

| Plugin  | Date Verified | PR |
|---------|:-------------:|:--:|
| [@0x5e/homebridge-tuya-platform](https://www.npmjs.com/package/@0x5e/homebridge-tuya-platform) |
| [@balansse/homebridge-vivint](https://www.npmjs.com/package/@balansse/homebridge-vivint) |
| [@busse/homebridge-pluggit](https://www.npmjs.com/package/@busse/homebridge-pluggit) |
| [@danielgindi/homebridge-bcp-charger](https://www.npmjs.com/package/@danielgindi/homebridge-bcp-charger) |
| [@fjs21/homebridge-blueair](https://www.npmjs.com/package/@fjs21/homebridge-blueair) |
| [@hansfriedrich/homebridge-feller-wiser](https://www.npmjs.com/package/@hansfriedrich/homebridge-feller-wiser) |
| [@hernas/homebridge-panasonic-heat-pump](https://www.npmjs.com/package/@hernas/homebridge-panasonic-heat-pump) |
| [@hernas/homebridge-salus-sq610](https://www.npmjs.com/package/@hernas/homebridge-salus-sq610) |
| [@jdes/homebridge-tost-corp-somfy-rts-web](https://www.npmjs.com/package/@jdes/homebridge-tost-corp-somfy-rts-web) |
| [@milo526/homebridge-tuya-web](https://www.npmjs.com/package/@milo526/homebridge-tuya-web) |
| [@o-lukas/homebridge-smartthings-tv](https://www.npmjs.com/package/@o-lukas/homebridge-smartthings-tv) |
| [@ohmantics/homebridge-airmega](https://www.npmjs.com/package/@ohmantics/homebridge-airmega) |
| [@puchupala/homebridge-nature-remo-multi-toggle-light](https://www.npmjs.com/package/@puchupala/homebridge-nature-remo-multi-toggle-light) |
| [@rsauget/homebridge-flexom](https://www.npmjs.com/package/@rsauget/homebridge-flexom) |
| [@string-bean/homebridge-drayton-wiser](https://www.npmjs.com/package/@string-bean/homebridge-drayton-wiser) |
| [@switchbot/homebridge-switchbot](https://www.npmjs.com/package/@switchbot/homebridge-switchbot) |
| [homebridge-3em-energy-meter](https://www.npmjs.com/package/homebridge-3em-energy-meter) |
| [homebridge-433-arduino](https://www.npmjs.com/package/homebridge-433-arduino) |
| [homebridge-abode-lights](https://www.npmjs.com/package/homebridge-abode-lights) |
| [homebridge-actron-neo](https://www.npmjs.com/package/homebridge-actron-neo) | 2023-09-14 | [↗](https://github.com/homebridge/verified/issues/574) |
| [homebridge-actron-que](https://www.npmjs.com/package/homebridge-actron-que) |
| [homebridge-adguardhome](https://www.npmjs.com/package/homebridge-adguardhome) |
| [homebridge-adt-pulse](https://www.npmjs.com/package/homebridge-adt-pulse) |
| [homebridge-advanced-timer](https://www.npmjs.com/package/homebridge-advanced-timer) |
| [homebridge-aeg-robot](https://www.npmjs.com/package/homebridge-aeg-robot) |
| [homebridge-aeg-wellbeing](https://www.npmjs.com/package/homebridge-aeg-wellbeing) |
| [homebridge-air-q](https://www.npmjs.com/package/homebridge-air-q) |
| [homebridge-airconditioner-mitsubishi-au-nz](https://www.npmjs.com/package/homebridge-airconditioner-mitsubishi-au-nz) |
| [homebridge-airport-express-connected](https://www.npmjs.com/package/homebridge-airport-express-connected) |
| [homebridge-airthings](https://www.npmjs.com/package/homebridge-airthings) |
| [homebridge-airtouch5-platform](https://www.npmjs.com/package/homebridge-airtouch5-platform) | 2023-10-01 | [↗](https://github.com/homebridge/verified/issues/580) |
| [homebridge-airzone-cloud](https://www.npmjs.com/package/homebridge-airzone-cloud) |
| [homebridge-aladdin-connect-garage-door](https://www.npmjs.com/package/homebridge-aladdin-connect-garage-door) |
| [homebridge-aladdinconnect](https://www.npmjs.com/package/homebridge-aladdinconnect) |
| [homebridge-alexa-player](https://www.npmjs.com/package/homebridge-alexa-player) |
| [homebridge-alexa-smarthome](https://www.npmjs.com/package/homebridge-alexa-smarthome) |
| [homebridge-alexa](https://www.npmjs.com/package/homebridge-alexa) |
| [homebridge-amazondash-mac](https://www.npmjs.com/package/homebridge-amazondash-mac) |
| [homebridge-ambiback](https://www.npmjs.com/package/homebridge-ambiback) |
| [homebridge-ambient-weather-sensors](https://www.npmjs.com/package/homebridge-ambient-weather-sensors) | 2023-12-09 | [↗](https://github.com/homebridge/verified/issues/611) |
| [homebridge-androidtv](https://www.npmjs.com/package/homebridge-androidtv) |
| [homebridge-anthemreceiver](https://www.npmjs.com/package/homebridge-anthemreceiver) |
| [homebridge-apc-back-ups-hs500](https://www.npmjs.com/package/homebridge-apc-back-ups-hs500) |
| [homebridge-aqicn](https://www.npmjs.com/package/homebridge-aqicn) |
| [homebridge-august](https://www.npmjs.com/package/homebridge-august) |
| [homebridge-automower-platform](https://www.npmjs.com/package/homebridge-automower-platform) |
| [homebridge-automower](https://www.npmjs.com/package/homebridge-automower) |
| [homebridge-awair2](https://www.npmjs.com/package/homebridge-awair2) |
| [homebridge-away-mode](https://www.npmjs.com/package/homebridge-away-mode) |
| [homebridge-aws-iot](https://www.npmjs.com/package/homebridge-aws-iot) |
| [homebridge-balboa-spa](https://www.npmjs.com/package/homebridge-balboa-spa) |
| [homebridge-batterytender](https://www.npmjs.com/package/homebridge-batterytender) |
| [homebridge-bed-control](https://www.npmjs.com/package/homebridge-bed-control) |
| [homebridge-beoplay](https://www.npmjs.com/package/homebridge-beoplay) |
| [homebridge-blauberg-vento](https://www.npmjs.com/package/homebridge-blauberg-vento) |
| [homebridge-ble-thermobeacon](https://www.npmjs.com/package/homebridge-ble-thermobeacon) |
| [homebridge-blinds-cmd](https://www.npmjs.com/package/homebridge-blinds-cmd) |
| [homebridge-blinds](https://www.npmjs.com/package/homebridge-blinds) |
| [homebridge-blink-for-home](https://www.npmjs.com/package/homebridge-blink-for-home) |
| [homebridge-bold-ble](https://www.npmjs.com/package/homebridge-bold-ble) |
| [homebridge-bold](https://www.npmjs.com/package/homebridge-bold) |
| [homebridge-bond](https://www.npmjs.com/package/homebridge-bond) |
| [homebridge-boschcontrolpanel_bgseries](https://www.npmjs.com/package/homebridge-boschcontrolpanel_bgseries) |
| [homebridge-bravia-tvos](https://www.npmjs.com/package/homebridge-bravia-tvos) |
| [homebridge-bravia](https://www.npmjs.com/package/homebridge-bravia) |
| [homebridge-brewer](https://www.npmjs.com/package/homebridge-brewer) |
| [homebridge-broadlink-heater-cooler](https://www.npmjs.com/package/homebridge-broadlink-heater-cooler) |
| [homebridge-browsercam](https://www.npmjs.com/package/homebridge-browsercam) |
| [homebridge-button-platform](https://www.npmjs.com/package/homebridge-button-platform) |
| [homebridge-caddx-interlogix](https://www.npmjs.com/package/homebridge-caddx-interlogix) |
| [homebridge-calendar-scheduler](https://www.npmjs.com/package/homebridge-calendar-scheduler) |
| [homebridge-camera-ffmpeg](https://www.npmjs.com/package/homebridge-camera-ffmpeg) |
| [homebridge-camera-ui](https://www.npmjs.com/package/homebridge-camera-ui) |
| [homebridge-carrier-infinity](https://www.npmjs.com/package/homebridge-carrier-infinity) |
| [homebridge-cleanmate](https://www.npmjs.com/package/homebridge-cleanmate) |
| [homebridge-cloudflared-tunnel](https://www.npmjs.com/package/homebridge-cloudflared-tunnel) | 2024-01-12 | [↗](https://github.com/homebridge/verified/issues/681) |
| [homebridge-cmd4-advantageair](https://www.npmjs.com/package/homebridge-cmd4-advantageair) |
| [homebridge-comelit-platform](https://www.npmjs.com/package/homebridge-comelit-platform) |
| [homebridge-comelit-sb-platform](https://www.npmjs.com/package/homebridge-comelit-sb-platform) |
| [homebridge-comelit-vedo-platform](https://www.npmjs.com/package/homebridge-comelit-vedo-platform) |
| [homebridge-config-ui-x](https://www.npmjs.com/package/homebridge-config-ui-x) |
| [homebridge-coviva-hager](https://www.npmjs.com/package/homebridge-coviva-hager) |
| [homebridge-cron-scheduler](https://www.npmjs.com/package/homebridge-cron-scheduler) |
| [homebridge-cuby](https://www.npmjs.com/package/homebridge-cuby) |
| [homebridge-daelim-smarthome](https://www.npmjs.com/package/homebridge-daelim-smarthome) |
| [homebridge-dafang-mqtt-republish](https://www.npmjs.com/package/homebridge-dafang-mqtt-republish) |
| [homebridge-dahua-alerts](https://www.npmjs.com/package/homebridge-dahua-alerts) |
| [homebridge-daikin-cloud](https://www.npmjs.com/package/homebridge-daikin-cloud) |
| [homebridge-daikin-local](https://www.npmjs.com/package/homebridge-daikin-local) |
| [homebridge-daikin-oneplus](https://www.npmjs.com/package/homebridge-daikin-oneplus) |
| [homebridge-daikin-smart-ac](https://www.npmjs.com/package/homebridge-daikin-smart-ac) |
| [homebridge-daikin-tempsensor-nocloud](https://www.npmjs.com/package/homebridge-daikin-tempsensor-nocloud) |
| [homebridge-davis](https://www.npmjs.com/package/homebridge-davis) | 2023-09-01 | [↗](https://github.com/homebridge/verified/issues/566) |
| [homebridge-deconz](https://www.npmjs.com/package/homebridge-deconz) |
| [homebridge-deebot](https://www.npmjs.com/package/homebridge-deebot) |
| [homebridge-deebotecovacs](https://www.npmjs.com/package/homebridge-deebotecovacs) |
| [homebridge-delay-switch](https://www.npmjs.com/package/homebridge-delay-switch) |
| [homebridge-denon-heos](https://www.npmjs.com/package/homebridge-denon-heos) |
| [homebridge-denon-tv](https://www.npmjs.com/package/homebridge-denon-tv) |
| [homebridge-device-alive](https://www.npmjs.com/package/homebridge-device-alive) |
| [homebridge-deye](https://www.npmjs.com/package/homebridge-deye) |
| [homebridge-doorbird](https://www.npmjs.com/package/homebridge-doorbird) |
| [homebridge-dreamscreen-rm](https://www.npmjs.com/package/homebridge-dreamscreen-rm) |
| [homebridge-dreo](https://www.npmjs.com/package/homebridge-dreo) |
| [homebridge-dummy](https://www.npmjs.com/package/homebridge-dummy) |
| [homebridge-dune-hd](https://www.npmjs.com/package/homebridge-dune-hd) |
| [homebridge-dynamicapi](https://www.npmjs.com/package/homebridge-dynamicapi) |
| [homebridge-dyson-bp01](https://www.npmjs.com/package/homebridge-dyson-bp01) |
| [homebridge-dyson-pure-cool](https://www.npmjs.com/package/homebridge-dyson-pure-cool) |
| [homebridge-easee](https://www.npmjs.com/package/homebridge-easee) |
| [homebridge-ecoplug](https://www.npmjs.com/package/homebridge-ecoplug) |
| [homebridge-edomoticz](https://www.npmjs.com/package/homebridge-edomoticz) |
| [homebridge-eggtimer-plugin](https://www.npmjs.com/package/homebridge-eggtimer-plugin) |
| [homebridge-egreat-androidtv](https://www.npmjs.com/package/homebridge-egreat-androidtv) |
| [homebridge-electra-smart](https://www.npmjs.com/package/homebridge-electra-smart) |
| [homebridge-elkm1](https://www.npmjs.com/package/homebridge-elkm1) |
| [homebridge-enphase-envoy](https://www.npmjs.com/package/homebridge-enphase-envoy) |
| [homebridge-enviroindoor](https://github.com/mhawkshaw/homebridge-enviroindoor) |
| [homebridge-enviroplus](https://www.npmjs.com/package/homebridge-enviroplus) |
| [homebridge-envirourban](https://www.npmjs.com/package/homebridge-envirourban) |
| [homebridge-envisalink-ademco](https://www.npmjs.com/package/homebridge-envisalink-ademco) |
| [homebridge-envisalink](https://www.npmjs.com/package/homebridge-envisalink) |
| [homebridge-eosstb](https://www.npmjs.com/package/homebridge-eosstb) |
| [homebridge-eufy-security](https://www.npmjs.com/package/homebridge-eufy-security) |
| [homebridge-evohome](https://www.npmjs.com/package/homebridge-evohome) |
| [homebridge-ewelink](https://www.npmjs.com/package/homebridge-ewelink) |
| [homebridge-exivo](https://www.npmjs.com/package/homebridge-exivo) |
| [homebridge-ezviz](https://www.npmjs.com/package/homebridge-ezviz) |
| [homebridge-fenix-tft-wifi](https://www.npmjs.com/package/homebridge-fenix-tft-wifi) |
| [homebridge-fhem](https://www.npmjs.com/package/homebridge-fhem) |
| [homebridge-fibaro-hc3](https://www.npmjs.com/package/homebridge-fibaro-hc3) |
| [homebridge-fibaro-home-center](https://www.npmjs.com/package/homebridge-fibaro-home-center) |
| [homebridge-flair](https://www.npmjs.com/package/homebridge-flair) |
| [homebridge-flobymoen](https://www.npmjs.com/package/homebridge-flobymoen) |
| [homebridge-flume](https://www.npmjs.com/package/homebridge-flume) |
| [homebridge-fordpass](https://www.npmjs.com/package/homebridge-fordpass) |
| [homebridge-freeathome-local-api](https://www.npmjs.com/package/homebridge-freeathome-local-api) |
| [homebridge-freebox-player-delta](https://www.npmjs.com/package/homebridge-freebox-player-delta) |
| [homebridge-frigidaire-dehumidifier](https://www.npmjs.com/package/homebridge-frigidaire-dehumidifier) |
| [homebridge-fritz-platform](https://www.npmjs.com/package/homebridge-fritz-platform) |
| [homebridge-ftp-motion](https://www.npmjs.com/package/homebridge-ftp-motion) |
| [homebridge-genie-aladdin-connect](https://www.npmjs.com/package/homebridge-genie-aladdin-connect) |
| [homebridge-glances](https://www.npmjs.com/package/homebridge-glances) |
| [homebridge-gogogate2](https://www.npmjs.com/package/homebridge-gogogate2) |
| [homebridge-google-nest-sdm](https://www.npmjs.com/package/homebridge-google-nest-sdm) |
| [homebridge-govee](https://www.npmjs.com/package/homebridge-govee) |
| [homebridge-gpio-doorbell](https://www.npmjs.com/package/homebridge-gpio-doorbell) |
| [homebridge-gpio-rgb-ledstrip](https://www.npmjs.com/package/homebridge-gpio-rgb-ledstrip) |
| [homebridge-gpio-rgbw-ledstrip](https://www.npmjs.com/package/homebridge-gpio-rgbw-ledstrip) |
| [homebridge-gree-ac](https://www.npmjs.com/package/homebridge-gree-ac) | 2023-09-30 | [↗](https://github.com/homebridge/verified/issues/575) |
| [homebridge-green-mountain-grills](https://www.npmjs.com/package/homebridge-green-mountain-grills) |
| [homebridge-grohe-sense](https://www.npmjs.com/package/homebridge-grohe-sense) |
| [homebridge-gsh](https://www.npmjs.com/package/homebridge-gsh) |
| [homebridge-haieracbridge-platform](https://www.npmjs.com/package/homebridge-haieracbridge-platform) |
| [homebridge-harmony](https://www.npmjs.com/package/homebridge-harmony) |
| [homebridge-hatch-baby-rest](https://www.npmjs.com/package/homebridge-hatch-baby-rest) |
| [homebridge-hikconnect](https://www.npmjs.com/package/homebridge-hikconnect) |
| [homebridge-hilo](https://www.npmjs.com/package/homebridge-hilo) |
| [homebridge-homeconnect](https://www.npmjs.com/package/homebridge-homeconnect) |
| [homebridge-homekit-control](https://www.npmjs.com/package/homebridge-homekit-control) |
| [homebridge-homeqtt-alarm](https://www.npmjs.com/package/homebridge-homeqtt-alarm) |
| [homebridge-homewizard-energy-socket](https://www.npmjs.com/package/homebridge-homewizard-energy-socket) |
| [homebridge-homeworks](https://www.npmjs.com/package/homebridge-homeworks) |
| [homebridge-http-curtain](https://www.npmjs.com/package/homebridge-http-curtain) |
| [homebridge-http-garage-doors](https://www.npmjs.com/package/homebridge-http-garage-doors) |
| [homebridge-http-iot](https://www.npmjs.com/package/homebridge-http-iot) |
| [homebridge-http-json-thermometer](https://www.npmjs.com/package/homebridge-http-json-thermometer) |
| [homebridge-http-leak-sensor](https://www.npmjs.com/package/homebridge-http-leak-sensor) |
| [homebridge-hubitat-tonesto7](https://www.npmjs.com/package/homebridge-hubitat-tonesto7) |
| [homebridge-hubspace](https://github.com/sajmonr/homebridge-hubspace) |
| [homebridge-hue](https://www.npmjs.com/package/homebridge-hue) |
| [homebridge-hyperion-jub](https://www.npmjs.com/package/homebridge-hyperion-jub) | 2023-11-10 | [↗](https://github.com/homebridge/verified/issues/588) |
| [homebridge-hyundai-bluelink](https://www.npmjs.com/package/homebridge-hyundai-bluelink) |
| [homebridge-i6-bigassfans](https://www.npmjs.com/package/homebridge-i6-bigassfans) |
| [homebridge-infinitude-v2](https://www.npmjs.com/package/homebridge-infinitude-v2) |
| [homebridge-intercom-automation-hat](https://www.npmjs.com/package/homebridge-intercom-automation-hat) |
| [homebridge-irobot](https://www.npmjs.com/package/homebridge-irobot) |
| [homebridge-itho-daalderop](https://www.npmjs.com/package/homebridge-itho-daalderop) |
| [homebridge-jablotron](https://www.npmjs.com/package/homebridge-jablotron) |
| [homebridge-jewish-calendar](https://www.npmjs.com/package/homebridge-jewish-calendar) |
| [homebridge-juicebox](https://www.npmjs.com/package/homebridge-juicebox) |
| [homebridge-kasa-hub](https://www.npmjs.com/package/homebridge-kasa-hub) | 2023-12-03 | [↗](https://github.com/homebridge/verified/issues/603)|
| [homebridge-keylights](https://www.npmjs.com/package/homebridge-keylights) |
| [homebridge-kiwigrid](https://www.npmjs.com/package/homebridge-kiwigrid) |
| [homebridge-kodi](https://www.npmjs.com/package/homebridge-kodi) |
| [homebridge-konnected](https://www.npmjs.com/package/homebridge-konnected) |
| [homebridge-kumo](https://www.npmjs.com/package/homebridge-kumo) |
| [homebridge-landroid](https://www.npmjs.com/package/homebridge-landroid) |
| [homebridge-lay-z-spa](https://www.npmjs.com/package/homebridge-lay-z-spa) |
| [homebridge-level-sense](https://www.npmjs.com/package/homebridge-level-sense) |
| [homebridge-leviton](https://www.npmjs.com/package/homebridge-leviton) |
| [homebridge-levoit-air-purifier](https://www.npmjs.com/package/homebridge-levoit-air-purifier) |
| [homebridge-levoit-humidifiers](https://www.npmjs.com/package/homebridge-levoit-humidifiers) |
| [homebridge-lg-thinq-ac](https://www.npmjs.com/package/homebridge-lg-thinq-ac) |
| [homebridge-lg-thinq](https://www.npmjs.com/package/homebridge-lg-thinq) |
| [homebridge-lgwebos-tv](https://www.npmjs.com/package/homebridge-lgwebos-tv) |
| [homebridge-lifx-plugin](https://www.npmjs.com/package/homebridge-lifx-plugin) |
| [homebridge-lighthouse](https://www.npmjs.com/package/homebridge-lighthouse) |
| [homebridge-lightwaverf](https://www.npmjs.com/package/homebridge-lightwaverf) |
| [homebridge-linak](https://www.npmjs.com/package/homebridge-linak) |
| [homebridge-litter-robot-connect](https://www.npmjs.com/package/homebridge-litter-robot-connect) |
| [homebridge-logic-switch](https://www.npmjs.com/package/homebridge-logic-switch) |
| [homebridge-logo-platform](https://www.npmjs.com/package/homebridge-logo-platform) |
| [homebridge-loxone-proxy](https://www.npmjs.com/package/homebridge-loxone-proxy) |
| [homebridge-lutron-caseta-leap](https://www.npmjs.com/package/homebridge-lutron-caseta-leap) |
| [homebridge-luxtronik2](https://www.npmjs.com/package/homebridge-luxtronik2) |
| [homebridge-magic-occupancy](https://www.npmjs.com/package/homebridge-magic-occupancy) |
| [homebridge-magichome-dynamic-platform](https://www.npmjs.com/package/homebridge-magichome-dynamic-platform) |
| [homebridge-meater](https://www.npmjs.com/package/homebridge-meater) | 2024-01-12 | [↗](https://github.com/homebridge/verified/issues/682) |
| [homebridge-melcloud-control](https://www.npmjs.com/package/homebridge-melcloud-control) |
| [homebridge-meraki-control](https://www.npmjs.com/package/homebridge-meraki-control) |
| [homebridge-mercedesme](https://www.npmjs.com/package/homebridge-mercedesme) |
| [homebridge-meross](https://www.npmjs.com/package/homebridge-meross) |
| [homebridge-mertik-fireplace](https://www.npmjs.com/package/homebridge-mertik-fireplace) |
| [homebridge-messenger](https://www.npmjs.com/package/homebridge-messenger) |
| [homebridge-mhacwifi1-lan](https://www.npmjs.com/package/homebridge-mhacwifi1-lan) |
| [homebridge-mi-humidifier](https://www.npmjs.com/package/homebridge-mi-humidifier) |
| [homebridge-mi-hygrothermograph](https://www.npmjs.com/package/homebridge-mi-hygrothermograph) |
| [homebridge-micronova-agua-iot-stove](https://www.npmjs.com/package/homebridge-micronova-agua-iot-stove) |
| [homebridge-midea-air](https://www.npmjs.com/package/homebridge-midea-air) |
| [homebridge-mieleathome](https://www.npmjs.com/package/homebridge-mieleathome) |
| [homebridge-mihomegateway](https://www.npmjs.com/package/homebridge-mihomegateway) |
| [homebridge-milighthub-platform](https://www.npmjs.com/package/homebridge-milighthub-platform) |
| [homebridge-miot](https://www.npmjs.com/package/homebridge-miot) |
| [homebridge-mobilelink](https://www.npmjs.com/package/homebridge-mobilelink) |
| [homebridge-moodo](https://www.npmjs.com/package/homebridge-moodo) |
| [homebridge-mqtt-tasmota](https://www.npmjs.com/package/homebridge-mqtt-tasmota) |
| [homebridge-mqtt](https://www.npmjs.com/package/homebridge-mqtt) |
| [homebridge-mqttsmokesensor](https://www.npmjs.com/package/homebridge-mqttsmokesensor) | 2023-09-11 | [↗](https://github.com/homebridge/verified/issues/573) |
| [homebridge-mqttthing](https://www.npmjs.com/package/homebridge-mqttthing) |
| [homebridge-multiswitcheroo](https://www.npmjs.com/package/homebridge-multiswitcheroo) |
| [homebridge-music](https://www.npmjs.com/package/homebridge-music) |
| [homebridge-musiccast-multiroom](https://www.npmjs.com/package/homebridge-musiccast-multiroom) |
| [homebridge-my-wallbox](https://www.npmjs.com/package/homebridge-my-wallbox) |
| [homebridge-mylink](https://www.npmjs.com/package/homebridge-mylink) |
| [homebridge-myq](https://www.npmjs.com/package/homebridge-myq) |
| [homebridge-mysmartblinds-bridge](https://www.npmjs.com/package/homebridge-mysmartblinds-bridge) |
| [homebridge-naim-audio](https://www.npmjs.com/package/homebridge-naim-audio) |
| [homebridge-nb](https://www.npmjs.com/package/homebridge-nb) |
| [homebridge-neptun-smart](https://www.npmjs.com/package/homebridge-neptun-smart) |
| [homebridge-ness-d16x](https://www.npmjs.com/package/homebridge-ness-d16x) |
| [homebridge-nest-cam](https://www.npmjs.com/package/homebridge-nest-cam) |
| [homebridge-nest](https://www.npmjs.com/package/homebridge-nest) |
| [homebridge-network-presence](https://www.npmjs.com/package/homebridge-network-presence) |
| [homebridge-ngbs-icon-thermostat](https://www.npmjs.com/package/homebridge-ngbs-icon-thermostat) | 2023-11-11 | [↗](https://github.com/homebridge/verified/issues/581)|
| [homebridge-node-alarm-dot-com](https://www.npmjs.com/package/homebridge-node-alarm-dot-com) |
| [homebridge-noip](https://www.npmjs.com/package/homebridge-noip) |
| [homebridge-notifyevents](https://www.npmjs.com/package/homebridge-notifyevents) |
| [homebridge-nukiio](https://www.npmjs.com/package/homebridge-nukiio) |
| [homebridge-nuvo](https://www.npmjs.com/package/homebridge-nuvo) |
| [homebridge-octoprint-motion](https://www.npmjs.com/package/homebridge-octoprint-motion) |
| [homebridge-omnilink-platform](https://www.npmjs.com/package/homebridge-omnilink-platform) |
| [homebridge-onstar](https://www.npmjs.com/package/homebridge-onstar) |
| [homebridge-open-sesame](https://www.npmjs.com/package/homebridge-open-sesame) |
| [homebridge-openrgb](https://www.npmjs.com/package/homebridge-openrgb) |
| [homebridge-opensprinkler-api](https://www.npmjs.com/package/homebridge-opensprinkler-api) |
| [homebridge-openwebif-tv](https://www.npmjs.com/package/homebridge-openwebif-tv) |
| [homebridge-oppo-udp](https://www.npmjs.com/package/homebridge-oppo-udp) |
| [homebridge-orbit-irrigation](https://www.npmjs.com/package/homebridge-orbit-irrigation) |
| [homebridge-otgw](https://www.npmjs.com/package/homebridge-otgw) |
| [homebridge-overda-uranus](https://www.npmjs.com/package/homebridge-overda-uranus) |
| [homebridge-owfs](https://www.npmjs.com/package/homebridge-owfs) |
| [homebridge-p1](https://www.npmjs.com/package/homebridge-p1) |
| [homebridge-panasonic-ac-platform](https://www.npmjs.com/package/homebridge-panasonic-ac-platform) |
| [homebridge-panasonic-miraie-ac-platform](https://www.npmjs.com/package/homebridge-panasonic-miraie-ac-platform) |
| [homebridge-pc-volume](https://www.npmjs.com/package/homebridge-pc-volume) |
| [homebridge-pentair-intellicenter](https://www.npmjs.com/package/homebridge-pentair-intellicenter) |
| [homebridge-pentair-screenlogic](https://www.npmjs.com/package/homebridge-pentair-screenlogic) |
| [homebridge-people-pro](https://www.npmjs.com/package/homebridge-people-pro) |
| [homebridge-petkit-pet-feeder](https://www.npmjs.com/package/homebridge-petkit-pet-feeder) |
| [homebridge-petkit-platform](https://www.npmjs.com/package/homebridge-petkit-platform) |
| [homebridge-petsafe-smart-feed](https://www.npmjs.com/package/homebridge-petsafe-smart-feed) |
| [homebridge-philips-air](https://www.npmjs.com/package/homebridge-philips-air) |
| [homebridge-philips-android-tv](https://www.npmjs.com/package/homebridge-philips-android-tv) |
| [homebridge-philipsair-platform](https://www.npmjs.com/package/homebridge-philipsair-platform) |
| [homebridge-pico-w-bridge](https://www.npmjs.com/package/homebridge-pico-w-bridge) |
| [homebridge-pico](https://www.npmjs.com/package/homebridge-pico) |
| [homebridge-pihole](https://www.npmjs.com/package/homebridge-pihole) |
| [homebridge-platform-maxcube](https://www.npmjs.com/package/homebridge-platform-maxcube) |
| [homebridge-platform-orbit](https://www.npmjs.com/package/homebridge-platform-orbit) |
| [homebridge-playstation](https://www.npmjs.com/package/homebridge-playstation) |
| [homebridge-plex-webhooks](https://www.npmjs.com/package/homebridge-plex-webhooks) |
| [homebridge-plugin-govee](https://www.npmjs.com/package/homebridge-plugin-govee) |
| [homebridge-plugin-update-check](https://www.npmjs.com/package/homebridge-plugin-update-check) |
| [homebridge-porsche-taycan](https://www.npmjs.com/package/homebridge-porsche-taycan) |
| [homebridge-presence-switch-msgraph](https://www.npmjs.com/package/homebridge-presence-switch-msgraph) |
| [homebridge-presence-switch-slack](https://www.npmjs.com/package/homebridge-presence-switch-slack) |
| [homebridge-printer](https://www.npmjs.com/package/homebridge-printer) |
| [homebridge-programmable-http-switch](https://www.npmjs.com/package/homebridge-programmable-http-switch) |
| [homebridge-prosegur](https://www.npmjs.com/package/homebridge-prosegur) |
| [homebridge-prusa-link](https://www.npmjs.com/package/homebridge-prusa-link) |
| [homebridge-purpleair-sensor](https://www.npmjs.com/package/homebridge-purpleair-sensor) |
| [homebridge-purpleair](https://www.npmjs.com/package/homebridge-purpleair) | 2023-09-03 | [↗](https://github.com/homebridge/verified/issues/564) |
| [homebridge-qolsys](https://www.npmjs.com/package/homebridge-qolsys) |
| [homebridge-rachio-irrigation](https://www.npmjs.com/package/homebridge-rachio-irrigation) |
| [homebridge-rademacher-homepilot](https://www.npmjs.com/package/homebridge-rademacher-homepilot) | 2023-09-14 | [↗](https://github.com/homebridge/verified/issues/569) |
| [homebridge-radiora2](https://www.npmjs.com/package/homebridge-radiora2) |
| [homebridge-rainbird](https://www.npmjs.com/package/homebridge-rainbird) |
| [homebridge-ratgdo](https://www.npmjs.com/package/homebridge-ratgdo) |
| [homebridge-red-alert-via-kumta](https://www.npmjs.com/package/homebridge-red-alert-via-kumta) | 2023-10-16 | [↗](https://github.com/homebridge/verified/issues/577)
| [homebridge-remootio](https://www.npmjs.com/package/homebridge-remootio) |
| [homebridge-resideo](https://www.npmjs.com/package/homebridge-resideo) |
| [homebridge-rgb-ledstrip](https://www.npmjs.com/package/homebridge-rgb-ledstrip) |
| [homebridge-ring](https://www.npmjs.com/package/homebridge-ring) |
| [homebridge-rinnai-controlr](https://www.npmjs.com/package/homebridge-rinnai-controlr) |
| [homebridge-rinnai-touch-platform](https://www.npmjs.com/package/homebridge-rinnai-touch-platform) |
| [homebridge-robonect](https://www.npmjs.com/package/homebridge-robonect) |
| [homebridge-rointe-unofficial](https://www.npmjs.com/package/homebridge-rointe-unofficial) |
| [homebridge-roomba2](https://www.npmjs.com/package/homebridge-roomba2) |
| [homebridge-roomme](https://www.npmjs.com/package/homebridge-roomme) |
| [homebridge-rpi-rf-switch](https://www.npmjs.com/package/homebridge-rpi-rf-switch) |
| [homebridge-rpi](https://www.npmjs.com/package/homebridge-rpi) |
| [homebridge-runnable-platform](https://www.npmjs.com/package/homebridge-runnable-platform) |
| [homebridge-samsung-tizen](https://www.npmjs.com/package/homebridge-samsung-tizen) |
| [homebridge-samsungtv-2014](https://www.npmjs.com/package/homebridge-samsungtv-2014) |
| [homebridge-samsungtvht](https://www.npmjs.com/package/homebridge-samsungtvht) |
| [homebridge-saphi-tv](https://www.npmjs.com/package/homebridge-saphi-tv) |
| [homebridge-sc](https://www.npmjs.com/package/homebridge-sc) |
| [homebridge-schedule](https://www.npmjs.com/package/homebridge-schedule) |
| [homebridge-scout](https://www.npmjs.com/package/homebridge-scout) |
| [homebridge-securitysystem](https://www.npmjs.com/package/homebridge-securitysystem) |
| [homebridge-sensibo-ac](https://www.npmjs.com/package/homebridge-sensibo-ac) |
| [homebridge-sensit-tank-monitor](https://www.npmjs.com/package/homebridge-sensit-tank-monitor) |
| [homebridge-sepsadsecurity](https://www.npmjs.com/package/homebridge-sepsadsecurity) |
| [homebridge-sharkiq](https://www.npmjs.com/package/homebridge-sharkiq) |
| [homebridge-shelly-2pm-plus](https://www.npmjs.com/package/homebridge-shelly-2pm-plus) |
| [homebridge-shelly-ng](https://www.npmjs.com/package/homebridge-shelly-ng) |
| [homebridge-shelly](https://www.npmjs.com/package/homebridge-shelly) |
| [homebridge-sht3x](https://www.npmjs.com/package/homebridge-sht3x) |
| [homebridge-signalk](https://www.npmjs.com/package/homebridge-signalk) |
| [homebridge-simplisafe3](https://www.npmjs.com/package/homebridge-simplisafe3) |
| [homebridge-skybell](https://www.npmjs.com/package/homebridge-skybell) |
| [homebridge-slide-shutter](https://www.npmjs.com/package/homebridge-slide-shutter) |
| [homebridge-sma-home-manager](https://www.npmjs.com/package/homebridge-sma-home-manager) | 2023-10-12 | [↗](https://github.com/homebridge/verified/issues/527) |
| [homebridge-smart-irrigation](https://www.npmjs.com/package/homebridge-smart-irrigation) |
| [homebridge-smartcielo](https://www.npmjs.com/package/homebridge-smartcielo) |
| [homebridge-smartdry](https://www.npmjs.com/package/homebridge-smartdry) |
| [homebridge-smartglass](https://www.npmjs.com/package/homebridge-smartglass) |
| [homebridge-smarthomeng](https://www.npmjs.com/package/homebridge-smarthomeng) |
| [homebridge-smartthings-ik](https://www.npmjs.com/package/homebridge-smartthings-ik) |
| [homebridge-smartthings](https://www.npmjs.com/package/homebridge-smartthings) |
| [homebridge-smtp-motion](https://www.npmjs.com/package/homebridge-smtp-motion) |
| [homebridge-snowsense](https://www.npmjs.com/package/homebridge-snowsense) |
| [homebridge-solaxcloud-api](https://www.npmjs.com/package/homebridge-solaxcloud-api) |
| [homebridge-solis5g-battery](https://www.npmjs.com/package/homebridge-solis5g-battery) |
| [homebridge-somfy-hotwired](https://www.npmjs.com/package/homebridge-somfy-hotwired) |
| [homebridge-somneo](https://www.npmjs.com/package/homebridge-somneo) |
| [homebridge-sonos-multiroom](https://www.npmjs.com/package/homebridge-sonos-multiroom) |
| [homebridge-sonos-starter-track](https://www.npmjs.com/package/homebridge-sonos-starter-track) |
| [homebridge-sonos](https://www.npmjs.com/package/homebridge-sonos) |
| [homebridge-sony-audio](https://www.npmjs.com/package/homebridge-sony-audio) |
| [homebridge-sp108e-platform](https://www.npmjs.com/package/homebridge-sp108e-platform) |
| [homebridge-spanet](https://www.npmjs.com/package/homebridge-spanet) | 2023-11-11 | [↗](https://github.com/homebridge/verified/issues/591) |
| [homebridge-spotify-speaker](https://www.npmjs.com/package/homebridge-spotify-speaker) |
| [homebridge-spruce-irrigation](https://www.npmjs.com/package/homebridge-spruce-irrigation) |
| [homebridge-stagekit](https://www.npmjs.com/package/homebridge-stagekit) |
| [homebridge-stagg-ekg-plus](https://www.npmjs.com/package/homebridge-stagg-ekg-plus) |
| [homebridge-star-projector](https://www.npmjs.com/package/homebridge-star-projector) |
| [homebridge-sunsa](https://www.npmjs.com/package/homebridge-sunsa) |
| [homebridge-switch-button](https://www.npmjs.com/package/homebridge-switch-button) |
| [homebridge-switchbot-bluetooth-platform](https://www.npmjs.com/package/homebridge-switchbot-bluetooth-platform) |
| [homebridge-switchbot-for-mac](https://www.npmjs.com/package/homebridge-switchbot-for-mac) |
| [homebridge-switchbot-sensor-ble](https://www.npmjs.com/package/homebridge-switchbot-sensor-ble) | 2023-09-21 | [↗](https://github.com/homebridge/verified/issues/565) |
| [homebridge-switcher-platform](https://www.npmjs.com/package/homebridge-switcher-platform) |
| [homebridge-tadiran-ac](https://www.npmjs.com/package/homebridge-tadiran-ac) |
| [homebridge-tado-ac](https://www.npmjs.com/package/homebridge-tado-ac) |
| [homebridge-tado-platform](https://www.npmjs.com/package/homebridge-tado-platform) |
| [homebridge-tapo-camera](https://www.npmjs.com/package/homebridge-tapo-camera) |
| [homebridge-tasmota](https://www.npmjs.com/package/homebridge-tasmota) |
| [homebridge-tasmota-control](https://www.npmjs.com/package/homebridge-tasmota-control) |
| [homebridge-tasmota-zbbridge](https://www.npmjs.com/package/homebridge-tasmota-zbbridge) |
| [homebridge-tcc](https://www.npmjs.com/package/homebridge-tcc) |
| [homebridge-television-universal-control](https://www.npmjs.com/package/homebridge-television-universal-control) |
| [homebridge-temperature-sensor-dht](https://www.npmjs.com/package/homebridge-temperature-sensor-dht) |
| [homebridge-tesla](https://www.npmjs.com/package/homebridge-tesla) |
| [homebridge-tesy-heater-v2](https://www.npmjs.com/package/homebridge-tesy-heater-v2) |
| [homebridge-texecom-connect](https://www.npmjs.com/package/homebridge-texecom-connect) |
| [homebridge-thermobit](https://www.npmjs.com/package/homebridge-thermobit) |
| [homebridge-tibber-price](https://www.npmjs.com/package/homebridge-tibber-price) |
| [homebridge-tibberswitch](https://www.npmjs.com/package/homebridge-tibberswitch) |
| [homebridge-tidbyt](https://www.npmjs.com/package/homebridge-tidbyt) |
| [homebridge-tivo-control](https://www.npmjs.com/package/homebridge-tivo-control) |
| [homebridge-tp-link-access-control](https://www.npmjs.com/package/homebridge-tp-link-access-control) |
| [homebridge-tp-link-tapo](https://www.npmjs.com/package/homebridge-tp-link-tapo) |
| [homebridge-tplink-smarthome](https://www.npmjs.com/package/homebridge-tplink-smarthome) |
| [homebridge-ttlock](https://www.npmjs.com/package/homebridge-ttlock) |
| [homebridge-tuya-ir](https://www.npmjs.com/package/homebridge-tuya-ir) |
| [homebridge-tuya-platform-talrhvfork](https://www.npmjs.com/package/homebridge-tuya-platform-talrhvfork) |
| [homebridge-tuya-platform](https://www.npmjs.com/package/homebridge-tuya-platform) |
| [homebridge-tuya](https://www.npmjs.com/package/homebridge-tuya) |
| [homebridge-twinkly-plus](https://github.com/vanHoesel/homebridge-twinkly-plus) |
| [homebridge-uconnect](https://www.npmjs.com/package/homebridge-uconnect) |
| [homebridge-ueboom](https://www.npmjs.com/package/homebridge-ueboom) |
| [homebridge-unifi-occupancy](https://www.npmjs.com/package/homebridge-unifi-occupancy) |
| [homebridge-unifi-poe-control](https://www.npmjs.com/package/homebridge-unifi-poe-control) |
| [homebridge-unifi-protect-camera-motion](https://www.npmjs.com/package/homebridge-unifi-protect-camera-motion) |
| [homebridge-unifi-protect](https://www.npmjs.com/package/homebridge-unifi-protect) |
| [homebridge-unifi-smartpower](https://www.npmjs.com/package/homebridge-unifi-smartpower) |
| [homebridge-ups](https://www.npmjs.com/package/homebridge-ups) |
| [homebridge-velux-active](https://www.npmjs.com/package/homebridge-velux-active) |
| [homebridge-verisure](https://www.npmjs.com/package/homebridge-verisure) |
| [homebridge-vesync-v2](https://www.npmjs.com/package/homebridge-vesync-v2) |
| [homebridge-videodoorbell](https://www.npmjs.com/package/homebridge-videodoorbell) |
| [homebridge-vieramatic](https://www.npmjs.com/package/homebridge-vieramatic) |
| [homebridge-volvo](https://www.npmjs.com/package/homebridge-volvo) |
| [homebridge-washingmachine-pow](https://www.npmjs.com/package/homebridge-washingmachine-pow) |
| [homebridge-wattbox-ip](https://www.npmjs.com/package/homebridge-wattbox-ip) |
| [homebridge-wattbox](https://www.npmjs.com/package/homebridge-wattbox) |
| [homebridge-weather-plus](https://www.npmjs.com/package/homebridge-weather-plus) |
| [homebridge-weatherflow-tempest](https://www.npmjs.com/package/homebridge-weatherflow-tempest) |
| [homebridge-webos-tv](https://www.npmjs.com/package/homebridge-webos-tv) |
| [homebridge-website-change-check](https://www.npmjs.com/package/homebridge-website-change-check) |
| [homebridge-wemo](https://www.npmjs.com/package/homebridge-wemo) |
| [homebridge-wiser](https://www.npmjs.com/package/homebridge-wiser) |
| [homebridge-wol](https://www.npmjs.com/package/homebridge-wol) |
| [homebridge-ws](https://www.npmjs.com/package/homebridge-ws) |
| [homebridge-wyze-robovac](https://www.npmjs.com/package/homebridge-wyze-robovac) |
| [homebridge-wyze-smart-home](https://www.npmjs.com/package/homebridge-wyze-smart-home) |
| [homebridge-xbox-tv](https://www.npmjs.com/package/homebridge-xbox-tv) |
| [homebridge-xfinityhome](https://www.npmjs.com/package/homebridge-xfinityhome) |
| [homebridge-xiaomi-aqara-ac-cooler](https://www.npmjs.com/package/homebridge-xiaomi-aqara-ac-cooler) |
| [homebridge-xiaomi-fan](https://www.npmjs.com/package/homebridge-xiaomi-fan) |
| [homebridge-xiaomi-mi-air-purifier](https://www.npmjs.com/package/homebridge-xiaomi-mi-air-purifier) |
| [homebridge-xiaomi-roborock-vacuum](https://www.npmjs.com/package/homebridge-xiaomi-roborock-vacuum) |
| [homebridge-yeelighter](https://www.npmjs.com/package/homebridge-yeelighter) |
| [homebridge-yet-another-ping](https://www.npmjs.com/package/homebridge-yet-another-ping) |
| [homebridge-yindl](https://www.npmjs.com/package/homebridge-yindl) |
| [homebridge-yokis-usb](https://www.npmjs.com/package/homebridge-yokis-usb) |
| [homebridge-yolink](https://www.npmjs.com/package/homebridge-yolink) |
| [homebridge-z2m](https://www.npmjs.com/package/homebridge-z2m) |
| [homebridge-zidoo-androidtv](https://www.npmjs.com/package/homebridge-zidoo-androidtv) |
| [homebridge-zigbee-nt](https://www.npmjs.com/package/homebridge-zigbee-nt) |
| [homebridge-zp](https://www.npmjs.com/package/homebridge-zp) |