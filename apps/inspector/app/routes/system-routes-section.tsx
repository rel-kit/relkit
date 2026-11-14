"use client";

import { useEffect, useState } from "react";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { systemRoutes, tailCursor, type SystemRoute } from "../../lib/system-routes";
import { Section } from "../../components/blocks/section";
import { EntityList, MethodChip, Quiet } from "../domains/catalog-kit";

/**
 * The routes RelKit handles itself, apart from the declared routes. They have no declaration to
 * open, so each row leads to the requests they handled; none can be sent as a request from here.
 */
export function SystemRoutesSection() {
  const [routes, setRoutes] = useState<readonly SystemRoute[]>();
  useEffect(() => {
    let current = true;
    const api = createInspectorClient();
    void api
      .list<InspectorObject>("routes", { limit: 1 })
      .then(async (first) => {
        const tail = await api.list<InspectorObject>("routes", {
          cursor: tailCursor(first.total ?? 0),
          limit: 100,
        });
        if (current) setRoutes(systemRoutes(tail.items));
      })
      .catch(() => current && setRoutes([]));
    return () => {
      current = false;
    };
  }, []);
  if (routes === undefined || routes.length === 0) return null;
  return (
    <Section
      id="system-routes"
      aria-labelledby="system-routes-heading"
      title={<span id="system-routes-heading">System routes</span>}
      description="Handled by RelKit itself, not declared by the application"
      flush
    >
      <EntityList
        label="System routes"
        empty=""
        rows={routes.map((route) => ({
          key: route.id,
          href: `/requests?routeId=${encodeURIComponent(route.id)}`,
          lead: <MethodChip method={route.method} />,
          title: route.path,
          detail: route.description,
          trailing: (
            <>
              {route.prefix ? <Quiet>every path under it</Quiet> : null}
              <span className="text-link text-xs">View requests</span>
            </>
          ),
        }))}
      />
    </Section>
  );
}
