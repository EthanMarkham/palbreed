import { motion, useReducedMotion } from "motion/react";

const ROUTE_PATH = "M34 174 C70 174 88 132 122 132 C156 132 176 76 216 78 C258 80 268 146 306 144 C342 142 356 98 396 100 C438 102 452 56 486 56";
const ROUTE_NODES = [
  { x: 34, y: 174 },
  { x: 122, y: 132 },
  { x: 216, y: 78 },
  { x: 306, y: 144 },
  { x: 396, y: 100 },
  { x: 486, y: 56 },
] as const;
const FINAL_ROUTE_NODE = ROUTE_NODES[ROUTE_NODES.length - 1];
const ROUTE_DURATION = 1.65;
const ROUTE_LOOP_DELAY = 0.35;

export default function BuilderSolveAnimation() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="builder-solving"
      role="status"
      aria-label="Finding a breeding route"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 1.012 }}
      transition={{ duration: reduceMotion ? 0.01 : 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="builder-solving-copy">
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduceMotion ? 0 : 0.12, duration: reduceMotion ? 0.01 : 0.35 }}
        >
          CHECKING POSSIBLE ROUTES
        </motion.span>
        <motion.h2
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.18, duration: reduceMotion ? 0.01 : 0.38 }}
        >
          Finding a route
        </motion.h2>
        <p>You can keep using the app. Changing a build setting cancels this search.</p>
      </div>

      <svg className="builder-solve-map" viewBox="0 0 520 220" aria-hidden="true">
        <defs>
          <linearGradient id="solve-path-gradient" x1="24" y1="180" x2="500" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#63bca5" />
            <stop offset="0.5" stopColor="#d8f29a" />
            <stop offset="1" stopColor="#f0ad79" />
          </linearGradient>
          <filter id="solve-path-glow" x="-30%" y="-50%" width="160%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path className="builder-solve-path-ghost" d={ROUTE_PATH} />
        <motion.path
          className="builder-solve-path"
          d={ROUTE_PATH}
          pathLength={1}
          initial={reduceMotion ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
          animate={reduceMotion
            ? { pathLength: 1, opacity: 1 }
            : { pathLength: [0, 1, 1], opacity: [0, 1, 0] }}
          transition={reduceMotion
            ? { duration: 0.01 }
            : {
                duration: ROUTE_DURATION,
                times: [0, 0.82, 1],
                repeat: Infinity,
                repeatDelay: ROUTE_LOOP_DELAY,
                ease: [0.32, 0, 0.18, 1],
              }}
        />

        {ROUTE_NODES.map((node, index) => (
          <g key={`${node.x}-${node.y}`}>
            <motion.circle
              className="builder-solve-node-ring"
              cx={node.x}
              cy={node.y}
              r="12"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={reduceMotion
                ? { opacity: 0.45, scale: 1 }
                : { opacity: [0, 0.58, 0], scale: [0.4, 1, 1.7] }}
              transition={{
                delay: reduceMotion ? 0 : index * 0.2,
                duration: reduceMotion ? 0.01 : ROUTE_DURATION,
                repeat: reduceMotion ? 0 : Infinity,
                repeatDelay: ROUTE_LOOP_DELAY,
                ease: "easeOut",
              }}
              style={{ transformOrigin: `${node.x}px ${node.y}px` }}
            />
            <motion.circle
              className="builder-solve-node"
              cx={node.x}
              cy={node.y}
              r="5"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: reduceMotion ? 0 : 0.08 + index * 0.2,
                duration: reduceMotion ? 0.01 : 0.28,
                type: "spring",
                stiffness: 220,
                damping: 18,
              }}
              style={{ transformOrigin: `${node.x}px ${node.y}px` }}
            />
          </g>
        ))}

        <motion.circle
          className="builder-solve-tracer"
          r="4.5"
          filter="url(#solve-path-glow)"
          initial={{ cx: ROUTE_NODES[0].x, cy: ROUTE_NODES[0].y, opacity: 0 }}
          animate={reduceMotion
            ? { cx: FINAL_ROUTE_NODE.x, cy: FINAL_ROUTE_NODE.y, opacity: 1 }
            : {
                cx: ROUTE_NODES.map(({ x }) => x),
                cy: ROUTE_NODES.map(({ y }) => y),
                opacity: [0, 1, 1, 1, 1, 0],
              }}
          transition={reduceMotion
            ? { duration: 0.01 }
            : {
                duration: ROUTE_DURATION,
                times: [0, 0.2, 0.4, 0.6, 0.8, 1],
                repeat: Infinity,
                repeatDelay: ROUTE_LOOP_DELAY,
                ease: "easeInOut",
              }}
        />
      </svg>

      <div className="builder-solving-progress" aria-hidden="true">
        <motion.span
          initial={reduceMotion ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 1 }}
          animate={reduceMotion
            ? { scaleX: 1, opacity: 1 }
            : { scaleX: [0, 1, 1], opacity: [1, 1, 0] }}
          transition={reduceMotion
            ? { duration: 0.01 }
            : {
                duration: ROUTE_DURATION,
                times: [0, 0.82, 1],
                repeat: Infinity,
                repeatDelay: ROUTE_LOOP_DELAY,
                ease: [0.32, 0, 0.18, 1],
              }}
        />
      </div>
    </motion.div>
  );
}
