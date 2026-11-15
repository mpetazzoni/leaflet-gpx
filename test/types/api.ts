import { DefaultIcon, DivIcon, FeatureGroup, Icon, LatLng, Map, Marker, Point, Polyline, SVG } from 'leaflet';
import { GPX } from '../../gpx.js';
import type {
  GPXDataPoint, GPXIconLike, GPXLatLng, GPXOptions, GPXPointMetadata, GPXPolyline, GPXWaypointIconLike,
} from '../../gpx.js';

// Exact return types, not merely assignability (which would fail to detect any).
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type NumberMethods = {
  to_miles: [number]; to_ft: [number]; m_to_km: [number]; m_to_mi: [number];
  ms_to_kmh: [number]; ms_to_mih: [number];
  get_distance: []; get_distance_imp: [];
  get_moving_time: []; get_total_time: [];
  get_moving_pace: []; get_moving_pace_imp: [];
  get_moving_speed: []; get_moving_speed_imp: [];
  get_total_speed: []; get_total_speed_imp: [];
  get_elevation_gain: []; get_elevation_loss: [];
  get_elevation_gain_imp: []; get_elevation_loss_imp: [];
  get_elevation_max: []; get_elevation_max_imp: []; get_elevation_min_imp: [];
  get_speed_max: []; get_speed_max_imp: [];
  get_average_hr: []; get_average_temp: []; get_average_cadence: [];
};
type OtherMethods = {
  get_duration_string: [args: [number, boolean?], result: string];
  get_duration_string_iso: [args: [number, boolean?], result: string];
  get_name: [args: [], result: string | null];
  get_desc: [args: [], result: string | undefined];
  get_author: [args: [], result: string | undefined];
  get_copyright: [args: [], result: string | undefined];
  get_start_time: [args: [], result: Date | null];
  get_end_time: [args: [], result: Date | null];
  get_elevation_min: [args: [], result: number | null];
  get_elevation_data: [args: [], result: GPXDataPoint<number | null>[]];
  get_elevation_data_imp: [args: [], result: GPXDataPoint<number | null>[]];
  get_speed_data: [args: [], result: GPXDataPoint[]];
  get_speed_data_imp: [args: [], result: GPXDataPoint[]];
  get_heartrate_data: [args: [], result: GPXDataPoint[]];
  get_heartrate_data_imp: [args: [], result: GPXDataPoint[]];
  get_cadence_data: [args: [], result: GPXDataPoint[]];
  get_cadence_data_imp: [args: [], result: GPXDataPoint[]];
  get_temp_data: [args: [], result: GPXDataPoint[]];
  get_temp_data_imp: [args: [], result: GPXDataPoint[]];
  reload: [args: [], result: void];
};
type NumericResults = Assert<Equal<{
  [K in keyof NumberMethods]: GPX[K];
}, { [K in keyof NumberMethods]: (...args: NumberMethods[K]) => number }>>;
type OtherResults = Assert<Equal<{
  [K in keyof OtherMethods]: GPX[K];
}, { [K in keyof OtherMethods]: (...args: OtherMethods[K][0]) => OtherMethods[K][1] }>>;

const customIcon: GPXWaypointIconLike = {
  options: { popupAnchor: [0, -20] },
  createIcon: old => old ?? document.createElement('div'),
  createShadow: () => null,
  _getTooltipAnchor: () => [0, -10],
};
const options = {
  async: true,
  max_point_interval: 15000,
  pane: 'overlayPane', attribution: 'GPX data',
  interactive: true, bubblingPointerEvents: true,
  markers: {
    startIcon: null,
    endIcon: new DefaultIcon({ color: 'crimson' }),
    wptIcons: { '': null, Cafe: new DivIcon({ html: 'Cafe' }), Home: 'home.png' },
    wptTypeIcons: { Hotel: new Icon({ iconUrl: 'hotel.png' }), Custom: customIcon },
    pointMatchers: [{ regex: /Summit/, icon: customIcon }],
  },
  marker_options: {
    iconUrl: 'ignored-overridden.png', iconRetinaUrl: 'retina.png',
    iconSize: [33, 45], iconAnchor: [16, 45], popupAnchor: [0, -45], tooltipAnchor: [1, -20],
    shadowUrl: 'shadow.png', shadowRetinaUrl: 'shadow@2x.png',
    shadowSize: 40, shadowAnchor: null, className: 'gpx-icon', crossOrigin: 'anonymous',
    clickable: false,
  },
  polyline_options: [
    { color: 'red', opacity: 0.7, weight: 3, lineCap: 'square', lineJoin: 'bevel',
      dashArray: [5, 10], dashOffset: '2', smoothFactor: 0, noClip: true,
      renderer: new SVG(), fill: false, fillColor: null, fillOpacity: 0, fillRule: 'evenodd',
      stroke: true, className: 'track', pane: 'overlayPane', interactive: false },
    { color: 'blue' },
  ],
  gpx_options: { parseElements: ['route', 'track', 'waypoint'], joinTrackSegments: false },
} satisfies GPXOptions;
const map = new Map('map');
const gpx = new GPX('track.gpx', options).addTo(map);
const inherited: FeatureGroup = gpx;
gpx.addLayer(new Marker([0, 0])).addLayer(new Polyline([[0, 0], [1, 1]]));
gpx.bindPopup('Track').bindTooltip('Track').setStyle({ color: 'green' });
gpx.eachLayer(layer => layer.bindPopup('Layer'));
gpx.getLayers().forEach(layer => layer.remove());
map.fitBounds(gpx.getBounds());
new GPX('<gpx/>', { polyline_options: { color: 'blue' } });
new GPX('<gpx><wpt lat="0" lon="0"/></gpx>', { markers: { endIcon: null, wptIcons: {}, wptTypeIcons: {}, pointMatchers: [] } }).on('error', e => e.err);
new GPX('<gpx/>', { marker_options: { iconSize: null, iconAnchor: new Point(1, 2) } });
new GPX(); // An empty layer is supported without starting a load.
new GPX(undefined, undefined);
new GPX('<gpx><wpt lat="0" lon="0"/></gpx>', undefined);
new GPX('<gpx><wpt lat="0" lon="0"/></gpx>', {
  markers: { wptIcons: undefined, wptTypeIcons: undefined, pointMatchers: undefined },
  gpx_options: { parseElements: undefined },
});
const minimalEndpointIcon: GPXIconLike = { options: {}, createIcon: () => document.createElement('div') };
new GPX('<gpx><wpt lat="0" lon="0"/></gpx>', {
  markers: { startIcon: minimalEndpointIcon, endIcon: minimalEndpointIcon,
    wptIcons: { Custom: customIcon }, wptTypeIcons: { Custom: customIcon },
    pointMatchers: [{ regex: /Custom/, icon: customIcon }] },
});

const name = gpx.get_name();
if (name !== null) name.toUpperCase();
gpx.get_desc()?.toUpperCase();
gpx.get_author()?.toUpperCase();
gpx.get_copyright()?.toUpperCase();
gpx.get_start_time()?.toISOString();
gpx.get_end_time()?.toISOString();
gpx.get_duration_string(1000);
gpx.get_duration_string_iso(1000, true);
gpx.get_elevation_data().forEach(([distance, elevation, tooltip]) => {
  distance.toFixed(); elevation?.toFixed(); tooltip.toUpperCase();
});
const measurements: GPXPointMetadata = { time: new Date(), ele: null, hr: null, cad: null, atemp: null, speed: 0 };
const ll: GPXLatLng = Object.assign(new LatLng(1, 2), { meta: measurements });
const line: GPXPolyline = Object.assign(new Polyline([ll]), { getLatLngs: () => [ll] });
const original: LatLng = line.getLatLngs()[0]!;
const tuple: GPXDataPoint<number | null> = [1, null, '?'];
