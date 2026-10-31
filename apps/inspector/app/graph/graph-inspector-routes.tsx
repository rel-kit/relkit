"use client";

/** Details for routes, route groups and listeners, including the route access section. */
import {
  type Access,
  type AppHierarchy,
  isProtected,
  routeAccess,
} from "../../lib/graph-hierarchy";
import {
  listenedEventId,
  routeMethod,
  routePath,
  routeRequestFields,
  routeGroupRouteIds,
  routeResponses,
  routeStreams,
  targetFunctionId,
} from "../../lib/graph-node-meta";
import {
  type DetailProps,
  Facts,
  NodeButton,
  SchemaDisclosure,
  Section,
} from "./graph-inspector-parts";

function AccessSection({
  hierarchy,
  access,
  onSelect,
}: {
  readonly hierarchy: AppHierarchy;
  readonly access: Access;
  readonly onSelect: (id: string) => void;
}) {
  const auth = hierarchy.platform.auth;
  const open = !isProtected(access);
  const checked = access.session || access.role;
  return (
    <Section title="Access" hint={open ? "public" : "protected"}>
      <Facts
        items={[
          ["Session", access.session ? "Required (401 without one)" : "Not required"],
          ["Role", access.role ? "Checked (403 when not allowed)" : "Not checked"],
          [
            "Enforced by",
            access.middleware.length > 0
              ? "Middleware before the handler"
              : checked
                ? "The handler, through context.auth"
                : "Nothing",
          ],
        ]}
      />
      {(access.middleware.length > 0 || (checked && auth !== undefined)) && (
        <ul className="explorer-relations">
          {access.middleware.map((id) => (
            <NodeButton
              key={id}
              hierarchy={hierarchy}
              id={id}
              onSelect={onSelect}
              hint="middleware"
            />
          ))}
          {checked && auth !== undefined && (
            <NodeButton hierarchy={hierarchy} id={auth.id} onSelect={onSelect} hint="session" />
          )}
        </ul>
      )}
    </Section>
  );
}

export function RouteDetails({ hierarchy, node, onSelect }: DetailProps) {
  const fields = routeRequestFields(node);
  const responses = routeResponses(node);
  const target = targetFunctionId(node);
  return (
    <>
      <Section title="Transport">
        <Facts
          items={[
            ["Method", <code key="m">{routeMethod(node)}</code>],
            ["Path", <code key="p">{routePath(node)}</code>],
            ["Streaming", routeStreams(node) ? "yes" : undefined],
          ]}
        />
      </Section>
      <AccessSection
        hierarchy={hierarchy}
        access={routeAccess(hierarchy, node)}
        onSelect={onSelect}
      />
      {target && (
        <Section title="Handled by">
          <ul className="explorer-relations">
            <NodeButton hierarchy={hierarchy} id={target} onSelect={onSelect} />
          </ul>
        </Section>
      )}
      <Section title="Request" hint={fields.length === 0 ? "no fields" : `${fields.length} fields`}>
        {fields.length > 0 && (
          <table className="explorer-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>From</th>
                <th>Required</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={field.name}>
                  <td>
                    <code>{field.name}</code>
                  </td>
                  <td>{field.location}</td>
                  <td>{field.optional ? "optional" : "yes"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section title="Responses" hint={String(responses.length)}>
        <ul className="explorer-responses">
          {responses.map((response) => (
            <li key={response.id}>
              <SchemaDisclosure
                title={`${response.status} ${response.errorId ?? response.kind}`}
                schema={response.schema}
                open={response.kind === "success"}
              />
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

export function RouteGroupDetails({ hierarchy, node, onSelect }: DetailProps) {
  const routeIds = routeGroupRouteIds(node);
  return (
    <Section title="Routes" hint={String(routeIds.length)}>
      <ul className="explorer-relations">
        {routeIds.map((id) => {
          const route = hierarchy.nodes.get(id);
          return (
            <NodeButton
              key={id}
              hierarchy={hierarchy}
              id={id}
              onSelect={onSelect}
              {...(route === undefined ? {} : { hint: routeMethod(route) ?? "" })}
            />
          );
        })}
      </ul>
    </Section>
  );
}

export function ListenerDetails({ hierarchy, node, onSelect }: DetailProps) {
  const event = listenedEventId(node);
  const target = targetFunctionId(node);
  return (
    <>
      <Section title="Listens to">
        <ul className="explorer-relations">
          {event && <NodeButton hierarchy={hierarchy} id={event} onSelect={onSelect} />}
        </ul>
      </Section>
      {target && (
        <Section title="Runs">
          <ul className="explorer-relations">
            <NodeButton hierarchy={hierarchy} id={target} onSelect={onSelect} />
          </ul>
        </Section>
      )}
    </>
  );
}
