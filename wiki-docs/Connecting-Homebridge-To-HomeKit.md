This article will explain how to add and remove Homebridge from the iOS Home app.

Before getting started, make sure you have set up Homebridge using the methods described in the [Homebridge wiki](https://github.com/homebridge/homebridge/wiki).

## How To Add Homebridge

1. Open the Home <img src="https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png" height="16.42px"> app on your device.
2. Tap the Home tab, then tap <img src="https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png" height="16.42px">.
3. Tap *Add Accessory*, then scan the QR code in the Homebridge UI or your Homebridge logs.

If the bridge does not have any accessories yet, you may receive a message saying *Additional Set-up Required*, this is ok, as you add plugins they will show up in the Home app without the need to pair again (except for Cameras and TVs).

## How To Add Homebridge Cameras / TVs

Cameras and most TV devices are exposed as separate accessories and each needs to be manually paired.

1. Open the Home <img src="https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png" height="16.42px"> app on your device.
2. Tap the Home tab, then tap <img src="https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png" height="16.42px">.
3. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*.
4. Select the accessory you want to pair.
5. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use Camera* and scan the QR code again.

## How To Remove Homebridge

1. Open the Home <img src="https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png" height="16.42px"> app on your device.
2. Tap the Home tab, then tap <img src="https://user-images.githubusercontent.com/3979615/78120215-4365ab00-7455-11ea-8191-f6ca7f1833dd.png" height="16.42px"> in the upper-left-corner and select *Home Settings*.
3. Scroll down and select *Hubs and Bridges*.
4. Select the Homebridge instance you wish to remove and click *Remove Bridge from Home*.

After removing a bridge from your Home, it must be *Reset* before it can be added again.

## How To Reset Homebridge

If you're having trouble adding Homebridge using the Home app or have previously removed the bridge and need to re-add it, you may need to reset the Homebridge instance.

To do this, login to the [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) and from the side menu, select *Settings* and then choose *Unpair All Bridges* (called *Reset Homebridge Accessory* in older UI versions).

Alternatively you can manually delete the `persist` and `accessories` folders in your Homebridge storage directory and then restart Homebridge.