# Syntax of the config.json
In the platforms section, you can insert a KNX type platform. 
You need to configure all devices directly in the config.json.
````json
    "platforms": [
        {
            "platform": "KNX",
            "name": "KNX",
            "knxd_ip": "192.168.178.205", 
            "knxd_port": 6720,
            "accessories": [
                {
                    "accessory_type": "knxdevice",
                    "name": "Living Room North Lamp",
                    "services": [
                        {
                            "type": "Lightbulb",
                            "description": "iOS8 Lightbulb type, supports On (Switch) and Brightness",
                            "name": "Living Room North Lamp",
                            "On": {
                                "Set": "1/1/6",
                                "Listen": ["1/1/63"]
                            },
                            "Brightness": {
                                "Set": "1/1/62",
                                "Listen": ["1/1/64"]
                            }
                        }
                    ]
                }
             ]
        }
````
In the accessories section (the array within the brackets [ ]) you can insert as many objects as you like in the following form
````json
    {
	    "accessory_type": "knxdevice",
	    "name": "Here goes your display name, this will be shown in HomeKit apps",
	    "services": [
	        {      
	        }
	    ]
    }
````                 
You have to add services in the following syntax:
````json
    {
        "type": "SERVICENAME",
        "description": "This is just for you to remember things",
        "name": "beer tap thermostat",
        "CHARACTERISTIC1": {
            "Set": "1/1/6",
            "Listen": [
                "1/1/63"
            ]
        },
        "CHARACTERISTIC2": {
            "Set": "1/1/62",
            "Listen": [
                "1/1/64"
            ]
        }
    }
````
`CHARACTERISTICx` are properties that are dependent on the service type, so they are listed below.

Two kinds of addresses are supported: `"Set":"1/2/3"` is a writable group address, to which changes are sent if the service supports changing values. Changes on the bus are listened to, too.
`"Listen":["1/2/3","1/2/4","1/2/5"]` is an array of addresses that are listened to additionally. To these addresses never values get written, but the on startup the service will issue *KNX read requests* to ALL addresses listed in `Set:` and in `Listen:`  


For two characteristics there are additional minValue and maxValue attributes. These are CurrentTemperature and TargetTemperature, and are used in TemperatureSensor and Thermostat.

So the charcteristic section may look like:

 ````json
    {
        "type": "Thermostat",
        "description": "Sample thermostat",
        "name": "We need a name for each service, though it usually shows only if multiple services are present in one accessory",
        "CurrentTemperature": {
            "Set": "1/1/6",
            "Listen": [
                "1/1/63"
            ],
            minValue: -18,
            maxValue: 30
        },
        "TargetTemperature": {
            "Set": "1/1/62",
            "Listen": [
                "1/1/64"
            ],
            minValue: -4,
            maxValue: 12
        }
    }
````


## reversal of values for characteristics
In general, all DPT1 types can be reversed. If you need a 1 for "contact" of a contact senser, you can append an "R" to the group address.
Likewise, all percentages of DPT5 can be reversed, if you need a 100% (=255) for window closed, append an "R" to the group address. Do not forget the listening addresses!
 ````json
    {
        "type": "ContactSensor",
        "description": "Sample ContactSensor with 1 as contact (0 is Apple's default)",
        "name": "WindowContact1",
        "ContactSensorState": {
            "Listen": [
                "1/1/100R"
            ]
        }
    }
````
# Supported Services and their characteristics
## ContactSensor
-  ContactSensorState: DPT 1.002, 0 as contact 
-  ~~ContactSensorStateContact1: DPT 1.002, 1 as contact~~

-  StatusActive: DPT 1.011, 1 as true
-  StatusFault: DPT 1.011, 1 as true
-  StatusTampered: DPT 1.011, 1 as true
-  StatusLowBattery: DPT 1.011, 1 as true

## GarageDoorOpener
-  CurrentDoorState: DPT5 integer value in range 0..4
	//			Characteristic.CurrentDoorState.OPEN = 0;
	//			Characteristic.CurrentDoorState.CLOSED = 1;
	//			Characteristic.CurrentDoorState.OPENING = 2;
	//			Characteristic.CurrentDoorState.CLOSING = 3;
	//			Characteristic.CurrentDoorState.STOPPED = 4;

-  TargetDoorState: DPT5 integer value in range 0..1
	// Characteristic.TargetDoorState.OPEN = 0;
	// Characteristic.TargetDoorState.CLOSED = 1;

-  ObstructionDetected: DPT1, 1 as true

-  LockCurrentState: DPT5 integer value in range 0..3
	//			Characteristic.LockCurrentState.UNSECURED = 0;
	//			Characteristic.LockCurrentState.SECURED = 1;
	//			Characteristic.LockCurrentState.JAMMED = 2;
	//			Characteristic.LockCurrentState.UNKNOWN = 3;

-  LockTargetState: DPT5 integer value in range 0..1
	//			Characteristic.LockTargetState.UNSECURED = 0;
	//			Characteristic.LockTargetState.SECURED = 1;



## Lightbulb
 -  On: DPT 1.001, 1 as on, 0 as off
 -  Brightness: DPT5.001 percentage, 100% (=255) the brightest

## LightSensor
-  CurrentAmbientLightLevel: DPT 9.004, 0 to 100000 Lux 
 
## LockMechanism (This is poorly mapped!)
-  LockCurrentState: DPT 1, 1 as secured  
-  ~~LockCurrentStateSecured0: DPT 1, 0 as secured~~
-  LockTargetState: DPT 1, 1 as secured 
-  ~~LockTargetStateSecured0: DPT 1, 0 as secured~~

*ToDo here: correction of mappings, HomeKit reqires lock states UNSECURED=0, SECURED=1, JAMMED = 2, UNKNOWN=3*

## MotionSensor
-  MotionDetected: DPT 1.002, 1 as motion detected

-  StatusActive: DPT 1.011, 1 as true
-  StatusFault: DPT 1.011, 1 as true
-  StatusTampered: DPT 1.011, 1 as true
-  StatusLowBattery: DPT 1.011, 1 as true

## Outlet
 -  On: DPT 1.001, 1 as on, 0 as off
 -  OutletInUse: DPT 1.011, 1 as on, 0 as off
 
## Switch
 -  On: DPT 1.001, 1 as on, 0 as off

## TemperatureSensor
-  CurrentTemperature: DPT9.001 in °C [listen only]
  
## Thermostat
-  CurrentTemperature: DPT9.001 in °C [listen only], -40 to 80°C if not overriden as shown above
-  TargetTemperature: DPT9.001, values 0..40°C only, all others are ignored
-  CurrentHeatingCoolingState: DPT20.102 HVAC, because of the incompatible mapping only off and heating (=auto) are shown, [listen only]
-  TargetHeatingCoolingState: DPT20.102 HVAC, as above

## Window
-  CurrentPosition: DPT5.001 percentage
-  TargetPosition: DPT5.001 percentage
-  PositionState: DPT5.005 value [listen only: 0 Increasing, 1 Decreasing, 2 Stopped]

## WindowCovering
-  CurrentPosition: DPT5 percentage
-  TargetPosition: DPT5 percentage
-  PositionState: DPT5 value [listen only: 0 Closing, 1 Opening, 2 Stopped]

### not yet supported
-  HoldPosition
-  TargetHorizontalTiltAngle
-  TargetVerticalTiltAngle
-  CurrentHorizontalTiltAngle
-  CurrentVerticalTiltAngle
-  ObstructionDetected




# DISCLAIMER
**This is work in progress!**

