import { motion, useReducedMotion } from "motion/react";

const SOURCE = { x: 48, y: 84 };
const UPPER_WAYPOINT = { x: 138, y: 46 };
const LOWER_WAYPOINT = { x: 138, y: 122 };
const DESTINATION = { x: 270, y: 84 };

const UPPER_ROUTE = "M48 84 C86 84 91 46 138 46 C187 46 199 84 270 84";
const LOWER_ROUTE = "M48 84 C86 84 91 122 138 122 C187 122 199 84 270 84";

type Point = readonly [number, number];
type CubicSegment = readonly [Point, Point, Point, Point];

const UPPER_LIGHT_ROUTE = sampleRoute([
  [[48, 84], [86, 84], [91, 46], [138, 46]],
  [[138, 46], [187, 46], [199, 84], [270, 84]],
]);
const LOWER_LIGHT_ROUTE = sampleRoute([
  [[48, 84], [86, 84], [91, 122], [138, 122]],
  [[138, 122], [187, 122], [199, 84], [270, 84]],
]);

type PathLoadingOverlayProps = {
  context?: "import" | "breeding";
  message: string;
  variant?: "modal" | "panel";
};

export default function PathLoadingOverlay({
  context = "import",
  message,
  variant = "modal",
}: PathLoadingOverlayProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const importing = context === "import" && message.startsWith("Importing");
  const isBreeding = context === "breeding";
  const pathTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 1.45, ease: [0.4, 0, 0.2, 1] as const };
  const kicker = isBreeding ? "TRACING LINEAGE" : importing ? "ASSEMBLING LINEAGE" : "TRACING SAVE PATH";
  const title = isBreeding ? "Finding the best path" : importing ? "Building your world" : "Finding your worlds";
  const footnote = isBreeding
    ? "Comparing parents \u00b7 passives \u00b7 IVs \u00b7 hatch odds"
    : "Local only \u00b7 your save stays on this device";

  return (
    <motion.div
      className={`path-loading-overlay is-${variant}`}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.01 : 0.4, ease: "easeOut" }}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <motion.div
        className="path-loading-content"
        initial={reduceMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -2 }}
        transition={{ duration: reduceMotion ? 0.01 : 0.52, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="path-loading-kicker">
          <motion.i
            aria-hidden="true"
            animate={reduceMotion ? undefined : { opacity: [0.5, 0.9, 0.5], scale: [0.92, 1.04, 0.92] }}
            transition={{ duration: 2.8, ease: "easeInOut", repeat: Infinity }}
          />
          {kicker}
        </span>

        <svg className="lineage-loader-map" viewBox="0 0 320 170" aria-hidden="true">
          <defs>
            <linearGradient id="lineage-loader-route" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#79b7a5" />
              <stop offset="0.58" stopColor="#23856d" />
              <stop offset="1" stopColor="#b3e75f" />
            </linearGradient>
            <radialGradient id="lineage-loader-child" cx="50%" cy="42%" r="58%">
              <stop offset="0" stopColor="#efffcf" />
              <stop offset="1" stopColor="#b3e75f" />
            </radialGradient>
            <filter id="lineage-loader-glow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="2.6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path className="lineage-loader-track" d={UPPER_ROUTE} />
          <path className="lineage-loader-track" d={LOWER_ROUTE} />

          <motion.path
            className="lineage-loader-route"
            d={UPPER_ROUTE}
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0.18 }}
            animate={{ pathLength: 1, opacity: 0.78 }}
            transition={{ ...pathTransition, delay: reduceMotion ? 0 : 0.18 }}
          />
          <motion.path
            className="lineage-loader-route"
            d={LOWER_ROUTE}
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0.18 }}
            animate={{ pathLength: 1, opacity: 0.78 }}
            transition={{ ...pathTransition, delay: reduceMotion ? 0 : 0.38 }}
          />

          <SourceNode reduceMotion={reduceMotion} />
          <WaypointNode x={UPPER_WAYPOINT.x} y={UPPER_WAYPOINT.y} reduceMotion={reduceMotion} delay={0.74} />
          <WaypointNode x={LOWER_WAYPOINT.x} y={LOWER_WAYPOINT.y} reduceMotion={reduceMotion} delay={0.94} />

          <motion.g
            className={`lineage-loader-result${isBreeding ? " is-breeding" : ""}`}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.8, delay: reduceMotion ? 0 : 1.42, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: `${DESTINATION.x}px ${DESTINATION.y}px` }}
          >
            <motion.circle
              className="lineage-loader-result-halo"
              cx={DESTINATION.x}
              cy={DESTINATION.y}
              r="23"
              animate={reduceMotion ? undefined : { r: [22, 24.5, 22], opacity: [0.36, 0.68, 0.36] }}
              transition={{ duration: 3.4, ease: "easeInOut", repeat: Infinity, delay: 1.5 }}
            />
            <circle className="lineage-loader-result-node" cx={DESTINATION.x} cy={DESTINATION.y} r="16" />
            <path d={isBreeding ? "M270 77l7 7-7 7-7-7z" : "m263 84 5 5 10-12"} />
          </motion.g>

          {!reduceMotion ? (
            <g className="lineage-loader-lights" filter="url(#lineage-loader-glow)">
              <RouteLight route={UPPER_LIGHT_ROUTE} delay={1.9} />
              <RouteLight route={LOWER_LIGHT_ROUTE} delay={5.3} />
            </g>
          ) : null}
        </svg>

        <div className="path-loading-copy">
          <strong>{title}</strong>
          <p>{message}</p>
        </div>
        <span className="path-loading-footnote">{footnote}</span>
      </motion.div>
    </motion.div>
  );
}

type SampledRoute = {
  cx: number[];
  cy: number[];
  times: number[];
};

function RouteLight({ route, delay }: { route: SampledRoute; delay: number }) {
  const opacity = route.times.map((time) => {
    if (time < 0.07) return (time / 0.07) * 0.76;
    if (time > 0.9) return ((1 - time) / 0.1) * 0.76;
    return 0.76;
  });
  const radius = route.times.map((time) => 2.4 + Math.sin(Math.PI * time) * 0.8);

  return (
    <motion.circle
      initial={{ opacity: 0, cx: route.cx[0], cy: route.cy[0], r: 2.4 }}
      animate={{ cx: route.cx, cy: route.cy, opacity, r: radius }}
      transition={{
        duration: 3,
        times: route.times,
        ease: "linear",
        repeat: Infinity,
        repeatDelay: 3.8,
        delay,
      }}
    />
  );
}

function SourceNode({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.g
      className="lineage-loader-source"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.7, ease: "easeOut" }}
    >
      <motion.circle
        className="lineage-loader-source-halo"
        cx={SOURCE.x}
        cy={SOURCE.y}
        r="21"
        animate={reduceMotion ? undefined : { r: [20, 24, 20], opacity: [0.16, 0.34, 0.16] }}
        transition={{ duration: 3.4, ease: "easeInOut", repeat: Infinity }}
      />
      <circle className="lineage-loader-source-ring" cx={SOURCE.x} cy={SOURCE.y} r="12" />
      <circle className="lineage-loader-source-core" cx={SOURCE.x} cy={SOURCE.y} r="4" />
    </motion.g>
  );
}

function WaypointNode({ x, y, reduceMotion, delay }: {
  x: number;
  y: number;
  reduceMotion: boolean;
  delay: number;
}) {
  return (
    <motion.g
      className="lineage-loader-waypoint"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.72, delay: reduceMotion ? 0 : delay, ease: "easeOut" }}
      style={{ transformOrigin: `${x}px ${y}px` }}
    >
      <circle className="lineage-loader-waypoint-halo" cx={x} cy={y} r="13" />
      <circle className="lineage-loader-waypoint-node" cx={x} cy={y} r="6" />
    </motion.g>
  );
}

function sampleRoute(segments: CubicSegment[], samplesPerSegment = 18): SampledRoute {
  const points: Point[] = [];

  segments.forEach((segment, segmentIndex) => {
    for (let index = segmentIndex === 0 ? 0 : 1; index <= samplesPerSegment; index += 1) {
      const time = index / samplesPerSegment;
      points.push(cubicPoint(segment, time));
    }
  });

  const distances = points.map((point, index) => {
    if (index === 0) return 0;
    return Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]);
  });
  const totalDistance = distances.reduce((total, distance) => total + distance, 0);
  let travelled = 0;
  const times = distances.map((distance) => {
    travelled += distance;
    return travelled / totalDistance;
  });

  return {
    cx: points.map(([x]) => x),
    cy: points.map(([, y]) => y),
    times,
  };
}

function cubicPoint(segment: CubicSegment, time: number): Point {
  const inverse = 1 - time;
  const [start, controlA, controlB, end] = segment;
  const x = (inverse ** 3 * start[0])
    + (3 * inverse ** 2 * time * controlA[0])
    + (3 * inverse * time ** 2 * controlB[0])
    + (time ** 3 * end[0]);
  const y = (inverse ** 3 * start[1])
    + (3 * inverse ** 2 * time * controlA[1])
    + (3 * inverse * time ** 2 * controlB[1])
    + (time ** 3 * end[1]);
  return [x, y];
}
