import { GPX } from '../../gpx.js';
import * as GPXModule from '../../gpx.js';
import type { GPXIconLike } from '../../gpx.js';
const gpx = new GPX('track.gpx');

// @ts-expect-error Only a string is supported, not an already-parsed Document.
new GPX(document);
// @ts-expect-error URL objects must be converted to strings by the caller.
new GPX(new URL('https://example.org/track.gpx'));
// @ts-expect-error Null is invalid input; omit it or use undefined for an empty layer.
new GPX(null);
// @ts-expect-error No default export in the ESM runtime.
GPXModule.default;
// @ts-expect-error async is boolean, not a string.
new GPX('', { async: 'yes' });
// @ts-expect-error Interval is milliseconds as a number.
new GPX('', { max_point_interval: '15s' });
// @ts-expect-error Use the documented category names, not XML tag names.
new GPX('', { gpx_options: { parseElements: ['trk'] } });
// @ts-expect-error joinTrackSegments must be boolean.
new GPX('', { gpx_options: { joinTrackSegments: 1 } });
// @ts-expect-error Unknown option (no arbitrary any-valued options index signature).
new GPX('', { maxPointInterval: 100 });
// @ts-expect-error Icons must be URLs or compatible renderers, not arbitrary objects.
new GPX('', { markers: { startIcon: { color: 'red' } } });
// @ts-expect-error Renderer must implement createIcon and supply anchor options.
const icon: GPXIconLike = { options: {} };
const minimalEndpointIcon: GPXIconLike = { options: {}, createIcon: () => document.createElement('div') };
// @ts-expect-error Standalone waypoints automatically open popups and need a popupAnchor.
new GPX('<gpx/>', { markers: { wptIcons: { Custom: minimalEndpointIcon } } });
// @ts-expect-error Type-based waypoint icons need the same required popup anchor.
new GPX('<gpx/>', { markers: { wptTypeIcons: { Custom: minimalEndpointIcon } } });
// @ts-expect-error Name rules can match waypoints too, so minimal endpoint-only renderers are unsafe.
new GPX('<gpx/>', { markers: { pointMatchers: [{ regex: /Custom/, icon: minimalEndpointIcon }] } });
// @ts-expect-error Regex matcher must be a RegExp.
new GPX('', { markers: { pointMatchers: [{ regex: 'Name', icon: 'pin.png' }] } });
// @ts-expect-error Null name-rule icons can create invalid track markers; use [] to disable rules.
new GPX('', { markers: { pointMatchers: [{ regex: /Name/, icon: null }] } });
// @ts-expect-error Null lookup containers throw during marker preparation; use {}.
new GPX('', { markers: { wptIcons: null } });
// @ts-expect-error Null lookup containers throw during marker preparation; use {}.
new GPX('', { markers: { wptTypeIcons: null } });
// @ts-expect-error Null matcher containers throw during marker preparation; use [].
new GPX('', { markers: { pointMatchers: null } });
// @ts-expect-error marker_options are Icon options, not general Marker options.
new GPX('', { marker_options: { draggable: true } });
// @ts-expect-error Polyline weight is a number, including per-track array options.
new GPX('', { polyline_options: [{ weight: 'wide' }] });
// @ts-expect-error Polyline line caps use Leaflet's supported literal values.
new GPX('', { polyline_options: { lineCap: 'triangle' } });
// @ts-expect-error Converters take numbers, not strings.
gpx.to_miles('1');
// @ts-expect-error Duration flag is boolean.
gpx.get_duration_string(1000, 'hide');
// @ts-expect-error reload() returns void, not a chainable GPX.
gpx.reload().addTo;
// @ts-expect-error Name can be null.
gpx.get_name().toUpperCase();
// @ts-expect-error Description can be undefined.
gpx.get_desc().toUpperCase();
// @ts-expect-error Start time can be null before loading or for waypoint-only files.
gpx.get_start_time().toISOString();
// @ts-expect-error Minimum elevation can be null.
gpx.get_elevation_min().toFixed();
gpx.get_elevation_data().forEach(p => {
  // @ts-expect-error Missing elevation is nullable even in chart tuples.
  p[1].toFixed();
  // @ts-expect-error Chart tooltip is a string.
  p[2].toFixed();
});
gpx.on('loaded', e => {
  // @ts-expect-error target is GPX, not any.
  e.target.notAGPXMethod();
  // @ts-expect-error Known event must not fall back to an any-valued Leaflet event.
  e.err;
  // @ts-expect-error loaded carries a Document, not the source line element.
  e.element.getAttribute('name');
});
gpx.on('error', e => {
  // @ts-expect-error Error message is a string, not an Error instance.
  e.err.message;
  // @ts-expect-error error does not carry parsed layers.
  e.layers;
});
gpx.once({ addline: e => {
  // @ts-expect-error Source line is an XML Element, not a Leaflet Polyline.
  e.element.getLatLngs();
  e.line.getLatLngs().forEach(p => {
    // @ts-expect-error Heart-rate measurements may be absent.
    p.meta.hr.toFixed();
    // @ts-expect-error Timestamp is a Date, not text.
    p.meta.time.toUpperCase();
    // @ts-expect-error No undocumented metadata field.
    p.meta.power;
  });
} });
gpx.off({ error: e => {
  // @ts-expect-error off event-map callbacks retain known event payloads too.
  e.point;
} });
gpx.on('addpoint', e => {
  // @ts-expect-error endpoint-only XML line is optional until point_type is narrowed.
  e.line.getAttribute('name');
  if (e.point_type === 'start' || e.point_type === 'end') {
    // @ts-expect-error Endpoint line is XML, not Leaflet Polyline.
    e.line.getLatLngs();
  }
  if (e.point_type === 'waypoint') {
    // @ts-expect-error Waypoint LatLngs do not carry GPX track metadata.
    e.point.getLatLng().meta;
  }
});
gpx.on('click', e => {
  // @ts-expect-error Inherited click retains Leaflet's known payload, not any.
  e.err;
});
// @ts-expect-error Internal parsing method is intentionally not declared as public API.
gpx._parse('', {}, true);
// @ts-expect-error Internal statistics are intentionally not declared as public API.
gpx._info;
// @ts-expect-error Known event names reject a callback for a different GPX event.
gpx.on('loaded', (e: import('../../gpx.js').GPXErrorEvent) => e.err);
// @ts-expect-error once retains the same typed listener overload.
gpx.once('error', (e: import('../../gpx.js').GPXLoadedEvent) => e.layers);
// @ts-expect-error off retains the same typed listener overload.
gpx.off('addline', (e: import('../../gpx.js').GPXAddPointEvent) => e.point);
