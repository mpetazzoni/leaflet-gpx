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
[demo](https://mpetazzoni.github.io/leaflet-gpx/). It starts with the sample
track: choose a local GPX file, load a GPX URL, or reset to the sample.
Local files are read in your browser, not uploaded. The page still requests
map tiles and scripts from external services; tile requests reveal the
viewed region, and this is not an offline map.
URL loading requires HTTPS on the HTTPS demo and a server allowing browser
cross-origin requests (CORS). Hover over a track to inspect its nearest
recorded sample; fields without usable telemetry are omitted, not invented.

Jump to [Usage](#usage), [local files and URLs](#loading-local-files-and-urls),
[marker icons](#about-marker-icons), [events](#events), or
[point hover](#hovering-over-track-points).

## Compatibility

**This `leaflet-gpx-2.x` branch targets Leaflet 1.x**, using the classic
UMD script that registers `L.GPX`, tested with `leaflet@1.9.4`.
As of November 2026, npm's `latest` is `leaflet-gpx@2.2.0`. This branch
includes **not yet published maintenance fixes**; validation and deferred
event behavior described below refer to this branch, not the npm release.
Install the branch for these fixes:

```bash
npm install leaflet@1.9.4 'github:mpetazzoni/leaflet-gpx#leaflet-gpx-2.x'
```

For the published release instead, use
`npm install leaflet@1.9.4 leaflet-gpx@2.2.0`.
GitHub branches and branch CDN URLs can change; pin a reviewed commit SHA
for reproducible builds. The [main branch README](https://github.com/mpetazzoni/leaflet-gpx/blob/main/README.md)
covers the unreleased Leaflet 2 ES module version. No npm `beta` dist-tag
exists for this plugin yet.

## License

`leaflet-gpx` is under the *BSD 2-clause license*. Please refer to the
attached LICENSE file and/or to the copyright header in gpx.js for more
information.

## Usage

Usage is very simple:

* Include the Leaflet stylesheet and script, and the leaflet-gpx script,
  in your HTML page;
* Create your Leaflet map, with your choice of base layer(s);
* Create the `L.GPX` layer to display your GPX track.

```html
<html>
  <head>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js" defer></script>
    <script src="https://cdn.jsdelivr.net/gh/mpetazzoni/leaflet-gpx@leaflet-gpx-2.x/gpx.js" defer></script>
    <style>
      #map { height: 500px; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <!-- ... -->
    <script type="module">
      const map = L.map('map');
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
      }).addTo(map);

      // URL to your GPX file or the GPX itself as a XML string.
      const url = 'https://mpetazzoni.github.io/leaflet-gpx/demo.gpx';
      const options = {
        async: true,
        polyline_options: { color: 'red' },
      };

      const gpx = new L.GPX(url, options).on('loaded', (e) => {
        map.fitBounds(e.target.getBounds());
      }).on('error', e => console.error(e.err)).addTo(map);
     </script>
  </body>
</html>
```

### Using a classic script

With the Leaflet and GPX scripts loaded first, ordinary JavaScript needs
no `import` or `await`. Run it after the map element exists:

```javascript
const map = L.map('map');
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

new L.GPX('https://mpetazzoni.github.io/leaflet-gpx/demo.gpx', { async: true })
  .on('loaded', e => map.fitBounds(e.target.getBounds()))
  .on('error', e => console.error(e.err))
  .addTo(map);
```

Later option snippets reuse `L`, `map`, and a GPX URL string `url` from
this setup. Provide any custom icon images referenced in the examples.

### Loading local files and URLs

The constructor accepts GPX XML text or a URL string, **not a `File`**.
For a local file, read its contents with `File.text()` and pass the XML:
this does not upload the file. Use a file input, not its `value` (which
is only a browser placeholder path). Add
`<input id="gpx-file" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml">`
to the page, then use the existing map and scripts from above:

```javascript
function showGPX(input) {
  return new L.GPX(input, { async: true })
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

// URL loads are asynchronous and report HTTP, CORS, and parsing failures.
showGPX('https://mpetazzoni.github.io/leaflet-gpx/demo.gpx');
```

These minimal snippets add layers; remove a previous layer with
`map.removeLayer(track)` when implementing replacement/reset controls.
The demo replaces the displayed track and can reset to its bundled sample.
The file input's `accept` is only a picker hint, not validation. The XML
check prevents non-XML local contents from being mistaken for a URL.
The `addpoint` hook replaces standalone waypoint popups before they reach
the map: the plugin's built-in popup concatenates name/description as HTML,
so do not use that default for untrusted files or URLs. Render GPX text
with `textContent`, not `innerHTML`. This is not a full XML/security sandbox.
External URL hosts must allow your page's origin with CORS headers; a link
working in a browser tab does not guarantee request access. Use HTTPS URLs
on HTTPS pages to avoid mixed-content blocking. Serve your own page over
HTTP(S), not `file://`; no proxy or upload service is needed for local files.

For maintainers, `npm test` also syntax-checks every JavaScript example
(including inline HTML scripts) and exercises the local-file popup/privacy
behavior against Leaflet 1.

## Input validation

Pass GPX XML or a URL as a primitive string. Leading/trailing whitespace and a
leading BOM are ignored. A string beginning with `<` is parsed as XML; other
nonempty single-line strings are treated as URLs, including relative paths,
extensionless endpoints, and URLs with queries. Control characters, XML angle
brackets in URLs, and PGP armor headers are rejected before any request.
Encode such characters when they are part of an actual URL. A single-line
filename or text string is inherently ambiguous, so it remains a URL for
backward compatibility; fetched contents are validated regardless of extension.

The document must have a `<gpx>` root. GPX 1.0 and 1.1 are accepted, as are
files omitting version or namespace; this is not full schema validation.
Parsed track, route and waypoint coordinates must be finite numbers within
latitude -90..90 and longitude -180..180. Invalid input, XML, coordinates,
unsupported versions, loading failures and parsing exceptions produce an
`error` event with an `err` message rather than an uncaught exception.
Omitting the input creates an empty layer. Inline XML still parses synchronously
unless `async: true`; `loaded` and `error` are always deferred.

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
const gpx = new L.GPX(url).on('error', e => console.error(e.err));
setInterval(function() {
  gpx.reload();
}, 5000);
```

## About marker icons

### Configuring markers

By default, `leaflet-gpx` uses Leaflet's default icon image for all
markers. You can override this behavior by providing a Leaflet `Icon`
object, or the path or URL to an image to use as the marker, for any of
the markers supported by this plugin as part of the `markers` parameter:

```javascript
new L.GPX(url, {
  async: true,
  markers: {
    startIcon: new L.Icon.Default(),
    endIcon: new L.Icon.Default(),
    wptIcons: { '': new L.Icon.Default() },
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

Set `startIcon` or `endIcon` to `null` to disable that pin. A `null`
entry inside `wptIcons` or `wptTypeIcons` is not selected, but later
matching/fallback rules may still produce a marker. Use empty lookup tables
(`wptIcons: {}`, `wptTypeIcons: {}`) and `pointMatchers: []` to suppress
all standalone waypoints. Do not set the lookup tables or matcher array
themselves to `null`: the current setup code expects objects/arrays.
Matcher rules require a non-null icon because a matching track/route point
still creates a marker. When the matcher array is nonempty, the empty-key
fallback is not consulted; see the icon-retention caveat under
[About waypoints](#about-waypoints) before relying on matchers as a filter.

Here is how you would override the URL of the provided icons for start
and end markers, but none of the other types of markers:

```javascript
new L.GPX(url, {
  async: true,
  markers: {
    startIcon: 'images/pin-icon-start.png',
    endIcon: 'images/pin-icon-end.png',
  }
}).on('loaded', function(e) {
  map.fitBounds(e.target.getBounds());
}).addTo(map);
```

It is usually preferable and more flexible to provide a Leaflet `L.Icon`
instance directly. See
<https://leafletjs.com/examples/custom-icons/> for more information.

```javascript
new L.GPX(url, {
  async: true,
  markers: {
    wptIcons: {
      'Coffee shop': new L.Icon({
        iconUrl: 'images/coffee.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      })
    }
  }
}).on('loaded', function (e) {
  map.fitBounds(e.target.getBounds());
}).addTo(map);
```

### Marker options

`marker_options` configures Leaflet `L.Icon` instances created from image
URL strings, not existing icon objects or general `Marker` options.
The default URL-icon size is `[33, 45]` and anchor is `[16, 45]` pixels.
Provide an image URL for these options to take effect:

```javascript
new L.GPX(url, {
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

The legacy `marker_options.clickable` flag defaults to `false` and is
forwarded to generated markers. Leaflet 1.9 uses `interactive` instead;
do not rely on `clickable` to disable pointer events. General marker
options are not forwarded through `marker_options`; use Leaflet's marker
API in an `addpoint` listener instead.

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

**Current limitation:** the parser can retain an earlier waypoint's selected
icon for a later unmatched waypoint. Do not rely on matcher rules to exclude
individual waypoints; filter those waypoints out of the XML before parsing.

```javascript
new L.GPX(url, {
  async: true,
  markers: {
    wptIcons: {
      '': new L.Icon.Default(),
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
name and an `icon` definition (a `L.Icon` or subclass object, or the URL
to an icon image).

Each named point in the GPX track is evaluated against those rules and
a marker is created with the point's name as label from the first
matching rule. This also applies to named waypoints, but keep in mind
that waypoint icons rules take precedence over point matchers.

```javascript
new L.GPX(url, {
  async: true,
  markers: {
    pointMatchers: [
      {
        regex: /Coffee/,
        icon: new L.Icon({
          iconUrl: 'images/coffee.png',
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        }),
      },
      {
        regex: /Home/,
        icon: new L.Icon({
          iconUrl: 'images/home.png',
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        }),
      }
    ]
  }
}).on('loaded', function(e) {
  map.fitBounds(e.target.getBounds());
}).addTo(map);
```

## Events

Events are fired on the `L.GPX` object as the GPX data is being parsed
and the map layers generated. You can listen for those events by
attaching the corresponding event listener on the `L.GPX` object:

```javascript
new L.GPX(url, {
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

Note that `loaded` and `error` are always delivered after the `L.GPX`
constructor returns, so attaching their listeners right after creating
the layer always works, with or without `async: true`. The `addpoint`
and `addline` events, however, fire while the GPX data is being parsed:
pass `async: true` if you need to catch those.

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

`error` events are fired when the file cannot be loaded or parsed, and
when no layers of the type(s) specified in `options.gpx_options.parseElements`
can be parsed out of it. For instance, `error` would be fired for a file
that isn't valid XML, or for a file with no waypoints when `parseElements`
is set to `['waypoint']`.
Each `error` event contains the following property:

- `err`: a message with details about the error that occurred.

## Hovering over track points

`addline` fires for each generated route/track polyline, with `line` (the Leaflet `Polyline`) and `element` (its source XML element). `line.getLatLngs()` already gives you the parsed points, including their `point.meta` objects: Leaflet preserves these `LatLng` instances. No custom copy of `coords`, invisible marker for every sample, or event for every track point is needed. `addpoint` is only about generated markers, not every recorded sample. Use `async: true` to attach `addline` before parsing starts, including with inline XML.

The example below is complete JavaScript for a page with a `#map` element and Leaflet's stylesheet and the classic Leaflet/leaflet-gpx scripts (see Usage above). It selects the **nearest recorded sample in projected screen pixels**, not the closest latitude/longitude or an interpolated point on a segment. `closestLayerPoint()` returns a position on the rendered line, not a recorded sample with metadata. At crossings or with sparse recordings, the nearest sample can belong to a different part of the route than you expect.

```javascript
function addPointHover(map, line) {
  const points = line.getLatLngs(); // GPX lines have a flat array of LatLngs.
  const content = document.createElement('div');
  const tooltip = L.tooltip({ direction: 'center', offset: [0, 0], opacity: 1 });
  let pixels = [], cachedZoom, pending, frame, previous;

  function hide() {
    cancelAnimationFrame(frame);
    frame = pending = previous = undefined;
    tooltip.remove();
  }

  function render() {
    frame = undefined;
    const event = pending;
    pending = undefined;
    const zoom = map.getZoom();
    if (zoom !== cachedZoom) {
      // World pixels: panning translates every point equally, so only zoom
      // invalidates this cache. Keep metadata on the original points.
      pixels = points.map(point => map.project(point, zoom));
      cachedZoom = zoom;
    }
    const pointer = map.project(event.latlng, zoom);
    let nearest, distance = Infinity;
    for (let i = 0; i < pixels.length; i++) {
      const dx = pixels[i].x - pointer.x, dy = pixels[i].y - pointer.y;
      const squared = dx * dx + dy * dy;
      if (squared < distance) {
        distance = squared;
        nearest = points[i];
      }
    }
    if (!nearest) return hide();

    if (nearest !== previous) {
      content.replaceChildren();
      const meta = nearest.meta || {};
      function row(label, value) {
        const div = document.createElement('div');
        div.textContent = label + ': ' + value; // Never render GPX data as HTML.
        content.appendChild(div);
      }
      // Missing <time> currently gets this synthetic LOCAL epoch timestamp.
      const time = meta.time instanceof Date ? meta.time.getTime() : NaN;
      if (Number.isFinite(time) && time !== new Date('1970-01-01T00:00:00').getTime()) {
        row('Time', meta.time.toISOString());
      }
      if (Number.isFinite(meta.ele)) row('Elevation', meta.ele.toFixed(1) + ' m');
      if (Number.isFinite(meta.speed) && meta.speed >= 0 && Number.isFinite(meta.speed * 3.6)) {
        row('Speed', (meta.speed * 3.6).toFixed(1) + ' km/h');
      }
      if (Number.isFinite(meta.hr) && meta.hr >= 0) row('Heart rate', meta.hr + ' bpm');
      if (Number.isFinite(meta.cad) && meta.cad >= 0) row('Cadence', meta.cad + ' rpm');
      if (Number.isFinite(meta.atemp)) row('Ambient temperature', meta.atemp + ' °C');
      if (!content.childNodes.length) row('Point', 'No recorded data');
      tooltip.setContent(content);
      previous = nearest;
    }
    tooltip.setLatLng(event.latlng);
    if (!map.hasLayer(tooltip)) tooltip.addTo(map);

    // Leaflet doesn't clamp tooltips. Measure the rendered box, constrain its
    // size, then place it inside BOTH the map and the visible browser viewport.
    const container = map.getContainer(), bounds = container.getBoundingClientRect();
    const left = Math.max(bounds.left, 0) + 8;
    const right = Math.min(bounds.right, document.documentElement.clientWidth) - 8;
    const top = Math.max(bounds.top, 0) + 8;
    const bottom = Math.min(bounds.bottom, window.innerHeight) - 8;
    if (right <= left || bottom <= top) return hide();
    const scaleX = bounds.width / container.offsetWidth;
    const scaleY = bounds.height / container.offsetHeight;
    const element = tooltip.getElement();
    Object.assign(element.style, {
      boxSizing: 'border-box', width: 'max-content', whiteSpace: 'normal',
      overflowWrap: 'anywhere', overflow: 'auto',
      maxWidth: (right - left) / scaleX + 'px',
      maxHeight: (bottom - top) / scaleY + 'px'
    });
    const box = element.getBoundingClientRect();
    const p = map.latLngToContainerPoint(event.latlng);
    const x = bounds.left + (p.x + container.clientLeft) * scaleX;
    const y = bounds.top + (p.y + container.clientTop) * scaleY;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    // Prefer above the pointer, flip below near the top, and clamp at edges.
    const boxLeft = clamp(x - box.width / 2, left, right - box.width);
    const boxTop = clamp(y - box.height - 12 >= top ? y - box.height - 12 : y + 12,
      top, bottom - box.height);
    tooltip.setLatLng(map.containerPointToLatLng([
      (boxLeft + box.width / 2 - bounds.left) / scaleX - container.clientLeft,
      (boxTop + box.height / 2 - bounds.top) / scaleY - container.clientTop
    ])); // The box follows the pointer; its content still describes the sample.
  }

  line.on('mousemove', event => {
    pending = event;
    if (frame === undefined) frame = requestAnimationFrame(render);
  });
  line.on('mouseout', hide);
  line.on('add', () => map.on('movestart', hide));
  line.on('remove', () => {
    hide();
    map.off('movestart', hide); // Also clean up when GPX.reload() removes lines.
  });
}

const map = L.map('map');
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);
new L.GPX('https://mpetazzoni.github.io/leaflet-gpx/demo.gpx', { async: true })
  .on('addline', event => addPointHover(map, event.line))
  .on('loaded', event => map.fitBounds(event.target.getBounds()))
  .addTo(map);
```

Leaflet 1 uses `mousemove`/`mouseout`; with Leaflet 2 and the unreleased main branch, use `pointermove`/`pointerout` and import the `Map`, `TileLayer`, `Tooltip`, and `GPX` classes instead of using `L`. This is a pointer-hover example, not a touch or keyboard sample picker.

Metadata keys are `time` (`Date`), `ele` (meters), `speed` (meters/second), `hr` (bpm), `cad` (rpm), and `atemp` (°C). Missing sensor values are `null`; malformed numeric values can be `NaN`, so check `Number.isFinite` without coercing `null` to zero. Zero and negative temperatures/elevations are legitimate values. Elevation can be carried forward from the preceding sample; speed is calculated from distance/time when absent (and can be a synthetic zero without timing). These values are parsed/derived data, not proof that the device measured them. Invalid dates are omitted above. The epoch check also hides a genuine recording at that exact local epoch: metadata alone does not distinguish it from a missing timestamp. If you need exact provenance, inspect the source track/route point XML in `addline.element` rather than presenting a synthetic date as a recording time.

There is one hover listener and one exit listener per polyline, with at most one nearest-sample scan per animation frame and one projection pass per zoom. Panning needs no reprojection in world-pixel coordinates. The scan is still O(n); for very large tracks, build a spatial index over the projected samples per zoom. If your application edits a line's coordinates or changes the CRS, rebuild the cache (and reread `getLatLngs()`). The live demo uses the same approach.

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
array into the `options` argument of the `L.GPX` constructor. Routes and
tracks are indexed independently from zero, in document order within
each category: entry zero applies to both the first route and first track.
All segments of a track share its entry; missing entries retain XML/default
styling.

```javascript
new L.GPX(url, {
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
new L.GPX(url, {
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
* Use a modern browser. IE is unsupported; the local-file example also
  requires `File.text()`.
