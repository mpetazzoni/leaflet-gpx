# Hovering over track points

Use the scripts and map element from [Usage](../README.md#usage).
This tooltip shows metadata for the nearest recorded point.

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

Some values are missing or calculated. Missing times use a local 1970
timestamp, which this example hides. Read the source XML in
`addline.element` if you need the original measurements.

For very large tracks, use a spatial index rather than scanning every point.
