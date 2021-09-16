# GPX plugin for Leaflet

[![CDNJS](https://img.shields.io/cdnjs/v/leaflet-gpx.svg)](https://cdnjs.com/libraries/leaflet-gpx)

[Leaflet](http://www.leafletjs.com) is a Javascript library for displaying
interactive maps. This plugin, based on the work of [Pavel
Shramov](http://github.com/shramov) and his
[leaflet-plugins](http://github.com/shramov/leaflet-plugins), it allows for the
analysis and parsing of a GPX track in order to display it as a Leaflet map
layer. As it parses the GPX data, it will record information about the recorded
track, including total time, moving time, total distance, elevation stats and
heart-rate.

GPX parsing will automatically handle pauses in the track with a default
tolerance interval of 15 seconds between points. You can configure this
interval by setting `max_point_interval`, in milliseconds, in the options
passed to the `GPX` constructor.

I've put together a complete example as a
[demo](http://mpetazzoni.github.io/leaflet-gpx/).

## License

`leaflet-gpx` is under the *BSD 2-clause license*. Please refer to the
attached LICENSE file and/or to the copyright header in gpx.js for more
information.

## Usage

Usage is very simple. First, include the Leaflet.js and Leaflet-GPX
scripts in your HTML page:

```html
<html>
  <head>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/leaflet.css" />
    <!-- ... -->
  </head>
  <body>
    <!-- ... -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/leaflet.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/1.7.0/gpx.min.js"></script>
  </body>
</html>
```

Now, let's consider we have a Leaflet map:

```javascript
var map = L.map('map');
L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: 'Map data &copy; <a href="http://www.osm.org">OpenStreetMap</a>'
}).addTo(map);
```

Displaying a GPX track on it is as easy as:

```javascript
var gpx = '...'; // URL to your GPX file or the GPX itself
new L.GPX(gpx, {async: true}).on('loaded', function(e) {
  map.fitBounds(e.target.getBounds());
}).addTo(map);
```

Some GPX tracks contain the actual route/track twice, both the `<trk>` and
`<rte>` elements are used. You can tell `leaflet-gpx` which tag to use or to
use both (which is the default setting for backwards compatibility) with the
`gpx_options` object in the second argument of the constructor. The member
`parseElements` controls this behavior, it should be an array that contains
`'route'` and/or `'track'`.

### Available functions

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
  hour
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
* `get_speed_data` and `get_speed_data_imp()`
* `get_heartrate_data()` and `get_heartrate_data_imp()`
* `get_cadence_data()` and `get_cadence_data_imp()`
* `get_temp_data()` and `get_temp_data_imp()`

These methods all return an array of points `[distance, value, tooltip]` where
the distance is either in kilometers or in miles and the elevation in meters or
feet, depending on whether you use the `_imp` variant or not. Heart rate,
obviously, doesn't change.

### Reloading

You can make `leaflet-gpx` reload the source GPX file by calling the
`reload()` method. For example, to trigger a reload every 5 seconds, you
can do:

```javascript
var gpx = new L.GPX(gpxFile);
setInterval(function() {
  gpx.reload();
}, 5000);
```

## About marker icons

By default `gpx.js` will use `pin-icon-start.png`, `pin-icon-end.png` and
`pin-shadow.png` as the marker icons URLs for, respectively, the start marker,
the end marker and their drop shadow. Since it might not be convenient that
these images have to reside under the same directory as your HTML page, it is
possible to override the marker icon URLs and sizes by passing a
`marker_options` object to the `GPX` options object.

The field names are the same as for custom Leaflet icons, as explained in the
[Markers with custom icons](http://leafletjs.com/examples/custom-icons.html)
page in Leaflet's documentation. The only difference is that instead of
`iconUrl` you should specify `startIconUrl` and `endIconUrl` for the start and
end markers, respectively.

Note that you do not need to override all the marker icon options as `gpx.js`
will use sensible defaults with sizes matching the provided icon images. Here
is how you would override the URL of the provided icons if you decided to place
them in an `images/` directory:

```javascript
var url = '...'; // URL to your GPX file
new L.GPX(url, {
  async: true,
  marker_options: {
    startIconUrl: 'images/pin-icon-start.png',
    endIconUrl: 'images/pin-icon-end.png',
    shadowUrl: 'images/pin-shadow.png'
  }
}).on('loaded', function(e) {
  map.fitBounds(e.target.getBounds());
}).addTo(map);
```

## About waypoints

By default `gpx.js` will parse Waypoints from a GPX file. This may also
be steered via the value `waypoint` in `gpx_options`, e.g.
`parseElements: ['track', 'route', 'waypoint']`.

Waypoint icons: by default the `pin-icon-wpt.png` icon is shown for each
waypoint. This can be overridden by setting `marker_options.wptIconUrls`
in the `L.GPX` constructor options, as a mapping from the waypoint "SYM"
name to a user-supplied icon file or URL. The empty string `''` is used
by the waypoint tag does not define a "SYM" name. See the example below:

```javascript
new L.GPX(app.params.gpx_url, {
  async: true,
  marker_options: {
    wptIconUrls: {
      '': 'img/gpx/default-waypoint.png',
      'Geocache Found': 'img/gpx/geocache.png',
      'Park': 'img/gpx/tree.png'
    },
    ...
    shadowUrl: 'http://github.com/mpetazzoni/leaflet-gpx/raw/master/pin-shadow.png'
  }
}).on('loaded', function (e) {
  var gpx = e.target;
  map.fitBounds(gpx.getBounds());
}).addTo(map);
```

## Custom markers

You can also use your own icons/markers if you want to use custom
markers, for example from `leaflet-awesome-markers`. To specify you own
markers, set `startIcon`, `endIcon`, and a map of `wptIcons` by waypoint
symbol (see above). Those should be marker icon objects usable by
Leaflet as the `icon` property of a `L.Marker` object.

```javascript
new L.GPX(app.params.gpx_url, {
  async: true,
  marker_options: {
    wptIcons: {
      'Coffee shop': new L.AwesomeMarkers.icon({
        icon: 'coffee',
        prefix: 'fa',
        markerColor: 'blue',
        iconColor: 'white'
      })
    }
  }
}).on('loaded', function (e) {
  var gpx = e.target;
  map.fitBounds(gpx.getBounds());
}).addTo(map);
```

## Named points

GPX points can be named, for example to denote certain POIs (points of
interest). You can setup rules to match point names to create labeled
markers for those points by providing a `pointMatchers` array in the
`marker_options`. Each element in this array must define a `regex` to
match the point's name and an `icon` object (any `L.Marker` or
for example an `L.AwesomeMarkers.icon` as shown above in _Custom
markers_).

Each named point in the GPX track is evaluated against those rules and
a marker is created with the point's name as label from the first
matching rule. This also applies to named waypoints, but keep in mind
that waypoint icons rules take precedence over point matchers.

```javascript
new L.GPX(app.params.gpx_url, {
  async: true,
  marker_options: {
    pointMatchers: [
      {
        regex: /Coffee/,
        icon: new L.AwesomeMarkers.icon({
          icon: 'coffee',
          markerColor: 'blue',
          iconColor: 'white'
        }),
      },
      {
        regex: /Home/,
        icon: new L.AwesomeMarkers.icon({
          icon: 'home',
          markerColor: 'green',
          iconColor: 'white'
        }),
      }
    ]
  }
}).on('loaded', function(e) {
  var gpx = e.target;
  map.fitToBounds(gpx.getBounds());
}).addTo(map);
```

## Events

Events are fired on the `L.GPX` object as the GPX data is being parsed
and the map layers generated. You can listen for those events by
attaching the corresponding event listener on the `L.GPX` object:

```javascript
new L.GPX(app.params.gpx_url, {
  // options
}).on('addpoint', function(e) {
  console.log('Added ' + e.point_type + ' point: ' + e.point);
}).on('loaded', function(e) {
  var gpx = e.target;
  map.fitToBounds(gpx.getBounds());
}).on('error', function(e) {
  console.log('Error loading file: ' + e.err);
}).addTo(map);
```

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

`error` events are fired when no layers of the type(s) specified in
`options.gpx_options.parseElements` can be parsed out of the given
file. For instance, `error` would be fired if a file with no waypoints
was attempted to be loaded with `parseElements` set to `['waypoint']`.
Each `error` event contains the following property:

- `err`: a message with details about the error that occurred.

## Line styling

`leaflet-gpx` understands the [GPX
Style](http://www.topografix.com/GPX/gpx_style/0/2) extension, and will
extract styling information defined on routes and track segments to use
for drawing the corresponding polyline.

```xml
<trkseg>
  <extensions>
    <line xmlns="http://www.topografix.com/GPX/gpx_style/0/2">
      <color>FF0000</color>
      <opacity>0.5</opacity>
      <weight>1</weight>
      <linecap>square</linecap>
      <linejoin>square</linejoin>
      <dasharray>0,10</dasharray>
      <dashoffset>3</dashoffset>
    </line>
  </extensions>
  <trkpt lat="..." lon="..."></trkpt>
</trkseg>
```

You can override the style of the lines by passing a `polyline_options`
object into the `options` argument of the `L.GPX` constructor:

```javascript
new L.GPX(url, {
  polyline_options: {
    color: 'green',
    opacity: 0.75,
    weight: 3,
    lineCap: 'round'
  }
}).on('loaded', function(e) {
  var gpx = e.target;
  map.fitToBounds(gpx.getBounds());
}).addTo(map);
```

For more information on the available polyline styling options, refer to
the [Leaflet documentation on
Polyline](https://leafletjs.com/reference-1.3.0.html#polyline). By
default, if no styling is available, the line will be drawn in _blue_.

## GPX parsing options

### Multiple track segments within each track

GPX file may contain multiple tracks represented by `<trk>` elements,
each track possibly composed of multiple segments with `<trkseg>`
elements. Although this plugin will always represent each GPX route and
each GPX track as distinct entities with their own start and end
markers, track segments will by default be joined into a single line.

You can disable this behavior by setting the `joinTrackSegments` flag to
`false` in the `gpx_options`:

```javascript
new L.GPX(url, {
  gpx_options: {
    joinTrackSegments: false
  }
}).on('loaded', function(e) {
  map.fitBounds(e.target.getBounds());
}).addTo(map);
```

## Caveats

* Distance calculation is relatively accurate, but elevation change
  calculation is not topographically adjusted, so the total elevation
  gain/loss/change might appear inaccurate in some situations.
* Currently doesn't seem to work in IE8/9. See #9 and #11 for
  discussion.
