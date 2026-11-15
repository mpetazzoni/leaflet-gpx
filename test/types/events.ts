import { FeatureGroup, LatLng, Marker, Polyline } from 'leaflet';
import { GPX } from '../../gpx.js';
import type { GPXAddLineEvent, GPXAddPointEvent, GPXErrorEvent, GPXLoadedEvent, GPXPointMetadata } from '../../gpx.js';

const gpx = new GPX('track.gpx', { async: true });
const context = { purpose: 'test' };
const loaded = (e: GPXLoadedEvent) => { e.target.get_distance(); e.element.documentElement; };
const error = (e: GPXErrorEvent) => { e.err.toUpperCase(); };
const addline = (e: GPXAddLineEvent) => { e.line.getLatLngs().forEach(p => p.meta.ele?.toFixed()); };
const addpoint = (e: GPXAddPointEvent) => { e.point.bindPopup(e.point_type); };

gpx.on('loaded', e => {
  const event: GPXLoadedEvent = e;
  const target: GPX = e.target;
  const source: GPX = e.sourceTarget;
  e.target.getBounds(); e.target.get_distance();
  const xml: Document = e.element;
  if (e.layers instanceof FeatureGroup) e.layers.eachLayer(layer => layer.remove());
  if (e.layers instanceof Marker) e.layers.getLatLng();
  if (e.layers instanceof Polyline) e.layers.getLatLngs();
});
gpx.on('addline', e => {
  const event: GPXAddLineEvent = e;
  e.line.setStyle({ color: 'red' });
  e.line.getLatLngs().forEach(p => {
    const metadata: GPXPointMetadata = p.meta;
    p.meta.time.toISOString(); p.meta.ele?.toFixed(); p.meta.speed.toFixed();
    p.meta.hr?.toFixed(); p.meta.cad?.toFixed(); p.meta.atemp?.toFixed();
    p.distanceTo(new LatLng(0, 0));
  });
  e.element.getAttribute('name');
});
gpx.on('addpoint', e => {
  const event: GPXAddPointEvent = e;
  e.point.getLatLng().lat.toFixed();
  switch (e.point_type) {
    case 'start': case 'end':
      e.line.getAttribute('name'); e.point.getLatLng().meta.time.toISOString(); break;
    case 'label':
      e.point.getLatLng().meta.hr?.toFixed(); break;
    case 'waypoint':
      e.element.getAttribute('sym'); break;
  }
});
gpx.on('error', e => { const event: GPXErrorEvent = e; e.err.toUpperCase(); });

// All listener overloads come from Leaflet 2, with the GPX event map substituted.
gpx.on('loaded', loaded, context).off('loaded', loaded, context);
gpx.once('error', error, context).off('error', error, context);
gpx.once('addline', addline).off('addline', addline);
gpx.once('addpoint', addpoint).off('addpoint', addpoint);
gpx.on({ loaded, error, addline, addpoint }, context);
gpx.once({ loaded: e => e.target.get_distance(), addline: e => e.line.getLatLngs()[0]?.meta.time }, context);
gpx.off({ loaded, error, addline, addpoint }, context);
gpx.off({ addpoint: e => e.point_type, error: e => e.err });
gpx.off('loaded').off('loaded error').off();
gpx.listens('loaded', loaded, context, true);
gpx.listens('error', true);

// Preserve inherited pointer, layer, popup, tooltip, unknown and multi-name events.
gpx.on('click', e => { const point: LatLng = e.latlng; e.originalEvent; e.target.get_distance(); });
gpx.once('pointerover', e => e.latlng.lat);
gpx.on('layeradd', e => e.layer.bindPopup('Added'));
gpx.off('layerremove', e => e.layer.remove());
gpx.once('popupopen', e => e.popup.close());
gpx.on('tooltipopen', e => e.tooltip.close());
gpx.on('add', e => e.target.get_distance()).once('remove', e => e.target.getBounds());
gpx.on({ click: e => e.latlng.lat, layeradd: e => e.layer.remove(), loaded: e => e.target.get_name() });
gpx.on('application-event', e => e.applicationData);
gpx.once('loaded error', e => e.target.get_distance());
gpx.on('click pointerover', e => e.target.getBounds());
gpx.fire('application-event', { applicationData: 1 }).addEventParent(new FeatureGroup());

class CustomGPX extends GPX { customMethod() { return 'custom'; } }
new CustomGPX('track.gpx').on('loaded', e => e.target.customMethod());
