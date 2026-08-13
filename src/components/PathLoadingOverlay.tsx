import { motion, useReducedMotion } from "motion/react";

const LEFT_BRANCH = "M68 42 C100 42 112 84 160 84";
const RIGHT_BRANCH = "M252 42 C220 42 208 84 160 84";
const RESOLVED_PATH = "M160 84 C160 108 195 128 252 128";

const LEFT_POINTS = { cx: [68, 92, 112, 135, 160], cy: [42, 44, 68, 82, 84] };
const RIGHT_POINTS = { cx: [252, 228, 208, 185, 160], cy: [42, 44, 68, 82, 84] };
const RESULT_POINTS = { cx: [160, 164, 190, 222, 252], cy: [84, 104, 122, 128, 128] };

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
    : { duration: 0.78, ease: [0.22, 1, 0.36, 1] as const };
  const kicker = isBreeding ? "TRACING LINEAGE" : importing ? "ASSEMBLING LINEAGE" : "TRACING SAVE PATH";
  const title = isBreeding ? "Finding the best path" : importing ? "Building your world" : "Finding your worlds";
  const footnote = isBreeding
    ? "Comparing parents · passives · IVs · hatch odds"
    : "Local only · your save stays on this device";

  return (
    <motion.div
      className={`path-loading-overlay is-${variant}`}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.006 }}
      transition={{ duration: reduceMotion ? 0.01 : 0.24, delay: reduceMotion ? 0 : 0.1 }}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <motion.div
        className="path-loading-content"
        initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -5, scale: 0.992 }}
        transition={{ duration: reduceMotion ? 0.01 : 0.34, delay: reduceMotion ? 0 : 0.14, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="path-loading-kicker">
          <motion.i
            aria-hidden="true"
            animate={reduceMotion ? undefined : { opacity: [0.55, 1, 0.55], scale: [0.84, 1.08, 0.84] }}
            transition={{ duration: 1.7, ease: "easeInOut", repeat: Infinity }}
          />
          {kicker}
        </span>

        <svg className="lineage-loader-map" viewBox="0 0 320 170" aria-hidden="true">
          <defs>
            <linearGradient id="lineage-loader-route" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#79b7a5" />
              <stop offset="0.55" stopColor="#23856d" />
              <stop offset="1" stopColor="#b3e75f" />
            </linearGradient>
            <radialGradient id="lineage-loader-child" cx="50%" cy="42%" r="58%">
              <stop offset="0" stopColor="#efffcf" />
              <stop offset="1" stopColor="#b3e75f" />
            </radialGradient>
            <filter id="lineage-loader-glow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path className="lineage-loader-track" d={LEFT_BRANCH} />
          <path className="lineage-loader-track" d={RIGHT_BRANCH} />
          <path className="lineage-loader-track" d={RESOLVED_PATH} />

          <motion.path
            className="lineage-loader-route"
            d={LEFT_BRANCH}
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0.3 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ ...pathTransition, delay: reduceMotion ? 0 : 0.16 }}
          />
          <motion.path
            className="lineage-loader-route"
            d={RIGHT_BRANCH}
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0.3 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ ...pathTransition, delay: reduceMotion ? 0 : 0.24 }}
          />
          <motion.path
            className="lineage-loader-route is-resolved"
            d={RESOLVED_PATH}
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0.3 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ ...pathTransition, delay: reduceMotion ? 0 : 0.7 }}
          />

          <LineageNode x={68} y={42} label="A" reduceMotion={reduceMotion} delay={0.06} />
          <LineageNode x={252} y={42} label="B" reduceMotion={reduceMotion} delay={0.14} />

          <motion.g
            className="lineage-loader-merge"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.55 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: reduceMotion ? "tween" : "spring", duration: reduceMotion ? 0 : 0.46, bounce: 0.28, delay: reduceMotion ? 0 : 0.68 }}
            style={{ transformOrigin: "160px 84px" }}
          >
            <circle cx="160" cy="84" r="13" />
            <path d={isBreeding ? "M154 84h12M160 78v12" : "m154 84 4 4 8-9"} />
          </motion.g>

          <motion.g
            className={`lineage-loader-result${isBreeding ? " is-breeding" : ""}`}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.68 }}
            animate={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: [0, 1, 1], scale: [0.68, 1.07, 1] }}
            transition={{ duration: reduceMotion ? 0 : 0.56, delay: reduceMotion ? 0 : 1.08, times: [0, 0.66, 1], ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: "252px 128px" }}
          >
            <motion.circle
              className="lineage-loader-result-halo"
              cx="252"
              cy="128"
              r="24"
              animate={reduceMotion ? undefined : { r: [22, 26, 22], opacity: [0.45, 0.92, 0.45] }}
              transition={{ duration: 2.1, ease: "easeInOut", repeat: Infinity, delay: 1.15 }}
            />
            <circle className="lineage-loader-result-node" cx="252" cy="128" r="17" />
            <path d={isBreeding ? "M252 120l8 8-8 8-8-8z" : "m245 128 5 5 10-12"} />
          </motion.g>

          {!reduceMotion ? (
            <g className="lineage-loader-lights" filter="url(#lineage-loader-glow)">
              <RouteLight points={LEFT_POINTS} delay={1.06} />
              <RouteLight points={RIGHT_POINTS} delay={1.22} />
              <RouteLight points={RESULT_POINTS} delay={1.78} emphasize />
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

function RouteLight({ points, delay, emphasize = false }: {
  points: { cx: number[]; cy: number[] };
  delay: number;
  emphasize?: boolean;
}) {
  return (
    <motion.circle
      initial={{ opacity: 0, cx: points.cx[0], cy: points.cy[0], r: emphasize ? 3.2 : 2.8 }}
      animate={{
        cx: points.cx,
        cy: points.cy,
        opacity: [0, 1, 1, 1, 0],
        r: emphasize ? [3.2, 4.2, 4.2, 4.2, 3.2] : [2.8, 3.7, 3.7, 3.7, 2.8],
      }}
      transition={{ duration: 1.55, times: [0, 0.12, 0.46, 0.88, 1], ease: "linear", repeat: Infinity, repeatDelay: 0.32, delay }}
    />
  );
}

function LineageNode({ x, y, label, reduceMotion, delay }: {
  x: number;
  y: number;
  label: string;
  reduceMotion: boolean;
  delay: number;
}) {
  return (
    <motion.g
      className="lineage-loader-parent"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: reduceMotion ? "tween" : "spring", duration: reduceMotion ? 0 : 0.5, bounce: 0.2, delay: reduceMotion ? 0 : delay }}
      style={{ transformOrigin: `${x}px ${y}px` }}
    >
      <circle className="lineage-loader-parent-halo" cx={x} cy={y} r="20" />
      <circle className="lineage-loader-parent-node" cx={x} cy={y} r="15" />
      <text x={x} y={y + 0.5}>{label}</text>
    </motion.g>
  );
}
