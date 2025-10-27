Plugin developers who have had their plugin [Verified by Homebridge](https://github.com/homebridge/homebridge/wiki/Verified-Plugins) can display a **Donate** button next to their plugin when displayed in the Homebridge UI:

<p align="">
<img src="https://user-images.githubusercontent.com/3979615/89642884-01171380-d8f8-11ea-8bd4-7d642f910b7e.png">
</p>

When clicked, a modal is displayed showing the donation options you have defined:

<p align="">
<img src="https://user-images.githubusercontent.com/3979615/89642944-1db34b80-d8f8-11ea-83a5-8d02e05434e2.png">
</p>

## Eligibility

For your plugin to display a **Donate** link, it must:

* published to the npm registry
* be [Verified by Homebridge](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

## Why

As more users install their plugins through the [Homebridge UI](https://github.com/oznu/homebridge-config-ui-x), they are less likely to visit the projects GitHub page where the ways to support a developer would typically be displayed. Adding donation links directly in the Homebridge UI ensures users know how to support Homebridge developers if they wish to do so.

## How

The donation links use the existing, optional, `package.json` [funding](https://docs.npmjs.com/configuring-npm/package-json.html#funding) attribute.

In your plugins `package.json` add the "funding" attribute in one of the following ways (`"type"` can be anything):

#### Single donation option:

```json
"funding": {
  "type" : "github",
  "url" : "https://github.com/sponsors/my-account"
}
```

```json
"funding": {
  "type" : "paypal",
  "url" : "https://paypal.me/my-account"
}
```

```json
"funding": {
  "type" : "patreon",
  "url" : "https://www.patreon.com/my-account"
}
```

#### Multiple donation options:

```json
"funding": [
  {
    "type" : "github",
    "url" : "https://github.com/sponsors/my-account"
  },
  {
    "type" : "patreon",
    "url" : "https://www.patreon.com/my-account"
  }
]
```

## Platform Icons

Platform icons are determined by the funding `type` attribute. 

* PayPal - `paypal`
* GitHub Sponsors - `github`
* Patreon - `patreon`
* Ko-Fi - `kofi` or `ko-fi`

All other types will display a generic link icon.
