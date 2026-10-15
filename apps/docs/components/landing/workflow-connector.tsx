import styles from "./workflow-motion.module.css";

const leftBranch = "M160 0V28H80V72";
const rightBranch = "M160 0V28H240V72";

/** Two branches show the same application model reaching independently owned resources. */
export function WorkflowConnector() {
  return (
    <svg
      className={styles.connector}
      width="320"
      height="72"
      viewBox="0 0 320 72"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M160 0V28M80 72V28H240V72"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity=".3"
      />
      <path
        className={styles.trail}
        data-flow-motion=""
        d={leftBranch}
        pathLength="100"
        stroke="currentColor"
      />
      <path
        className={`${styles.trail} ${styles.trailRight}`}
        data-flow-motion=""
        d={rightBranch}
        pathLength="100"
        stroke="currentColor"
      />
      {[styles.packetLeft, styles.packetRight].map((className, index) => (
        <g key={index} className={className} data-flow-motion="" fill="currentColor">
          <circle r="9" opacity=".12" />
          <circle r="4" />
        </g>
      ))}
    </svg>
  );
}
