import { DefaultIcon, Map } from 'leaflet';
import { GPX } from '../../gpx.js';
import type { GPXLoadedEvent, GPXOptions } from '../../gpx.js';

const map = new Map('map');
const options = {
  async: true, // Needed to catch addline/addpoint when the input is inline XML.
  markers: {
    startIcon: null, // Disable the start pin.
    endIcon: new DefaultIcon({ color: 'crimson' }),
    wptIcons: {}, // Empty tables and matchers suppress standalone waypoints.
    wptTypeIcons: {},
    pointMatchers: [],
  },
  gpx_options: { parseElements: ['track'], joinTrackSegments: false },
  polyline_options: [{ color: 'red', weight: 3 }],
} satisfies GPXOptions;

const onLoaded = (event: GPXLoadedEvent) => {
  map.fitBounds(event.target.getBounds()); // target is GPX, not an untyped Evented.
  const name = event.target.get_name() ?? 'Unnamed track';
  const start = event.target.get_start_time(); // Date | null
  console.log(name, start?.toISOString(), event.target.get_distance()); // meters
};

const track = new GPX('track.gpx', options)
  .on('loaded', onLoaded)
  .on('addline', event => {
    event.line.getLatLngs().forEach(point => {
      console.log(point.meta.time, point.meta.ele); // Date; meters | null
      console.log(point.meta.hr); // beats/minute | null
    });
  })
  .on('addpoint', event => {
    if (event.point_type === 'start' || event.point_type === 'end') {
      console.log(event.line.localName); // Source XML Element, not a Polyline.
    }
  })
  .once('error', event => console.error(event.err)) // err is a string.
  .addTo(map);

// During teardown, after loading: standard listener/context overloads work.
// track.off('loaded', onLoaded);
