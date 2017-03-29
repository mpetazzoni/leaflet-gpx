GPX plugin for Leaflet
======================

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
[demo](http://mpetazzoni.github.com/leaflet-gpx/).


License
-------

`leaflet-gpx` is under the *BSD 2-clause license*. Please refer to the
attached LICENSE file and/or to the copyright header in gpx.js for more
information.

Usage
-----

Usage is very simple. First, include the Leaflet.js and Leaflet-GPX
scripts in your HTML page:

```html
<html>
  <head>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.0.3/leaflet.css" />
    <!-- ... -->
  </head>
  <body>
    <!-- ... -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.0.3/leaflet.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/1.3.1/gpx.min.js"></script>
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

You can change the GPX track's appearance with a `polyline_options` object in
the second argument of the constructor. Available options are listed in the
[Leaflet documentation](http://leafletjs.com/reference.html#polyline).

Some GPX tracks contain the actual route/track twice, both the `<trk>` and
`<rte>` elements are used. You can tell `leaflet-gpx` which tag to use or to
use both (which is the default setting for backwards compatibility) with the
`gpx_options` object in the second argument of the constructor. The member
`parseElements` controls this behavior, it should be an array that contains
`'route'` and/or `'track'`.


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
* `get_average_hr()`: returns the average heart rate (if available)

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

The reason why these methods return milliseconds is that you have at your
disposal a nice helper method to format a duration in milliseconds into a cool
string like `3:07'48"` or `59'32.431`:

* `get_duration_string(duration, hidems)`, where `duration` is in
  milliseconds and `hidems` is an optional boolean you can use to request never
  to display millisecond precision.

You can also get full elevation and heartrate data with:

* `get_elevation_data()` and `get_elevation_data_imp()`
* `get_heartrate_data()` and `get_heartrate_data_imp()`

These methods all return an array of points `[distance, value, tooltip]` where
the distance is either in kilometers or in miles and the elevation in meters of
feet, depending on whether you use the `_imp` variant or not. Heart rate,
obviously, doesn't change.

You can reload remote gpx file every 5 seconds with:
```javascript
var gpxLayer = new L.GPX(gpxFile);

setInterval(function() {
	gpxLayer.reload();
},5000);
```


About marker icons
------------------

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

About waypoints
---------------

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

Custom markers
--------------

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

Caveats
-------

* Distance calculation is relatively accurate, but elevation change
  calculation is not topographically adjusted, so the total elevation
  gain/loss/change might appear inaccurate in some situations.
* Currently doesn't seem to work in IE8/9. See #9 and #11 for
  discussion.
