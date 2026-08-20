import { Badge } from "../../components/ui/badge";
import { DataTable, DataTableCell, DataTableEmpty, DataTableHead } from "../../components/ui/table";
import { edgeLabel, type GraphEdge } from "../../lib/graph-model";

export function GraphRelationships({ edges }: { readonly edges: readonly GraphEdge[] }) {
  return (
    <section className="panel relationship-panel" aria-labelledby="relationships-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ACCESSIBLE FALLBACK</p>
          <h2 id="relationships-heading">Relationship table</h2>
        </div>
        <Badge>{edges.length} edges</Badge>
      </div>
      <p className="supporting-copy">
        The table preserves every visible relationship for keyboard and screen-reader navigation.
      </p>
      <DataTable>
        <thead>
          <tr>
            <DataTableHead>Type</DataTableHead>
            <DataTableHead>From</DataTableHead>
            <DataTableHead>To</DataTableHead>
            <DataTableHead>Relationship</DataTableHead>
          </tr>
        </thead>
        <tbody>
          {edges.length === 0 ? (
            <tr>
              <DataTableEmpty>No visible relationships.</DataTableEmpty>
            </tr>
          ) : (
            edges.map((edge, index) => (
              <tr key={`${edge.relationship}:${edge.from}:${edge.to}:${edge.kind}:${index}`}>
                <DataTableCell>
                  <Badge>{edge.relationship}</Badge>
                </DataTableCell>
                <DataTableCell>
                  <code>{bounded(edge.from)}</code>
                </DataTableCell>
                <DataTableCell>
                  <code>{bounded(edge.to)}</code>
                </DataTableCell>
                <DataTableCell>{bounded(edgeLabel(edge))}</DataTableCell>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
    </section>
  );
}

function bounded(value: string): string {
  const clean = value.trim();
  return clean.length <= 96 ? clean : `${clean.slice(0, 64)}…${clean.slice(-20)}`;
}
