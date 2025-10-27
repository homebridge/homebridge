> The contents of this article have been largely copied from this [excellent post by u/nichoaus on Reddit](https://www.reddit.com/r/homebridge/comments/aml8f9/so_youre_having_trouble_with_your_configjson_file/).

JSON can be a tricky thing to understand, but it is simpler than you might first think. Below are steps for understanding JSON structure and helpful tips to configure your Homebridge `config.json` file.

Before going too far, be sure to use a code editor like [Visual Studio Code](https://code.visualstudio.com/) instead of just a text edit app to build your JSON file. Homebridge UI apps such as [Homebridge Config UI X](https://github.com/homebridge/homebridge-config-ui-x) have a built in JSON editors that will ensure your JSON is valid and matches what Homebridge is expecting.

Now that you have a good code editor installed, check out this example of a simple JSON file. It's been colour coded to help highlight each section.

<p align="center">
<img  src="https://user-images.githubusercontent.com/3979615/74000048-cff66e80-49ba-11ea-90a5-952cd162360f.png" alt="config-json-sample" width="50%"/>
</p>

Each coloured section is:

* **Brown** - the entire file (note the curly brackets `{}` at the top and bottom)
* **White** - The 'bridge' information
* **Yellow** - The accessories section
* **Red** - One accessory
* **Blue** - Another accessory
* **Orange** - The platforms section
* **Green** - One Platform
* **Purple** - Another Platform

Each section is indented a certain amount and has a parent section. For example:

* Accessory 'WeMo' (colour red) has a parent of 'Accessories' (colour yellow), which has a parent of the entire file colour brown)

This is called 'nesting', and each actual accessory or platform will be nested under their respective parent (Accessories or Platforms). I know it's confusing because an accessory is called 'accessory', and its nested under 'Accessories', but hopefully the visual representation of nesting helps.

When you're configuring your JSON file, you'll most likely be adding parts to the accessories and platforms sections (yellow and orange, respectively). Here's what you need to know about proper configuration (using Platforms as an example):

We have two platforms in our config.json file, Hue (green) and Lifx (purple). The Hue platform is above Lifx. Notice at the end of the Hue array, there is a comma after the closed curly bracket?

```
},
```

This tells the system that there's another array within the Platforms section. Notice that there is no comma after the Lifx platform section? This is because there is no other array for the Platforms section, so the system knows to stop looking for another platform. Here's an example of incorrect config:

```json
"platforms": [
    {
        "platform" : "PhilipsHue",
        "name" : "Hue"
    },
    {
        "platform": "LifxLan",
        "name": "Lifx",
        "ignoredDevices" : ["xxxxxxxx", "yyyyyyyyy"]
    }, <-- this comma is incorrect
]

```

So what's wrong? The comma after the last curly bracket is causing an error. A super handy website to use when you want to validate your config is https://jsonlint.com. If you were to paste the full config into https://jsonlint.com (including the incorrect comma), you'll get this error:

```
Error: Parse error on line 30:
... "yyyyyyyyy"]		},	]}
---------------------^
Expecting 'STRING', 'NUMBER', 'NULL', 'TRUE', 'FALSE', '{', '[', got ']'
```

This means *the parser was expecting some form of data one of the listed formats such as String, Number etc), but instead it got a closed square bracket `]`*. To fix, look for reasons why the system would expect more data. In this case, we're telling the system *after this comma, we're going to have another array*, which is false.

The same rule here goes for structuring arrays within your sections. Look at the Hue (green) section, and note where the commas are after each line (hint, there is only one comma after the first line.

```json
{
    "platform" : "PhilipsHue", <--- comma
    "name" : "Hue" <-- no comma
},
```

The same principal as above works here, where you need to add a comma after each line except for the last line. Check the Lifx section (purple), which has 3 lines. Note which lines the commas are on.

```json
{
    "platform": "LifxLan", <--- comma
    "name": "Lifx", <--- comma
    "ignoredDevices" : ["xxxxxxxx", "yyyyyyyyy"] <-- no comma
}
```

Remember, **you will only have one Accessories and Platform sections**. You can have different accessories and platforms (just like in the example file) within each of these sections, but if you have Platforms or Accessories more than once, you'll get an error.

A tip with JSON files and homebridge is your best to try figuring it out yourself. It may seem daunting at first, but once you learn correct syntax, you'll be able to add more complex structures to your config files, allowing for simply amazing Homebridge installs. I hope this write up helps!