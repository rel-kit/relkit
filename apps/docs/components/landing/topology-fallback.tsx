/** An authored, deterministic illustration is also the no-WebGL/reduced-motion view. */
export function TopologyFallback() {
  return (
    <svg viewBox="0 0 560 360" fill="none" aria-hidden="true">
      <g transform="translate(280 170) scale(1 .55) rotate(-30)">
        {Array.from({ length: 15 }, (_, index) => (
          <g key={index} style={{ stroke: "var(--topo-grid)" }} strokeWidth="1">
            <path d={`M${index * 28 - 196} -196V196`} />
            <path d={`M-196 ${index * 28 - 196}H196`} />
          </g>
        ))}
        {[
          [-84, -84],
          [84, -84],
          [0, 0],
          [-84, 84],
          [84, 84],
        ].map(([x, y], index) => (
          <g key={index}>
            <path d={`M0 0H${x}V${y}`} style={{ stroke: "var(--topo-wire)" }} />
            <rect
              x={x! - 20}
              y={y! - 20}
              width="40"
              height="40"
              style={{
                fill: index === 2 ? "var(--topo-center)" : "var(--topo-node)",
                stroke: "var(--topo-node-line)",
              }}
            />
            <rect
              x={x! - 12}
              y={y! - 12}
              width="24"
              height="24"
              style={{ stroke: index === 2 ? "var(--topo-center-inner)" : "var(--topo-inner)" }}
            />
          </g>
        ))}
        {[
          [-140, 28],
          [112, 140],
          [28, -168],
        ].map(([x, y], index) => (
          <rect
            key={index}
            x={x}
            y={y}
            width="28"
            height="28"
            style={{ stroke: "var(--topo-wire)" }}
          />
        ))}
      </g>
      <g
        style={{ fill: "var(--topo-label)" }}
        fontFamily="monospace"
        fontSize="10"
        textAnchor="middle"
      >
        <text x="181" y="112">
          ROUTES
        </text>
        <text x="325" y="66">
          FUNCTIONS
        </text>
        <text x="280" y="213">
          SERVICES
        </text>
        <text x="245" y="283">
          EVENTS
        </text>
        <text x="425" y="237">
          RESOURCES
        </text>
      </g>
    </svg>
  );
}
