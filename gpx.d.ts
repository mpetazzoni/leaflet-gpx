import { FeatureGroup } from 'leaflet';
import type {
  FeatureGroupEventMap, Icon, IconOptions, InteractiveLayerOptions,
  LatLng, Layer, LeafletEvent, Marker, PointExpression, Polyline, PolylineOptions,
} from 'leaflet';

/**
 * Structural icon contract for custom Leaflet 2 marker renderers, without
 * requiring inheritance from Icon or its implementation-only members.
 * For popups, supply options.popupAnchor; for tooltips, implement
 * _getTooltipAnchor. The latter is an internal Leaflet hook required by its
 * marker tooltip implementation, not a GPX method.
 */
export interface GPXIconLike {
  /** Icon/anchor configuration; pixel units. Used by Leaflet when opening popups. */
  options: IconOptions;
  /** Create or reuse the marker's HTML element. */
  createIcon(oldIcon?: HTMLElement | null): HTMLElement;
  /** Optionally create/reuse a shadow image; null means no shadow. */
  createShadow?(oldIcon?: HTMLElement | null): HTMLImageElement | null;
  /** Optional Leaflet tooltip-anchor hook; returns a pixel offset from the icon anchor. */
  _getTooltipAnchor?(direction?: string): PointExpression;
}

/** An image URL/path, a Leaflet Icon (including DefaultIcon/DivIcon), or a compatible custom renderer. */
export type GPXIcon = string | Icon | GPXIconLike;

/**
 * Custom renderer safe for standalone waypoints, which automatically bind
 * and open popups. Unlike an endpoint-only renderer, it must supply the
 * popup anchor consumed by Leaflet's Marker popup positioning code.
 */
export interface GPXWaypointIconLike extends GPXIconLike {
  /** Icon configuration with a required popup offset in pixels from the icon anchor. */
  options: IconOptions & { popupAnchor: PointExpression };
}

/** Waypoint-safe image URL, Leaflet Icon with built-in defaults, or custom renderer with a popup anchor. */
export type GPXWaypointIcon = string | Icon | GPXWaypointIconLike;

/** Symbol/type icon lookup. Null entries are not selected; other fallback rules may still apply. */
export type GPXWaypointIcons = Record<string, GPXWaypointIcon | null>;

/** A rule for a named track/route point or waypoint. First matching rule wins. */
export interface GPXPointMatcher {
  /** Tested against the point name. Stateful global/sticky expressions retain their normal RegExp behavior. */
  regex: RegExp;
  /** Waypoint-safe icon, since rules also match waypoints. URLs are converted to Icon instances in place during setup. */
  icon: GPXWaypointIcon;
}

/**
 * Marker definitions, shallow-merged with defaults. Supplied lookup tables
 * replace, rather than merge with, the default tables. Use empty tables and
 * an empty matcher array to suppress waypoints; null containers are not
 * supported by the current marker preparation code. Explicitly undefined
 * containers retain defaults. URL entries in supplied tables and matcher
 * rules are converted in place; frozen tables/rules are unsupported.
 */
export interface GPXMarkers {
  /** Start pin for each route/track (or segment if unjoined). Default: DefaultIcon; null disables it. */
  startIcon?: GPXIcon | null;
  /** End pin for each route/track (or segment if unjoined). Default: DefaultIcon; null disables it. */
  endIcon?: GPXIcon | null;
  /**
   * Icons keyed by waypoint <sym>. Default: { '': DefaultIcon }.
   * The empty key supplies a fallback only when no point matchers are configured.
   * Null entries do not block later type/name/fallback matches.
   */
  wptIcons?: GPXWaypointIcons;
  /**
   * Icons keyed by waypoint <type>, checked after symbol matches.
   * Default: { '': DefaultIcon }; this table's empty key is not used as a fallback.
   */
  wptTypeIcons?: GPXWaypointIcons;
  /** Name-based rules, after waypoint symbol/type matches. Default: []; use [] to disable named-point rules. */
  pointMatchers?: GPXPointMatcher[];
}

/**
 * Leaflet Icon options for icons built from URL strings, not general Marker
 * options. Existing icon objects are left unchanged. All inherited size and
 * anchor options use pixels and retain Leaflet's defaults unless overridden.
 */
export interface GPXMarkerOptions extends IconOptions {
  /** Default image size in pixels: [33, 45] (only URL-created icons). */
  iconSize?: Exclude<IconOptions['iconSize'], undefined>;
  /** Default image tip offset in pixels: [16, 45] (only URL-created icons). */
  iconAnchor?: Exclude<IconOptions['iconAnchor'], undefined>;
  /**
   * Legacy flag passed to generated Markers. Default: false.
   * Leaflet 2 uses interactive instead and ignores clickable; this is not
   * a way to disable pointer interaction in Leaflet 2.
   */
  clickable?: boolean;
}

/** GPX element categories recognized by the parser. */
export type GPXParseElement = 'track' | 'route' | 'waypoint';

/** Selection and segmentation of the GPX XML. */
export interface GPXParseOptions {
  /**
   * Categories to parse. Default: ['track', 'route', 'waypoint'].
   * Routes are processed first, then tracks, then waypoints regardless of array
   * order. Selecting both route and track may double-count duplicated data.
   * Explicit undefined retains the default. An empty array results in an
   * error event because no layers can be parsed.
   */
  parseElements?: GPXParseElement[];
  /**
   * Join all <trkseg>s of each <trk>. Default: true.
   * Joined segments include distance/time across the gaps. When false, each
   * segment gets its own line and start/end pins, without bridging gaps.
   */
  joinTrackSegments?: boolean;
}

/**
 * GPX constructor options, in addition to inherited FeatureGroup options.
 * Group options are not automatically forwarded to generated markers/lines.
 * The constructor assigns normalized properties back onto the caller's
 * top-level options object. Supplied lookup tables keep their identity and
 * URL entries are replaced with Icons in place; matcher rule icons also
 * change in place. Frozen options, lookup tables, and rules are unsupported.
 */
export interface GPXOptions extends InteractiveLayerOptions {
  /**
   * Defer parsing inline XML to a later tick. Default: false/undefined.
   * URL fetches are always asynchronous. loaded/error are deferred even for
   * synchronous inline parsing; use true to attach addline/addpoint listeners
   * after construction and still observe inline parsing events.
   */
  async?: boolean;
  /**
   * Maximum interval between points counted as moving, in milliseconds.
   * Default: 15000. Only intervals strictly below the threshold count; 0
   * falls back to the default. Missing timestamps use a synthetic epoch date.
   */
  max_point_interval?: number;
  /** Marker definitions. Defaults to Leaflet DefaultIcon for start/end and ordinary waypoints. */
  markers?: GPXMarkers;
  /** Options for URL-created icons and the legacy clickable flag. Defaults: [33,45], [16,45], false. */
  marker_options?: GPXMarkerOptions;
  /**
   * Leaflet line options overriding GPX Style extensions. Default: blue.
   * One object applies to all lines; an array indexes routes and tracks
   * independently from zero (not a combined list). All segments of one track
   * share that track's entry. Missing entries preserve XML/default styling.
   */
  polyline_options?: PolylineOptions | PolylineOptions[];
  /** GPX element selection and segment joining options; omitted fields retain defaults. */
  gpx_options?: GPXParseOptions;
}

/**
 * Metadata on parsed track/route LatLngs, not on plain waypoint coordinates.
 * Malformed numeric values can be NaN, and malformed timestamps Invalid Date.
 * Elevation is stored here, not in Leaflet's LatLng.alt field.
 */
export interface GPXPointMetadata {
  /** Parsed timestamp; absent <time> becomes new Date('1970-01-01T00:00:00') in local time, not null. */
  time: Date;
  /** Elevation in meters; missing values inherit the preceding point's elevation, or null at the start. */
  ele: number | null;
  /** Heart rate in beats/minute from extension <hr>; null when absent. */
  hr: number | null;
  /** Cadence in revolutions/minute from extension <cad>; null when absent. */
  cad: number | null;
  /** Ambient temperature in degrees Celsius from extension <atemp>, parsed as an integer; null when absent. */
  atemp: number | null;
  /** Speed in meters/second: <speed> or computed 3D distance/time; 0 without a positive interval. */
  speed: number;
}

/** A parsed track/route coordinate; Leaflet operations such as clone() need not preserve meta. */
export interface GPXLatLng extends LatLng {
  /** GPX point measurements; available on original coordinates returned by an addline event. */
  meta: GPXPointMetadata;
}

/**
 * A Leaflet Polyline as initially produced by the parser, not a separate runtime
 * class/export. Replacing/appending coordinates using Leaflet methods may lose
 * metadata or change this flat shape; the refinement applies to parsed lines.
 */
export interface GPXPolyline extends Polyline {
  /** Original flat route/track/segment coordinates with GPX metadata, before caller modifications. */
  getLatLngs(): GPXLatLng[];
}

/** A generated track/route marker, before its position is replaced or it is dragged. Not a runtime class. */
export interface GPXMarker extends Marker {
  /** Original parsed coordinate with GPX measurements; Leaflet coordinate replacement may discard meta. */
  getLatLng(): GPXLatLng;
}

/**
 * A chart sample [distance, value, tooltip]. Metric methods use kilometers,
 * imperial methods miles. Measurement units are documented on each accessor;
 * null denotes unavailable elevation. Arrays are snapshots, not live statistics.
 */
export type GPXDataPoint<Value extends number | null = number> = [distance: number, value: Value, tooltip: string];

/** Common fields of non-propagated GPX parser events. */
export interface GPXEvent extends LeafletEvent {
  /** GPX instance whose parser emitted the event. */
  target: GPX;
  /** Same GPX instance for these non-propagated parser events. */
  sourceTarget: GPX;
}

/** Successful parse event, delivered after the constructor returns. */
export interface GPXLoadedEvent extends GPXEvent {
  /** Event name. */
  type: 'loaded';
  /** Parsed layer: a single Marker/Polyline or a FeatureGroup if there are multiple layers. */
  layers: Marker | GPXPolyline | FeatureGroup;
  /** Parsed XML document, not an individual XML element. */
  element: Document;
}

/** Fetch, XML parsing, or no-parseable-layers failure; delivered after construction. */
export interface GPXErrorEvent extends GPXEvent {
  /** Event name. */
  type: 'error';
  /** Human-readable error message (a string, not an Error object). */
  err: string;
}

/** Emitted during parsing for each route/track/segment line; inline XML requires async: true to observe it. */
export interface GPXAddLineEvent extends GPXEvent {
  /** Event name. */
  type: 'addline';
  /** Leaflet polyline with original GPX point metadata. */
  line: GPXPolyline;
  /** Source <rte>, joined <trk>, or unjoined <trkseg> XML element. */
  element: Element;
}

/** Fields shared by generated-marker events. */
export interface GPXAddPointEventBase extends GPXEvent {
  /** Event name. */
  type: 'addpoint';
  /** Generated Leaflet Marker. Standalone waypoint coordinates have no GPX measurements. */
  point: Marker;
  /** Source <wpt>, <trkpt>, or <rtept> XML element. */
  element: Element;
}

/** Start/end marker event, with the enclosing source XML line. */
export interface GPXEndpointEvent extends GPXAddPointEventBase {
  /** Start/end Marker retaining its original parsed track/route coordinate and meta. */
  point: GPXMarker;
  /** Start or end pin. */
  point_type: 'start' | 'end';
  /** Source <rte>, <trk>, or <trkseg> XML element; not a Leaflet polyline. */
  line: Element;
}

/** Standalone waypoint marker event, without track/route metadata or an enclosing line field. */
export interface GPXWaypointEvent extends GPXAddPointEventBase {
  /** Standalone waypoint. */
  point_type: 'waypoint';
  /** Absent for waypoints; narrow point_type before accessing endpoint line data. */
  line?: never;
}

/** Name-matched track/route point marker event, without an enclosing line field. */
export interface GPXLabelPointEvent extends GPXAddPointEventBase {
  /** Name-matched track/route point. */
  point_type: 'label';
  /** Marker retaining its original parsed coordinate and GPX measurements. */
  point: GPXMarker;
  /** Absent for label events; only start/end events carry the source line. */
  line?: never;
}

/** Discriminated generated-marker event; emitted during parsing (use async: true for inline XML). */
export type GPXAddPointEvent = GPXEndpointEvent | GPXWaypointEvent | GPXLabelPointEvent;

/**
 * GPX parser events plus all inherited Leaflet FeatureGroup events. Supplying
 * this map to Leaflet's generic preserves its listener/map/context overloads,
 * arbitrary custom and space-separated event names, off(), once(), and listens().
 */
export interface GPXEventMap extends FeatureGroupEventMap {
  /** Parsing finished successfully; statistics and layers are available. */
  loaded: GPXLoadedEvent;
  /** Fetch/parse failed, or the selected categories produced no layers. */
  error: GPXErrorEvent;
  /** One parsed route/track/segment line was created. */
  addline: GPXAddLineEvent;
  /** One start/end/waypoint/name-matched marker was created. */
  addpoint: GPXAddPointEvent;
}

/**
 * Display and analyze GPX XML as a Leaflet 2 FeatureGroup. Named ES module
 * export only (no default export or L.GPX global). Statistics aggregate parsed
 * routes/tracks, not standalone waypoints. Before loading, numeric totals are
 * zero; missing/invalid samples can produce NaN or Infinity. Computations do
 * not sanitize bad measurements or protect against division by zero.
 * Inherited layer/FeatureGroup operations remain available and chainable.
 */
export declare class GPX extends FeatureGroup<Layer, GPXOptions, GPXEventMap> {
  /**
   * @param gpx Nonempty URL/path or XML string starting with '<' after ignoring
   * leading whitespace/BOM. Omit the input to create an empty layer. The supported
   * input contract is string, not Document/URL/number. Browser DOMParser and
   * fetch are required. Listen for error events rather than assuming every
   * invalid document throws from the constructor.
   * @param options Parser/display options; nested defaults are shallow-merged.
   * Normalization mutates top-level properties, lookup URL entries, and
   * matcher rules. Do not pass frozen objects.
   */
   constructor(gpx?: string, options?: GPXOptions);

  /** Format milliseconds as e.g. 3:07'48" or 59'32.431; hidems defaults to false. Days get a 'Nd ' prefix. */
  get_duration_string(duration: number, hidems?: boolean): string;
  /** Format milliseconds as e.g. 3:07:48; hidems defaults to false. ISO-like, not ISO 8601 duration syntax. */
  get_duration_string_iso(duration: number, hidems?: boolean): string;
  /** Convert kilometers to miles (divides by 1.60934). */
  to_miles(v: number): number;
  /** Convert meters to feet (multiplies by 3.28084). */
  to_ft(v: number): number;
  /** Convert meters to kilometers. */
  m_to_km(v: number): number;
  /** Convert meters to miles (divides by 1609.34). */
  m_to_mi(v: number): number;
  /** Convert meters/second to kilometers/hour. */
  ms_to_kmh(v: number): number;
  /** Convert meters/second to miles/hour. */
  ms_to_mih(v: number): number;
  /** Trimmed GPX name; null when absent or before parsing. Metadata/root/first track/first route precedence. */
  get_name(): string | null;
  /** Trimmed GPX description; undefined when absent or before parsing. Same precedence as get_name(). */
  get_desc(): string | undefined;
  /** Trimmed author name child or author text content; undefined when absent or before parsing. */
  get_author(): string | undefined;
  /** Trimmed copyright element text (not the author attribute); undefined when absent or before parsing. */
  get_copyright(): string | undefined;
  /** Total 3D distance in meters, including elevation difference; initially 0. */
  get_distance(): number;
  /** Total 3D distance in miles; initially 0. */
  get_distance_imp(): number;
  /** First parsed route/track point's time, or null without points. Missing timestamps use a synthetic local epoch date. */
  get_start_time(): Date | null;
  /** Last parsed route/track point's time, or null without points. Not necessarily chronological maximum. */
  get_end_time(): Date | null;
  /** Moving time in milliseconds: sum of absolute point intervals strictly below max_point_interval; initially 0. */
  get_moving_time(): number;
  /** Total time in milliseconds: sum of absolute point intervals, not simply end minus start; initially 0. */
  get_total_time(): number;
  /** Average moving pace in milliseconds/kilometer; can be NaN/Infinity with zero distance. */
  get_moving_pace(): number;
  /** Average moving pace in milliseconds/mile; can be NaN/Infinity with zero distance. */
  get_moving_pace_imp(): number;
  /** Average moving speed in kilometers/hour; can be NaN/Infinity with zero moving time. */
  get_moving_speed(): number;
  /** Average moving speed in miles/hour; can be NaN/Infinity with zero moving time. */
  get_moving_speed_imp(): number;
  /** Average total speed in kilometers/hour; can be NaN/Infinity with zero total time. */
  get_total_speed(): number;
  /** Average total speed in miles/hour; can be NaN/Infinity with zero total time. */
  get_total_speed_imp(): number;
  /** Cumulative elevation gain in meters; initially 0. Missing elevations participate through JS numeric coercion. */
  get_elevation_gain(): number;
  /** Cumulative elevation loss in meters, a nonnegative magnitude for valid samples; initially 0. */
  get_elevation_loss(): number;
  /** Cumulative elevation gain in feet; initially 0. */
  get_elevation_gain_imp(): number;
  /** Cumulative elevation loss in feet; initially 0. */
  get_elevation_loss_imp(): number;
  /** [kilometers, meters or null, tooltip] for every parsed route/track point; missing elevation carries forward. */
  get_elevation_data(): GPXDataPoint<number | null>[];
  /** [miles, feet or null, tooltip] for every parsed route/track point; null remains null in this series. */
  get_elevation_data_imp(): GPXDataPoint<number | null>[];
  /** Maximum elevation in meters; starts at 0, so all-negative samples still return 0. */
  get_elevation_max(): number;
  /** Minimum elevation in meters; starts at Infinity, and null samples may lower it to null at runtime. */
  get_elevation_min(): number | null;
  /** Maximum elevation in feet; starts at 0, so all-negative samples still return 0. */
  get_elevation_max_imp(): number;
  /** Minimum elevation in feet; initially Infinity. A null metric minimum is numerically converted to 0. */
  get_elevation_min_imp(): number;
  /** [kilometers, kilometers/hour, tooltip] for every parsed route/track point; absent speed is computed. */
  get_speed_data(): GPXDataPoint[];
  /** [miles, miles/hour, tooltip] for every parsed route/track point; absent speed is computed. */
  get_speed_data_imp(): GPXDataPoint[];
  /** Maximum speed in kilometers/hour; starts at 0 (negative/NaN samples do not increase it). */
  get_speed_max(): number;
  /** Maximum speed in miles/hour; initially 0. */
  get_speed_max_imp(): number;
  /** Rounded mean heart rate in beats/minute; 0 before parsing, NaN after parsing if no <hr> samples exist. */
  get_average_hr(): number;
  /** Rounded mean ambient temperature in degrees Celsius; 0 before parsing, NaN if no <atemp> samples exist. */
  get_average_temp(): number;
  /** Rounded mean cadence in revolutions/minute; 0 before parsing, NaN if no <cad> samples exist. */
  get_average_cadence(): number;
  /** [kilometers, beats/minute, tooltip] for points carrying <hr> measurements only. */
  get_heartrate_data(): GPXDataPoint[];
  /** [miles, beats/minute, tooltip] for points carrying <hr> measurements only. */
  get_heartrate_data_imp(): GPXDataPoint[];
  /** [kilometers, revolutions/minute, tooltip] for points carrying <cad> measurements only. */
  get_cadence_data(): GPXDataPoint[];
  /** [kilometers, degrees Celsius, tooltip] for points carrying <atemp> measurements only; integer samples. */
  get_temp_data(): GPXDataPoint[];
  /** [miles, revolutions/minute, tooltip] for points carrying <cad> measurements only. */
  get_cadence_data_imp(): GPXDataPoint[];
  /** [miles, degrees Celsius, tooltip] for points carrying <atemp> measurements only (no Fahrenheit conversion). */
  get_temp_data_imp(): GPXDataPoint[];
  /** Clear layers/statistics and reparse/refetch the original string with current options. Returns undefined, not this/Promise. */
  reload(): void;
}
