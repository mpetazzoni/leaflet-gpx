// Helper function to create a simple GPX XML string
function createGpxData(points) {
    let trkpts = points.map(p => `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele || 0}</ele><time>${p.time || new Date().toISOString()}</time></trkpt>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" version="1.1" creator="Test">
  <metadata>
    <name>Test Track</name>
  </metadata>
  <trk>
    <name>Test Track Segment</name>
    <trkseg>
      ${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

// Mock L.Marker and L.LatLng if not in a Leaflet environment
if (typeof L === 'undefined') {
    global.L = {
        LatLng: function(lat, lon) {
            this.lat = lat;
            this.lng = lon;
            this.meta = {}; // Ensure meta is defined
            return this;
        },
        Marker: function(latLng, options) {
            this.getLatLng = function() { return latLng; };
            this.options = options || {};
            this.bindPopup = function() { return this; }; // Chainable
            this.fire = function() {}; // Mock fire method
            return this;
        },
        Polyline: function() {
            this.fire = function() {}; // Mock fire method
            return this;
        },
        FeatureGroup: function() {
            this.addLayer = function() {};
            this.fire = function() {};
            this.getBounds = function() { return {isValid: () => false}; }; // Mock getBounds
            return this;
        },
        Icon: { Default: function() { this.options = {};} }, // Mock L.Icon.Default
        GPXTrackIcon: L.Icon.Default, // Mock L.GPXTrackIcon
        Util: {
            setOptions: function (obj, options) {
                obj.options = Object.assign({}, obj.options, options);
                return obj.options;
            }
        }
    };
    // Ensure _DEFAULT_ICON is defined if L.GPX expects it globally
    // This might be tricky if _DEFAULT_ICON is instantiated within L.GPX scope
    // For now, we assume L.GPX handles its own _DEFAULT_ICON initialization
}


function runGpxTests() {
    let results = [];
    let allTestsPassed = true;

    function assert(condition, message) {
        if (!condition) {
            results.push(`FAIL: ${message}`);
            allTestsPassed = false;
        } else {
            results.push(`PASS: ${message}`);
        }
    }

    function getDistanceMarkers(gpxInstance) {
        const markers = [];
        if (gpxInstance && gpxInstance._layers) {
            for (const layerId in gpxInstance._layers) {
                const layer = gpxInstance._layers[layerId];
                // Check if it's a FeatureGroup (likely holding the actual markers and polyline)
                if (layer instanceof L.FeatureGroup && layer._layers) {
                    for (const subLayerId in layer._layers) {
                        const subLayer = layer._layers[subLayerId];
                        if (subLayer.options && subLayer.options.isDistanceMarker) {
                            markers.push(subLayer);
                        }
                    }
                } else if (layer.options && layer.options.isDistanceMarker) {
                    markers.push(layer);
                }
            }
        }
        return markers;
    }

    // --- Test Data ---
    // Approx 1km per 0.01 deg longitude at equator, less sensitive to latitude changes for short N-S distances
    const gpxPoints_3km = [
        { lat: 0, lon: 0, time: '2023-01-01T00:00:00Z' },    // Start
        { lat: 0, lon: 0.01, time: '2023-01-01T00:01:00Z' }, // ~1.11 km
        { lat: 0, lon: 0.02, time: '2023-01-01T00:02:00Z' }, // ~2.22 km
        { lat: 0, lon: 0.03, time: '2023-01-01T00:03:00Z' }  // ~3.33 km
    ];
    const gpxData_3km = createGpxData(gpxPoints_3km);

    const gpxPoints_short = [
        { lat: 0, lon: 0, time: '2023-01-01T00:00:00Z' },
        { lat: 0, lon: 0.001, time: '2023-01-01T00:00:10Z' } // ~111m
    ];
    const gpxData_short = createGpxData(gpxPoints_short);

    const gpxPoints_interpolation = [
        { lat: 0, lon: 0, time: '2023-01-01T00:00:00Z' },    // Start
        { lat: 0, lon: 0.02, time: '2023-01-01T00:02:00Z' }  // ~2.22 km
    ];
    const gpxData_interpolation = createGpxData(gpxPoints_interpolation);

    // --- Test 1: Markers disabled ---
    try {
        const gpxDisabled = new L.GPX(gpxData_3km, {
            async: false, // Run synchronously for tests
            showDistanceMarkers: false
        });
        const markersDisabled = getDistanceMarkers(gpxDisabled);
        assert(markersDisabled.length === 0, "Test 1: Markers disabled - No distance markers should be added.");
    } catch (e) {
        assert(false, `Test 1: Markers disabled - FAILED with error: ${e.message} \nStack: ${e.stack}`);
    }

    // --- Test 2: Markers enabled (km) ---
    try {
        const gpxKm = new L.GPX(gpxData_3km, {
            async: false,
            showDistanceMarkers: true,
            distanceUnit: "km",
            distanceMarkerInterval: 1
        });
        const markersKm = getDistanceMarkers(gpxKm);
        // Expect markers at ~1km, ~2km, ~3km. Total distance is ~3.33km.
        assert(markersKm.length === 3, `Test 2: Markers enabled (km) - Correct number of markers. Expected 3, Got ${markersKm.length}`);
        if (markersKm.length === 3) {
            assert(markersKm[0].options.title === "1 km", "Test 2: Marker 1 (km) title is '1 km'.");
            assert(markersKm[1].options.title === "2 km", "Test 2: Marker 2 (km) title is '2 km'.");
            assert(markersKm[2].options.title === "3 km", "Test 2: Marker 3 (km) title is '3 km'.");
        }
    } catch (e) {
        assert(false, `Test 2: Markers enabled (km) - FAILED with error: ${e.message} \nStack: ${e.stack}`);
    }

    // --- Test 3: Markers enabled (miles) ---
    try {
        const gpxMiles = new L.GPX(gpxData_3km, {
            async: false,
            showDistanceMarkers: true,
            distanceUnit: "miles",
            distanceMarkerInterval: 1
        });
        const markersMiles = getDistanceMarkers(gpxMiles);
        // 3.33 km is roughly 2.07 miles. Expect markers at 1 mi, 2 mi.
        assert(markersMiles.length === 2, `Test 3: Markers enabled (miles) - Correct number of markers. Expected 2, Got ${markersMiles.length}`);
        if (markersMiles.length === 2) {
            assert(markersMiles[0].options.title === "1 mi", "Test 3: Marker 1 (miles) title is '1 mi'.");
            assert(markersMiles[1].options.title === "2 mi", "Test 3: Marker 2 (miles) title is '2 mi'.");
        }
    } catch (e) {
        assert(false, `Test 3: Markers enabled (miles) - FAILED with error: ${e.message} \nStack: ${e.stack}`);
    }

    // --- Test 4: Custom interval (0.5 km) ---
    try {
        const gpxCustomKm = new L.GPX(gpxData_3km, {
            async: false,
            showDistanceMarkers: true,
            distanceUnit: "km",
            distanceMarkerInterval: 0.5
        });
        const markersCustomKm = getDistanceMarkers(gpxCustomKm);
        // Track is ~3.33km. Markers at 0.5, 1.0, 1.5, 2.0, 2.5, 3.0 km
        assert(markersCustomKm.length === 6, `Test 4: Custom interval (0.5 km) - Correct number of markers. Expected 6, Got ${markersCustomKm.length}`);
        if (markersCustomKm.length === 6) {
            assert(markersCustomKm[0].options.title === "0.5 km", "Test 4: Marker 1 (0.5 km) title.");
            assert(markersCustomKm[5].options.title === "3 km", "Test 4: Marker 6 (0.5 km) title.");
        }
    } catch (e) {
        assert(false, `Test 4: Custom interval (0.5 km) - FAILED with error: ${e.message} \nStack: ${e.stack}`);
    }

    // --- Test 5: Track shorter than interval ---
    try {
        const gpxShort = new L.GPX(gpxData_short, {
            async: false,
            showDistanceMarkers: true,
            distanceUnit: "km",
            distanceMarkerInterval: 1 // Track is ~111m, interval 1km
        });
        const markersShort = getDistanceMarkers(gpxShort);
        assert(markersShort.length === 0, "Test 5: Track shorter than interval - No distance markers should be added.");
    } catch (e) {
        assert(false, `Test 5: Track shorter than interval - FAILED with error: ${e.message} \nStack: ${e.stack}`);
    }

    // --- Test 6: Interpolation check (basic) ---
    try {
        const gpxInterpolation = new L.GPX(gpxData_interpolation, { // ~2.22 km long
            async: false,
            showDistanceMarkers: true,
            distanceUnit: "km",
            distanceMarkerInterval: 1
        });
        const markersInterpolation = getDistanceMarkers(gpxInterpolation);
        // Expect markers at 1km and 2km.
        // Point 0: (0,0), Point 1: (0, 0.02)
        // Marker 1 (1km) should be between (0,0) and (0,0.02), closer to (0,0.01)
        assert(markersInterpolation.length === 2, `Test 6: Interpolation - Correct number of markers. Expected 2, Got ${markersInterpolation.length}`);
        if (markersInterpolation.length > 0) {
            const marker1Pos = markersInterpolation[0].getLatLng();
            const p0 = gpxPoints_interpolation[0];
            const p1 = gpxPoints_interpolation[1];

            // Basic check: latitude should be the same (0 for this test data)
            // Longitude should be between p0.lon and p1.lon
            // 1km is approx 1/2.22 of the way from p0 to p1. So lon should be around 0.02 * (1/2.22) = 0.009
            assert(marker1Pos.lat === p0.lat, "Test 6: Interpolation - Marker 1 latitude is correct.");
            assert(marker1Pos.lng > p0.lon && marker1Pos.lng < p1.lon, "Test 6: Interpolation - Marker 1 longitude is between segment points.");
            assert(Math.abs(marker1Pos.lng - (p1.lon / 2.22)) < 0.001, `Test 6: Interpolation - Marker 1 longitude is approximately correct. Expected ~0.009, Got ${marker1Pos.lng}`);
        }
    } catch (e) {
        assert(false, `Test 6: Interpolation check - FAILED with error: ${e.message} \nStack: ${e.stack}`);
    }

    // Output results
    console.log("--- GPX Distance Marker Test Results ---");
    results.forEach(res => console.log(res));
    console.log(allTestsPassed ? "All tests PASSED!" : "Some tests FAILED.");
    console.log("--------------------------------------");

    return { allTestsPassed, results };
}

// If running in a browser-like environment, you might auto-run:
// if (typeof window !== 'undefined') {
//     window.addEventListener('load', runGpxTests);
// }
// Otherwise, it can be called manually: runGpxTests();
