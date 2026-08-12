import { motion, useReducedMotion } from "motion/react";

const LEFT_BRANCH = "M68 42 C100 42 112 84 160 84";
const RIGHT_BRANCH = "M252 42 C220 42 208 84 160 84";
const RESOLVED_PATH = "M160 84 C160 108 195 128 252 128";

type ImportPathLoadingOverlayProps = {
  message: string;
};

export default function ImportPathLoadingOverlay({ message }: ImportPathLoadingOverlayProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const importing = message.startsWith("Importing");
  const pathTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.72, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <motion.div
      className="import-path-overlay"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.01 }}
      transition={{ duration: reduceMotion ? 0.01 : 0.2, delay: reduceMotion ? 0 : 0.08 }}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <motion.div
        className="import-path-content"
        initial={reduceMotion ? false : { opacity: 0, y: 7, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
        transition={{ duration: reduceMotion ? 0.01 : 0.28, delay: reduceMotion ? 0 : 0.1 }}
      >
        <span className="import-path-kicker">
          <i aria-hidden="true" />
          {importing ? "ASSEMBLING LINEAGE" : "TRACING SAVE PATH"}
        </span>

        <svg
          className="import-lineage-map"
          viewBox="0 0 320 170"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="lineage-route" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#79b7a5" />
              <stop offset="0.55" stopColor="#23856d" />
              <stop offset="1" stopColor="#b3e75f" />
            </linearGradient>
            <radialGradient id="lineage-child" cx="50%" cy="42%" r="58%">
              <stop offset="0" stopColor="#efffcf" />
              <stop offset="1" stopColor="#b3e75f" />
            </radialGradient>
            <filter id="lineage-glow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path className="import-lineage-track" d={LEFT_BRANCH} />
          <path className="import-lineage-track" d={RIGHT_BRANCH} />
          <path className="import-lineage-track" d={RESOLVED_PATH} />

          <motion.path
            className="import-lineage-route"
            d={LEFT_BRANCH}
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0.35 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ ...pathTransition, delay: reduceMotion ? 0 : 0.14 }}
          />
          <motion.path
            className="import-lineage-route"
            d={RIGHT_BRANCH}
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0.35 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ ...pathTransition, delay: reduceMotion ? 0 : 0.26 }}
          />
          <motion.path
            className="import-lineage-route is-resolved"
            d={RESOLVED_PATH}
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0.35 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ ...pathTransition, delay: reduceMotion ? 0 : 0.58 }}
          />

          <LineageNode x={68} y={42} label="A" reduceMotion={reduceMotion} delay={0.08} />
          <LineageNode x={252} y={42} label="B" reduceMotion={reduceMotion} delay={0.18} />

          <motion.g
            className="import-lineage-merge"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.3, delay: reduceMotion ? 0 : 0.62 }}
            style={{ transformOrigin: "160px 84px" }}
          >
            <circle cx="160" cy="84" r="13" />
            <path d="m154 84 4 4 8-9" />
          </motion.g>

          <motion.g
            className="import-lineage-result"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.72 }}
            animate={reduceMotion
              ? { opacity: 1, scale: 1 }
              : { opacity: [0, 1, 1], scale: [0.72, 1.08, 1] }}
            transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : 0.92 }}
            style={{ transformOrigin: "252px 128px" }}
          >
            <circle className="import-lineage-result-halo" cx="252" cy="128" r="24" />
            <circle className="import-lineage-result-node" cx="252" cy="128" r="17" />
            <path d="m245 128 5 5 10-12" />
          </motion.g>

          {!reduceMotion ? (
            <g className="import-lineage-lights" filter="url(#lineage-glow)">
              <circle r="3.5">
                <animateMotion dur="1.8s" begin="0s" repeatCount="indefinite" path={LEFT_BRANCH} />
              </circle>
              <circle r="3.5">
                <animateMotion dur="1.8s" begin="0.18s" repeatCount="indefinite" path={RIGHT_BRANCH} />
              </circle>
              <circle r="4">
                <animateMotion dur="1.8s" begin="0.72s" repeatCount="indefinite" path={RESOLVED_PATH} />
              </circle>
            </g>
          ) : null}
        </svg>

        <div className="import-path-copy">
          <strong>{importing ? "Building your world" : "Finding your worlds"}</strong>
          <p>{message}</p>
        </div>
        <span className="import-path-footnote">Local only · your save stays on this device</span>
      </motion.div>
    </motion.div>
  );
}

function LineageNode({
  x,
  y,
  label,
  reduceMotion,
  delay,
}: {
  x: number;
  y: number;
  label: string;
  reduceMotion: boolean;
  delay: number;
}) {
  return (
    <motion.g
      className="import-lineage-parent"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.72 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.34, delay: reduceMotion ? 0 : delay }}
      style={{ transformOrigin: `${x}px ${y}px` }}
    >
      <circle className="import-lineage-parent-halo" cx={x} cy={y} r="20" />
      <circle className="import-lineage-parent-node" cx={x} cy={y} r="15" />
      <text x={x} y={y + 0.5}>{label}</text>
    </motion.g>
  );
}
