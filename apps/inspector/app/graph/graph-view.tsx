import { edgeLabel, type GraphEdge, type GraphSnapshot } from "../../lib/graph-model";
import { layoutGraph } from "../../lib/graph-layout";

export function GraphView({ graph }: { readonly graph: GraphSnapshot }) {
  const layout = layoutGraph(graph);
  const edges = [...graph.declaredEdges, ...graph.observedEdges];
  return (
    <>
      <GraphLegend />
      <section className="panel graph-panel" aria-labelledby="canvas-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">DETERMINISTIC GRID</p>
            <h2 id="canvas-heading">Capability graph</h2>
          </div>
          <span className="badge">{layout.nodes.length} nodes</span>
        </div>
        <p className="supporting-copy">
          Nodes are sorted by kind and ID, then placed in a fixed grid. Scroll the canvas to inspect
          larger graphs without a force simulation.
        </p>
        <div className="graph-viewport" role="region" aria-labelledby="canvas-heading" tabIndex={0}>
          <p className="sr-only" id="canvas-description">
            The visual graph is decorative. The relationship list below provides an accessible
            reading order for every declared and observed edge.
          </p>
          <div
            className="graph-canvas"
            style={{ width: layout.width, height: layout.height }}
            aria-describedby="canvas-description"
          >
            <svg
              className="graph-lines"
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              width={layout.width}
              height={layout.height}
              aria-hidden="true"
            >
              {layout.edges.map((edge) => (
                <line
                  className={`graph-edge graph-edge--${edge.relationship}`}
                  data-edge-type={edge.relationship}
                  key={edge.key}
                  x1={edge.x1}
                  y1={edge.y1}
                  x2={edge.x2}
                  y2={edge.y2}
                />
              ))}
            </svg>
            {layout.nodes.map((position) => (
              <article
                className="graph-node"
                key={position.node.id}
                style={{
                  left: position.x,
                  top: position.y,
                  width: position.width,
                  height: position.height,
                }}
                aria-label={`${bounded(position.node.kind)} ${bounded(position.node.id)}`}
              >
                <span className="graph-node-kind">{bounded(position.node.kind)}</span>
                <strong>{bounded(position.node.id)}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>
      <RelationshipList edges={edges} />
    </>
  );
}

function GraphLegend() {
  return (
    <section className="graph-legend" aria-label="Relationship legend">
      <span className="graph-legend-item">
        <span className="legend-line legend-line--declared" aria-hidden="true" />
        <span>Declared relationship</span>
      </span>
      <span className="graph-legend-item">
        <span className="legend-line legend-line--observed" aria-hidden="true" />
        <span>Observed at runtime</span>
      </span>
    </section>
  );
}

function RelationshipList({ edges }: { readonly edges: readonly GraphEdge[] }) {
  return (
    <section className="panel relationship-panel" aria-labelledby="relationships-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">API RELATIONSHIPS</p>
          <h2 id="relationships-heading">Declared and observed edges</h2>
        </div>
        <span className="badge">{edges.length} edges</span>
      </div>
      {edges.length === 0 ? (
        <p className="supporting-copy">No relationships are reported by the active graph.</p>
      ) : (
        <ul className="relationship-list">
          {edges.map((edge, index) => (
            <li
              className={`relationship-row relationship-row--${edge.relationship}`}
              data-edge-type={edge.relationship}
              key={`${edge.relationship}:${edge.from}:${edge.to}:${edge.kind}:${index}`}
            >
              <span className="relationship-marker" aria-hidden="true" />
              <span className="relationship-type">
                {edge.relationship === "declared" ? "Declared" : "Observed"}
              </span>
              <code>{bounded(edge.from)}</code>
              <span aria-hidden="true">→</span>
              <code>{bounded(edge.to)}</code>
              <span className="relationship-kind">{bounded(edgeLabel(edge))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function bounded(value: string): string {
  const clean = value.trim();
  return clean.length <= 96 ? clean : `${clean.slice(0, 64)}…${clean.slice(-20)}`;
}
