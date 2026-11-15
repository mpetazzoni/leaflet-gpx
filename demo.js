import { Map, TileLayer, LayersControl } from 'leaflet';
import { GPX } from 'leaflet-gpx';
import { addPointHover } from './point-hover.js';

const demo = document.getElementById('demo');
const field = name => demo.querySelector('.' + name);
const title = demo.querySelector('h3');
const fileInput = document.getElementById('gpx-file');
const urlInput = document.getElementById('gpx-url');
const map = new Map(demo.dataset.mapTarget).setView([0, 0], 2);
new TileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank">Humanitarian OpenStreetMap Team</a> hosted by <a href="https://openstreetmap.fr/" target="_blank">OpenStreetMap France</a>'
}).addTo(map);
const control = new LayersControl(null, null).addTo(map);
const summaries = ['distance', 'duration', 'pace', 'avghr', 'elevation-gain', 'elevation-loss', 'elevation-net'];
let generation = 0, transport, active, hoverCleanups = [];

function clearTrack() {
  if (active) {
    control.removeLayer(active);
    active.remove();
    active.off();
    active.clearLayers();
    active = undefined;
  }
  hoverCleanups.forEach(cleanup => cleanup());
  hoverCleanups = [];
}

function begin(label) {
  const token = ++generation;
  transport?.abort();
  transport = undefined;
  clearTrack();
  title.textContent = label;
  field('start').textContent = 'Start time: —';
  summaries.forEach(name => { field(name).textContent = '—'; });
  field('status').textContent = 'Loading ' + label + '…';
  return token;
}

function fail(token, error, remote) {
  if (token !== generation) return;
  clearTrack();
  field('status').textContent = 'Unable to load GPX: ' + error.message +
    (remote ? ' Check the URL and server CORS permissions. HTTPS pages require HTTPS URLs.' : ' Choose a valid GPX file.');
}

const elements = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));
function recordedTime(point) {
  const text = elements(point, 'time')[0]?.textContent.trim();
  return text && Number.isFinite(Date.parse(text)) ? new Date(text) : null;
}
function recordedNumber(point, tag) {
  const text = elements(point, tag)[0]?.textContent.trim();
  return text && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) &&
    Number.isFinite(Number(text)) ? Number(text) : null;
}

function recordedCount(point, tag) {
  const number = recordedNumber(point, tag);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function summarize(gpx, xml) {
  const points = [...elements(xml, 'rtept'), ...elements(xml, 'trkpt')];
  const start = points.length ? recordedTime(points[0]) : null;
  field('start').textContent = start ? start.toDateString() + ', ' + start.toLocaleTimeString() : 'Start time: —';
  const timed = points.length > 1 && points.every(point => recordedTime(point));
  const elevated = points.length > 1 && points.every(point => recordedNumber(point, 'ele') !== null);
  function value(name, number, available, format) {
    field(name).textContent = available && Number.isFinite(number) ? format(number) : '—';
  }
  const distance = gpx.get_distance_imp(), moving = gpx.get_moving_time();
  value('distance', distance, points.length > 1, n => n.toFixed(2));
  value('duration', moving, timed && moving >= 0, n => gpx.get_duration_string(n));
  value('pace', gpx.get_moving_pace_imp(), timed && moving > 0 && distance > 0, n => gpx.get_duration_string(n, true));
  const heartRates = points.map(point => recordedCount(point, 'hr')).filter(number => number !== null);
  const averageHR = heartRates.reduce((total, number) => total + number, 0) / heartRates.length;
  value('avghr', averageHR, heartRates.length > 0, n => String(Math.round(n)));
  value('elevation-gain', gpx.get_elevation_gain_imp(), elevated, n => n.toFixed(0));
  value('elevation-loss', gpx.get_elevation_loss_imp(), elevated, n => n.toFixed(0));
  value('elevation-net', gpx.to_ft(gpx.get_elevation_gain() - gpx.get_elevation_loss()), elevated, n => n.toFixed(0));
}

function loadXML(xml, token, label, url) {
  if (token !== generation) return;
  // Validate before passing local text to GPX: non-XML must NEVER become a URL.
  const document = new DOMParser().parseFromString(xml.trim(), 'text/xml');
  if (elements(document, 'parsererror').length || document.documentElement?.localName !== 'gpx') {
    throw new Error('Invalid GPX XML (expected a <gpx> document).');
  }
  const gpx = active = new GPX(xml, { async: true });
  gpx.on('addline', event => {
    if (token !== generation) return;
    const points = elements(event.element, 'trkpt').length ? elements(event.element, 'trkpt') : elements(event.element, 'rtept');
    // The runtime fills missing time/elevation/speed. The viewer only presents
    // recorded telemetry, or speed derived from two genuine timestamps.
    const coordinates = event.line.getLatLngs();
    coordinates.forEach((point, i) => {
      point.meta.time = recordedTime(points[i]);
      point.meta.ele = recordedNumber(points[i], 'ele');
      point.meta.hr = recordedCount(points[i], 'hr');
      point.meta.cad = recordedCount(points[i], 'cad');
      point.meta.atemp = recordedNumber(points[i], 'atemp');
      const speed = recordedNumber(points[i], 'speed');
      point.meta.speed = speed !== null && speed >= 0 ? speed : null;
      const previous = coordinates[i - 1];
      if (point.meta.speed === null && point.meta.time && previous?.meta.time && point.meta.time > previous.meta.time) {
        const seconds = (point.meta.time - previous.meta.time) / 1000;
        const vertical = point.meta.ele !== null && previous.meta.ele !== null ?
          point.meta.ele - previous.meta.ele : 0;
        const derived = Math.hypot(point.distanceTo(previous), vertical) / seconds;
        point.meta.speed = Number.isFinite(derived) ? derived : null;
      }
    });
    hoverCleanups.push(addPointHover(map, event.line));
  });
  gpx.on('addpoint', event => {
    if (token !== generation || event.point_type !== 'waypoint') return;
    // Runtime waypoint popups use HTML strings. Replace them with safe DOM
    // content before these markers ever enter the map.
    const content = window.document.createElement('div');
    for (const tag of ['name', 'desc']) {
      const row = window.document.createElement('div');
      row.textContent = elements(event.element, tag)[0]?.textContent || '';
      content.appendChild(row);
    }
    event.point.bindPopup(content);
  });
  gpx.on('error', event => fail(token, new Error(event.err), Boolean(url)));
  gpx.on('loaded', event => {
    if (token !== generation) return;
    const name = gpx.get_name() || label;
    title.textContent = name;
    if (url) {
      const link = window.document.createElement('a');
      link.href = url;
      link.textContent = name;
      title.replaceChildren(link);
    }
    // LayersControl accepts HTML labels, so escape the untrusted GPX name.
    const escaped = name.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    control.addOverlay(gpx, escaped);
    gpx.addTo(map);
    const bounds = gpx.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { maxZoom: 16 });
    summarize(gpx, event.element);
    field('status').textContent = 'Loaded ' + name + (url ? '.' : '. Local file stayed in your browser.');
  });
}

async function loadURL(input, label = input) {
  const token = begin(label);
  try {
    const text = input.trim();
    if (!text || /[\u0000-\u0020\u007f<>]/.test(text)) throw new Error('Enter a relative or HTTP/HTTPS URL without spaces or control characters.');
    const url = new URL(text, document.baseURI);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only relative or HTTP/HTTPS URLs without credentials are supported.');
    if (location.protocol === 'https:' && url.protocol !== 'https:') throw new Error('Use HTTPS on this HTTPS page.');
    transport = new AbortController();
    const response = await fetch(url.href, { signal: transport.signal });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + response.statusText);
    loadXML(await response.text(), token, label, url.href);
  } catch (error) { fail(token, error, true); }
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  const token = begin(file.name);
  // Permit selecting the same file again, including after an error or reset.
  fileInput.value = '';
  try { loadXML(await file.text(), token, file.name); }
  catch (error) { fail(token, error, false); }
});
document.getElementById('gpx-url-form').addEventListener('submit', event => {
  event.preventDefault();
  loadURL(urlInput.value);
});
document.getElementById('gpx-reset').addEventListener('click', () => {
  fileInput.value = urlInput.value = '';
  loadURL(demo.dataset.gpxSource, 'Sample track');
});
loadURL(demo.dataset.gpxSource, 'Sample track');
