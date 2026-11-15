# GPX plugin for Leaflet

[![CDNJS](https://img.shields.io/cdnjs/v/leaflet-gpx.svg)](https://cdnjs.com/libraries/leaflet-gpx)

[Leaflet](https://leafletjs.com) is a JavaScript library for displaying
interactive maps. This plugin, based on the work of [Pavel
Shramov](https://github.com/shramov) and his
[leaflet-plugins](https://github.com/shramov/leaflet-plugins), allows for
displaying and analyzing GPX tracks and their waypoints so they can be
displayed on a Leaflet map as a new layer.

As it parses the GPX data, `leaflet-gpx` records information about the
GPX track, including total time, moving time, total distance, elevation
stats and heart-rate, and makes it accessible through an exhaustive set
of accessor methods.

GPX parsing will automatically handle pauses in the track with a default
tolerance interval of 15 seconds between points. You can configure this
interval by setting `max_point_interval`, in milliseconds, in the options
passed to the `GPX` constructor.

I've put together a complete example as a
[demo](https://mpetazzoni.github.io/leaflet-gpx/) where you can also load
your own GPX file or URL.

## License

`leaflet-gpx` is under the *BSD 2-clause license*. Please refer to the
attached LICENSE file and/or to the copyright header in gpx.js for more
information.

## Compatibility

`leaflet-gpx` 3.x is an ES module for Leaflet 2.x. It is not yet published
to npm; the examples below use the GitHub branch and Leaflet 2.0.0-beta.4.

For Leaflet 1.x, use `leaflet-gpx@2.2.0` or the
[2.x maintenance branch](https://github.com/mpetazzoni/leaflet-gpx/tree/leaflet-gpx-2.x).

## Usage

Import `GPX`, create your map, and add the track:

### Using with an Import Map (Vanilla JS)

```html
<html>
  <head>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@2.0.0-beta.4/dist/leaflet.css" />
    <style>
      #map { height: 500px; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <!-- ... -->
    
    <script type="importmap">
      {
        "imports": {
          "leaflet": "https://unpkg.com/leaflet@2.0.0-beta.4/dist/leaflet.js",
          "leaflet-gpx": "https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@main/gpx.js"
        }
      }
    </script>
    
    <script type="module">
      import { Map, TileLayer } from 'leaflet';
      import { GPX } from 'leaflet-gpx';

      const map = new Map('map');
      new TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
      }).addTo(map);

      // URL to your GPX file or the GPX itself as a XML string.
      const url = 'https://mpetazzoni.github.io/leaflet-gpx/demo.gpx';
      const options = {
        async: true,
        polyline_options: { color: 'red' },
      };

      new GPX(url, options).on('loaded', (e) => {
        map.fitBounds(e.target.getBounds());
      }).on('error', e => console.error(e.err)).addTo(map);
     </script>
  </body>
</html>
```

### Using with a bundler (Vite, Webpack, etc.)

```bash
npm install leaflet@2.0.0-beta.4 'github:mpetazzoni/leaflet-gpx#main'
```

```javascript
import { Map, TileLayer } from 'leaflet';
import { GPX } from 'leaflet-gpx';

const map = new Map('map');
new TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);
const url = 'https://mpetazzoni.github.io/leaflet-gpx/demo.gpx';
new GPX(url, { async: true })
  .on('loaded', e => map.fitBounds(e.target.getBounds()))
  .on('error', e => console.error(e.err))
  .addTo(map);
```

Include `leaflet/dist/leaflet.css` and give the map element a height.

### Loading local files and URLs

Pass a URL or GPX XML string to the constructor. For a local file, add
`<input id="gpx-file" type="file" accept=".gpx">` and read it with
`File.text()`. This example also renders waypoint popup text safely:

```javascript
function showGPX(input) {
  return new GPX(input, { async: true })
    .on('addpoint', e => {
      if (e.point_type !== 'waypoint') return;
      const content = document.createElement('div');
      content.textContent = Array.from(e.element.children)
        .filter(child => ['name', 'desc'].includes(child.localName))
        .map(child => child.textContent).join('\n');
      e.point.setPopupContent(content); // Replace the built-in HTML popup.
    })
    .on('loaded', e => map.fitBounds(e.target.getBounds()))
    .on('error', e => console.error('GPX load/parse failed:', e.err))
    .addTo(map);
}

document.getElementById('gpx-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return; // The picker may be cancelled.
  try {
    const xml = await file.text();
    if (!xml.trimStart().startsWith('<')) throw new Error('Expected GPX XML');
    showGPX(xml);
  } catch (error) {
    console.error('Could not read GPX file:', error);
  }
});

showGPX('https://mpetazzoni.github.io/leaflet-gpx/demo.gpx');
```

Remote URLs must allow cross-origin requests (CORS). Use HTTPS URLs on
HTTPS pages. Local files are not uploaded, but map tiles still require
network requests. See [Caveats](#caveats) before loading untrusted files.

### TypeScript

TypeScript definitions are included, using Leaflet 2's own types. You do
not need `@types/leaflet` or `@types/leaflet-gpx`.

```typescript
import { Map } from 'leaflet';
import { GPX } from 'leaflet-gpx';
import type { GPXOptions } from 'leaflet-gpx';

const map = new Map('map');
const options: GPXOptions = {
  async: true,
  polyline_options: { color: 'red' },
};

new GPX('track.gpx', options).on('loaded', e => {
  map.fitBounds(e.target.getBounds());
}).addTo(map);
```

Use `NodeNext` or `Bundler` module resolution. Leaflet beta.4's types do
not yet support `exactOptionalPropertyTypes`.

## Functions

If you want to display additional information about the GPX track, you can do
so in the 'loaded' event handler, calling one of the following methods on the
`GPX` object `e.target`:

* `get_name()`: returns the name of the GPX track
* `get_distance()`: returns the total track distance, in meters
* `get_start_time()`: returns a Javascript `Date` object representing the
  starting time
* `get_end_time()`: returns a Javascript `Date` object representing when the
  last point was recorded
* `get_moving_time()`: returns the moving time, in milliseconds
* `get_total_time()`: returns the total track time, in milliseconds
* `get_moving_pace()`: returns the average moving pace in milliseconds per km
* `get_moving_speed()`: returns the average moving speed in km per hour
* `get_total_speed()`: returns the average total speed in km per hour
* `get_elevation_min()`: returns the lowest elevation, in meters
* `get_elevation_max()`: returns the highest elevation, in meters
* `get_elevation_gain()`: returns the cumulative elevation gain, in meters
* `get_elevation_loss()`: returns the cumulative elevation loss, in meters
* `get_speed_max()`: returns the maximum speed in km per hour
* `get_average_hr()`: returns the average heart rate (if available)
* `get_average_cadence()`: returns the average cadence (if available)
* `get_average_temp()`: returns the average of the temperature (if available)

If you're not a fan of the metric system, you also have the following methods
at your disposal:

* `get_distance_imp()`: returns the total track distance in miles
* `get_moving_pace_imp()`: returns the average moving pace in milliseconds per
  mile
* `get_moving_speed_imp()`: returns the average moving speed in miles per hour
* `get_total_speed_imp()`: returns the average total speed in miles per hour
* `get_elevation_min_imp()`: returns the lowest elevation, in feet
* `get_elevation_max_imp()`: returns the highest elevation, in feet
* `get_elevation_gain_imp()`: returns the cumulative elevation gain, in feet
* `get_elevation_loss_imp()`: returns the cumulative elevation loss, in feet
* `get_speed_max_imp()`: returns the maximum speed in miles per hour

The reason why these methods return milliseconds is that you have at your
disposal nice helper methods to format a duration in milliseconds into a cool
string:

* `get_duration_string(duration, hidems)` format to a string like `3:07'48"`
  or `59'32.431`, where `duration` is in
  milliseconds and `hidems` is an optional boolean you can use to request never
  to display millisecond precision.
* `get_duration_string_iso(duration, hidems)` formats to an ISO like
  representation like `3:07:48` or `59:32.431`, where `duration` is in
  milliseconds and `hidems` is an optional boolean you can use to request never
  to display millisecond precision.

You can also get full elevation, heartrate, cadence and temperature data with:

* `get_elevation_data()` and `get_elevation_data_imp()`
* `get_speed_data()` and `get_speed_data_imp()`
* `get_heartrate_data()` and `get_heartrate_data_imp()`
* `get_cadence_data()` and `get_cadence_data_imp()`
* `get_temp_data()` and `get_temp_data_imp()`

These methods all return an array of points `[distance, value, tooltip]` where
the distance is either in kilometers or in miles and the elevation in meters or
feet, depending on whether you use the `_imp` variant or not. Heart rate,
obviously, doesn't change.

## Reloading

You can make `leaflet-gpx` reload the source GPX file by calling the
`reload()` method. For example, to trigger a reload every 5 seconds, you
can do:

```javascript
const gpx = new GPX(url).on('error', e => console.error(e.err));
setInterval(function() {
  gpx.reload();
}, 5000);
```

## About marker icons

### Configuring markers

By default, `leaflet-gpx` uses Leaflet's `DefaultIcon` for all
markers. You can override this behavior by providing a Leaflet `Icon`
object, or the path or URL to an image to use as the marker, for any of
the markers supported by this plugin as part of the `markers` parameter:

```javascript
import { DefaultIcon } from 'leaflet';

new GPX(url, {
  async: true,
  markers: {
    startIcon: new DefaultIcon({ color: 'green' }),
    endIcon: new DefaultIcon({ color: 'red' }),
    wptIcons: { '': new DefaultIcon() },
    wptTypeIcons: {},
    pointMatchers: [],
  }
}).on('loaded', function(e) {
  map.fitBounds(e.target.getBounds());
}).addTo(map);
```

* `startIcon` is used for the marker at the beginning of the GPX track;
* `endIcon` is used for the marker at the end of the GPX track;
* `wptIcons` and `wptTypeIcons` are mappings of waypoint symbols and
  types to the icon you want to use for each;
* `pointMatchers` is an array of custom point matchers and their
  respective icon (see below);

Set `startIcon` or `endIcon` to `null` to disable that pin. To hide all
standalone waypoints, use empty `wptIcons`, `wptTypeIcons`, and
`pointMatchers` containers (`{}`, `{}`, and `[]`, not `null`).

Here is how you would override the URL of the provided icons for start
and end markers, but none of the other types of markers:

```javascript
new GPX(url, {
  async: true,
  markers: {
    startIcon: 'images/pin-icon-start.png',
    endIcon: 'images/pin-icon-end.png',
  }
}).on('loaded', function(e) {
  map.fitBounds(e.target.getBounds());
}).addTo(map);
```

You can also provide a Leaflet `Icon` instance directly:

```javascript
import { DefaultIcon } from 'leaflet';

new GPX(url, {
  async: true,
  markers: {
    wptIcons: {
      'Coffee shop': new DefaultIcon({ color: 'blue' })
    }
  }
}).on('loaded', function (e) {
  map.fitBounds(e.target.getBounds());
}).addTo(map);
```

### Marker options

`marker_options` applies to icons created from image URLs, not existing
icon objects. The default size is `[33, 45]` and anchor is `[16, 45]`:

```javascript
new GPX(url, {
  async: true,
  markers: { startIcon: 'images/pin-icon-start.png' },
  marker_options: {
    iconSize: [38, 95],
    iconAnchor: [22, 94],
  }
}).on('loaded', function(e) {
  map.fitBounds(e.target.getBounds());
}).addTo(map);
```

The legacy `clickable` option no longer disables marker events.

### Sensible defaults

Note that you do not need to override all the marker definitions, or
marker options, when providing the `markers` and `marker_options`
parameters to the GPX constructor as this plugin will use sensible
defaults for all of those settings.

## About waypoints

By default, this plugin will parse all Waypoints from a GPX file. This
can be controlled via the value `waypoint` in `gpx_options`, e.g.
`parseElements: ['track', 'route', 'waypoint']`.

The icon used in the marker representing each track waypoint is
determined based on the waypoint's properties, in this order:

* If the waypoint has a `<sym>` element with a matching non-null entry, the `markers.wptIcons[sym]`
  icon is used;
* If the waypoint has a `<type>` element with a matching non-null entry, the `markers.wptTypeIcons[type]`
  icon is used;
* Point matchers are evaluated in order, if one matches the waypoint's
  `<name>` element, its icon is used (see [Named points](#named-points));
* Only when no point matchers are configured, the default `''` (empty string)
  icon entry in `wptIcons` is used as a fallback.

Note: an unmatched waypoint can reuse the previous waypoint's icon.

```javascript
import { DefaultIcon } from 'leaflet';

new GPX(url, {
  async: true,
  markers: {
    wptIcons: {
      '': new DefaultIcon(),
      'Geocache Found': 'img/gpx/geocache.png',
      'Park': 'img/gpx/tree.png'
    },
  }
}).on('loaded', function (e) {
  map.fitBounds(e.target.getBounds());
}).addTo(map);
```

## Named points

GPX points can be named, for example to denote certain POIs (points of
interest). You can setup rules to match point names to create labeled
markers for those points by providing a `pointMatchers` array in the
`markers` constructor parameter.

Each element in this array must define a `regex` to match the point's
name and an `icon` definition (an `Icon` or subclass object, or the URL
to an icon image).

Each named point in the GPX track is evaluated against those rules and
a marker is created with the point's name as label from the first
matching rule. This also applies to named waypoints, but keep in mind
that waypoint icons rules take precedence over point matchers.

```javascript
import { DefaultIcon } from 'leaflet';

new GPX(url, {
  async: true,
  markers: {
    pointMatchers: [
      {
        regex: /Coffee/,
        icon: new DefaultIcon({ color: 'blue' }),
      },
      {
        regex: /Home/,
        icon: new DefaultIcon({ color: 'green' }),
      }
    ]
  }
}).on('loaded', function(e) {
  map.fitBounds(e.target.getBounds());
}).addTo(map);
```

## Events

Events are fired on the `GPX` object as the GPX data is being parsed
and the map layers generated. You can listen for those events by
attaching the corresponding event listener on the `GPX` object:

```javascript
new GPX(url, {
  async: true,
  // options
}).on('addpoint', function(e) {
  console.log('Added ' + e.point_type + ' point: ' + e.point);
}).on('loaded', function(e) {
  var gpx = e.target;
  map.fitBounds(gpx.getBounds());
}).on('error', function(e) {
  console.log('Error loading file: ' + e.err);
}).addTo(map);
```

Use `async: true` to catch `addpoint` and `addline`, which fire during
parsing. `loaded` and `error` are deferred even without that option.

`addpoint` events are fired for every marker added to the map, in
particular for the start and end points, all the waypoints, and all the
named points that matched `pointMatchers` rules. Each `addpoint` event
contains the following properties:

- `point`: the marker object itself, from which you can get or modify
  the latitude and longitude of the point and any other attribute of the
  marker.
- `point_type`: one of `start`, `end`, `waypoint` or `label`, allowing
  you to identify what type of point the marker is for.
- `element`: the track point element the marker was created for.

One use case for those events is for example to attach additional
content or behavior to the markers that were generated (popups, etc).

`error` fires when loading or parsing fails, or no layers of the selected
types can be parsed. It contains the following property:

- `err`: a message with details about the error that occurred.

## Hovering over track points

The `addline` event provides a polyline in `event.line`; its
`getLatLngs()` points include `meta` with time, elevation and sensor data.
Use `async: true` to catch `addline` before parsing starts.
See the [rich hover example](examples/hover.md) for a nearest-sample tooltip.

## Line styling

`leaflet-gpx` understands the [GPX
Style](https://www.topografix.com/GPX/gpx_style/0/2) extension, and will
extract styling information defined on routes and track segments to use
for drawing the corresponding polyline.

```xml
<trkseg>
  <extensions>
    <line xmlns="http://www.topografix.com/GPX/gpx_style/0/2">
      <color>FF0000</color>
      <opacity>0.5</opacity>
      <width>1</width>
      <linecap>square</linecap>
      <dasharray>
        <dash mark="0" space="10"/>
      </dasharray>
    </line>
  </extensions>
  <trkpt lat="..." lon="..."></trkpt>
</trkseg>
```

> **Note:** For backward compatibility, `leaflet-gpx` also accepts `<weight>`
> as an alias for `<width>`, and `<dasharray>` with flat text content (e.g.
> `<dasharray>0,10</dasharray>`) instead of `<dash>` child elements. The
> non-standard `<linejoin>` and `<dashoffset>` elements are also still
> supported.

You can override the style of the lines by passing a `polyline_options`
array into the `options` argument of the `GPX` constructor. Routes and
tracks are indexed independently from zero, in document order within
each category: entry zero applies to both the first route and first track.
All segments of a track share its entry; missing entries retain XML/default
styling.

```javascript
new GPX(url, {
  polyline_options: [{
    color: 'green',
    opacity: 0.75,
    weight: 3,
    lineCap: 'round'
  },{
    color: 'blue',
    opacity: 0.75,
    weight: 1
  }]
}).on('loaded', function(e) {
  var gpx = e.target;
  map.fitBounds(gpx.getBounds());
}).addTo(map);
```

If you have many routes or tracks in your GPX file and you want them to
share the same styling, you can pass `polyline_options` as a single
object rather than an array (this is also how `leaflet-gpx` worked
before the introduction of the array):

```javascript
new GPX(url, {
  polyline_options: {
    color: 'green',
    opacity: 0.75,
    weight: 3,
    lineCap: 'round'
  }
}).on('loaded', function(e) {
  var gpx = e.target;
  map.fitBounds(gpx.getBounds());
}).addTo(map);
```

For more information on the available polyline styling options, refer to
the [Leaflet documentation on
Polyline](https://leafletjs.com/reference.html#polyline). By
default, if no styling is available, the line will be drawn in _blue_.

## GPX parsing options

### Selecting which elements define the track

Some GPX tracks contain the actual route/track twice, both the `<trk>`
and `<rte>` elements are used. You can tell `leaflet-gpx` which tag to
use or to use both (which is the default setting for backwards
compatibility). The `parseElements` field of `gpx_options` controls this
behavior. It should be an array that contains `'route'` and/or `'track'`
and/or `'waypoint'`.

### Multiple track segments within each track

GPX file may contain multiple tracks represented by `<trk>` elements,
each track possibly composed of multiple segments with `<trkseg>`
elements. Although this plugin will always represent each GPX route and
each GPX track as distinct entities with their own start and end
markers, track segments will by default be joined into a single line.

You can disable this behavior by setting the `joinTrackSegments` flag to
`false` in the `gpx_options`:

```javascript
new GPX(url, {
  gpx_options: {
    joinTrackSegments: false
  }
}).on('loaded', function(e) {
  map.fitBounds(e.target.getBounds());
}).addTo(map);
```

## Caveats

* Waypoint popups use HTML. For untrusted GPX files, replace their contents
  with text as shown in the [local-file example](#loading-local-files-and-urls).
* Distance calculation is relatively accurate, but elevation change
  calculation is not topographically adjusted, so the total elevation
  gain/loss/change might appear inaccurate in some situations.
