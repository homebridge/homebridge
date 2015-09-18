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
        "name": "We need a name for each service, though it usually shows only if multiple services are present in one accessory",
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


# Supported Services and their characteristics

## ContactSensor
-  ContactSensorState: DPT 1, 0 as contact **OR**
-  ContactSensorStateContact1: DPT 1, 1 as contact

-  StatusActive: DPT 1, 1 as true
-  StatusFault: DPT 1, 1 as true
-  StatusTampered: DPT 1, 1 as true
-  StatusLowBattery: DPT 1, 1 as true

## Lightbulb
 -  On: DPT 1, 1 as on, 0 as off
 -  Brightness: DPT5 percentage, 100% (=255) the brightest

## LightSensor
-  CurrentAmbientLightLevel: DPT 9, 0 to 100000 Lux 
 
## LockMechanism
-  LockCurrentState: DPT 1, 1 as secured **OR (but not both:)** 
-  LockCurrentStateSecured0: DPT 1, 0 as secured
-  LockTargetState: DPT 1, 1 as secured **OR**  
-  LockTargetStateSecured0: DPT 1, 0 as secured

## Outlet
 -  On: DPT 1, 1 as on, 0 as off
 -  OutletInUse: DPT 1, 1 as on, 0 as off
 
## Switch
 -  On: DPT 1, 1 as on, 0 as off

## TemperatureSensor
-  CurrentTemperature: DPT9 in °C [listen only]
  
## Thermostat
-  CurrentTemperature: DPT9 in °C [listen only]
-  TargetTemperature: DPT9, values 0..40°C only, all others are ignored
-  CurrentHeatingCoolingState: DPT5 HVAC, because of the incompatible mapping only off and heating (=auto) are shown, [listen only]
-  TargetHeatingCoolingState: as above

## Window
-  CurrentPosition: DPT5 percentage
-  TargetPosition: DPT5 percentage
-  PositionState: DPT5 value [listen only]

## WindowCovering
-  CurrentPosition: DPT5 percentage
-  TargetPosition: DPT5 percentage
-  PositionState: DPT5 value [listen only]

### not yet supported
-  HoldPosition
-  TargetHorizontalTiltAngle
-  TargetVerticalTiltAngle
-  CurrentHorizontalTiltAngle
-  CurrentVerticalTiltAngle
-  ObstructionDetected




# DISCLAIMER
**This is work in progress!**

