import { Map } from 'leaflet';
import { GPX } from '../../gpx.js';
import type { GPXOptions } from '../../gpx.js';

const map = new Map('map');
const options: GPXOptions = {
  async: true,
  polyline_options: { color: 'red' },
};

new GPX('track.gpx', options).on('loaded', e => {
  map.fitBounds(e.target.getBounds());
}).addTo(map);
