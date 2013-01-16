/**
 * Copyright (C) 2011-2012 Pavel Shramov
 * Copyright (C) 2013 Maxime Petazzoni <maxime.petazzoni@bulix.org>
 * All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * - Redistributions of source code must retain the above copyright notice,
 *   this list of conditions and the following disclaimer.
 *
 * - Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

/*
 * Thanks to Pavel Shramov who provided the initial implementation and Leaflet
 * integration. Original code was at https://github.com/shramov/leaflet-plugins.
 *
 * It was then cleaned-up and modified to record and make available more
 * information about the GPX track while it is being parsed so that the result
 * can be used to display additional information about the track that is
 * rendered on the Leaflet map.
 */

var _MAX_POINT_INTERVAL_MS = 15000;
var _SECOND_IN_MILLIS = 1000;
var _MINUTE_IN_MILLIS = 60 * _SECOND_IN_MILLIS;
var _HOUR_IN_MILLIS = 60 * _MINUTE_IN_MILLIS;

var _DEFAULT_MARKER_OPTS = {
  startIconUrl: 'pin-icon-start.png',
  endIconUrl: 'pin-icon-end.png',
  shadowUrl: 'pin-shadow.png',
  iconSize: [33, 50],
  shadowSize: [50, 50],
  iconAnchor: [16, 45],
  shadowAnchor: [16, 47]
};

L.GPX = L.FeatureGroup.extend({
  initialize: function(gpx, options) {
    options.max_point_interval = options.max_point_interval || _MAX_POINT_INTERVAL_MS;
    options.marker_options = this._merge_objs(
      _DEFAULT_MARKER_OPTS,
      options.marker_options || {})

    L.Util.setOptions(this, options);

    // Base icon class for track pins.
    L.GPXTrackIcon = L.Icon.extend({ options: options.marker_options });

    this._gpx = gpx;
    this._layers = {};
    this._info = {
      name: null,
      length: 0.0,
      elevation: {gain: 0.0, loss: 0.0, start: 0.0},
      hr: {_total: 0, _points: 0, avg: 0},
      duration: {start: null, end: null, moving: 0, total: 0},
    };

    if (gpx) {
      this._parse(gpx, options, this.options.async);
    }
  },

  get_duration_string: function(duration, hidems) {
    var s = '';

    if (duration >= _HOUR_IN_MILLIS) {
      s += Math.floor(duration / _HOUR_IN_MILLIS) + ':';
      duration = duration % _HOUR_IN_MILLIS;
    }

    var mins = Math.floor(duration / _MINUTE_IN_MILLIS);
    duration = duration % _MINUTE_IN_MILLIS;
    if (mins < 10) s += '0';
    s += mins + '\'';

    var secs = Math.floor(duration / _SECOND_IN_MILLIS);
    duration = duration % _SECOND_IN_MILLIS;
    if (secs < 10) s += '0';
    s += secs;

    if (!hidems && duration > 0) s += '.' + Math.round(Math.floor(duration)*1000)/1000;
    else s += '"';

    return s;
  },

  get_name:         function() { return this._info.name; },
  get_start_time:   function() { return this._info.duration.start; },
  get_end_time:     function() { return this._info.duration.end; },
  get_distance:     function() { return this._info.length; },
  get_moving_time:  function() { return this._info.duration.moving; },
  get_total_time:   function() { return this._info.duration.total; },
  get_average_hr:   function() { return this._info.hr.avg; },

  get_distance_in_miles:    function() { return this.get_distance() / 1000.0 / 1.60934; },
  get_moving_pace_in_miles: function() { return this._info.duration.moving / this.get_distance_in_miles(); },

  // Private methods

  _merge_objs: function(a, b) {
    var _ = {};
    for (var attr in a) { _[attr] = a[attr]; }
    for (var attr in b) { _[attr] = b[attr]; }
    return _;
  },

  _load_xml: function(url, cb, options, async) {
    if (async == undefined) async = this.options.async;
    if (options == undefined) options = this.options;

    var req = new window.XMLHttpRequest();
    req.open('GET', url, async);
    try {
      req.overrideMimeType('text/xml'); // unsupported by IE
    } catch(e) {}
    req.onreadystatechange = function() {
      if (req.readyState != 4) return;
      if(req.status == 200) cb(req.responseXML, options);
    };
    req.send(null);
  },

  _parse: function(url, options, async) {
    var _this = this;
    var cb = function(gpx, options) {
      var layers = _this._parse_gpx_data(gpx, options);
      if (!layers) return;
      _this.addLayer(layers);
      _this.fire('loaded');
    }
    this._load_xml(url, cb, options, async);
  },

  _parse_gpx_data: function(xml, options) {
    var j, i, el, layers = [];
    var tags = [['rte','rtept'], ['trkseg','trkpt']];

    var name = xml.getElementsByTagName('name');
    if (name.length > 0) {
      this._info.name = name[0].textContent;
    }

    for (j = 0; j < tags.length; j++) {
      el = xml.getElementsByTagName(tags[j][0]);
      for (i = 0; i < el.length; i++) {
        var coords = this._parse_trkseg(el[i], xml, options, tags[j][1]);

        // add track
        var l = new L.Polyline(coords, options);
        this.fire('addline', { line: l })
        layers.push(l);

        // add start pin
        var p = new L.Marker(coords[0], {
          clickable: false,
            icon: new L.GPXTrackIcon({iconUrl: options.marker_options.startIconUrl})
        });
        this.fire('addpoint', { point: p });
        layers.push(p);

        // add end pin
        p = new L.Marker(coords[coords.length-1], {
          clickable: false,
          icon: new L.GPXTrackIcon({iconUrl: options.marker_options.endIconUrl})
        });
        this.fire('addpoint', { point: p });
        layers.push(p);
      }
    }

    this._info.hr.avg = Math.round(this._info.hr._total / this._info.hr._points);

    if (!layers.length) return;
    var layer = layers[0];
    if (layers.length > 1)
      layer = new L.FeatureGroup(layers);
    return layer;
  },

  _parse_trkseg: function(line, xml, options, tag) {
    var el = line.getElementsByTagName(tag);
    if (!el.length) return [];
    var coords = [];
    var last = null;

    for (var i = 0; i < el.length; i++) {
      var ll = new L.LatLng(
        el[i].getAttribute('lat'),
        el[i].getAttribute('lon'));
      ll.meta = {
        time: new Date(Date.parse(el[i].getElementsByTagName('time')[0].textContent)),
        ele: el[i].getElementsByTagName('ele')[0].textContent,
        hr: null,
      };

      var _ = el[i].getElementsByTagNameNS('*', 'hr');
      if (_.length > 0) {
        ll.meta.hr = parseInt(_[0].textContent);
        this._info.hr._points++;
        this._info.hr._total += ll.meta.hr;
      }

      if (last != null) {
        this._info.length += this._dist3d(last, ll);

        var t = Math.abs(ll.meta.ele - last.meta.ele);
        if (t > 0) this._info.elevation.gain += t;
        else this._info.elevation.loss += t;

        t = Math.abs(ll.meta.time - last.meta.time);
        this._info.duration.total += t;
        if (t < options.max_point_interval) this._info.duration.moving += t;
      } else {
        this._info.elevation.start = ll.meta.ele;
        this._info.duration.start = ll.meta.time;
      }

      if (i == el.length - 1) {
        this._info.elevation.end = ll.meta.ele;
        this._info.duration.end = ll.meta.time;
      }

      last = ll;
      coords.push(ll);
    }

    return coords;
  },

  _dist2d: function(a, b) {
    var R = 6371000;
    var dLat = this._deg2rad(b.lat - a.lat);
    var dLon = this._deg2rad(b.lng - a.lng);
    var r = Math.sin(dLat/2) *
      Math.sin(dLat/2) +
      Math.cos(this._deg2rad(a.lat)) *
      Math.cos(this._deg2rad(b.lat)) *
      Math.sin(dLon/2) *
      Math.sin(dLon/2);
    var c = 2 * Math.atan2(Math.sqrt(r), Math.sqrt(1-r));
    var d = R * c;
    return d;
  },

  _dist3d: function(a, b) {
    var planar = this._dist2d(a, b);
    var height = Math.abs(b.meta.ele - a.meta.ele);
    return Math.sqrt(Math.pow(planar, 2) + Math.pow(height, 2));
  },

  _deg2rad: function(deg) {
    return deg * Math.PI / 180;
  },
});
