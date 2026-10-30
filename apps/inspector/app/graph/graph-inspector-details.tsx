"use client";

/** Details for functions, services, tables, events and channels. */
import {
  capabilityDetail,
  channelClient,
  channelEvents,
  channelParams,
  eventPayload,
  eventVersion,
  functionErrors,
  functionInput,
  functionOutput,
  type TableSpec,
} from "../../lib/graph-node-meta";
import { Relations } from "./graph-inspector-connections";
import {
  type DetailProps,
  Facts,
  NodeButton,
  SchemaDisclosure,
  Section,
} from "./graph-inspector-parts";

export function FunctionDetails({ hierarchy, node, onSelect }: DetailProps) {
  const errors = functionErrors(node);
  return (
    <>
      <Section title="Contract">
        <SchemaDisclosure title="Input" schema={functionInput(node)} />
        <SchemaDisclosure title="Output" schema={functionOutput(node)} />
      </Section>
      {errors.length > 0 && (
        <Section title="May fail with" hint={String(errors.length)}>
          <ul className="explorer-relations">
            {errors.map((error) => (
              <NodeButton
                key={error.id}
                hierarchy={hierarchy}
                id={error.id}
                onSelect={onSelect}
                {...(error.status === undefined ? {} : { hint: String(error.status) })}
              />
            ))}
          </ul>
        </Section>
      )}
      <Relations
        hierarchy={hierarchy}
        node={node}
        onSelect={onSelect}
        exclude={["May fail with"]}
      />
    </>
  );
}

export function ServiceDetails({ hierarchy, node, onSelect }: DetailProps) {
  const domain = hierarchy.domains.find((item) => item.id === node.id);
  const capability = capabilityDetail(node);
  return (
    <>
      {capability && (
        <Section title="Capability">
          <Facts items={[["Kind", capability]]} />
        </Section>
      )}
      {domain && (
        <Section title="Contents">
          <ul className="explorer-counts">
            {(
              [
                ["Routes", domain.routes],
                ["Functions", domain.functions],
                ["Listeners", domain.listeners],
                ["Events", domain.events],
                ["Channels", domain.channels],
                ["Agents", domain.agents],
                ["Tools", domain.tools],
                ["Jobs", domain.jobs],
              ] as const
            )
              .filter(([, items]) => items.length > 0)
              .map(([label, items]) => (
                <li key={label}>
                  <b>{items.length}</b> {label}
                </li>
              ))}
          </ul>
        </Section>
      )}
      {node.id === hierarchy.platform.database?.id && (
        <Section title="Tables" hint={String(hierarchy.platform.tables.length)}>
          <ul className="explorer-relations">
            {hierarchy.platform.tables.map((table) => (
              <NodeButton key={table.id} hierarchy={hierarchy} id={table.id} onSelect={onSelect} />
            ))}
          </ul>
        </Section>
      )}
      <Relations hierarchy={hierarchy} node={node} onSelect={onSelect} exclude={["Contains"]} />
    </>
  );
}

export function TableDetails({ hierarchy, node, onSelect }: DetailProps) {
  const table = node.meta?.table as TableSpec | undefined;
  return (
    <>
      {table && (
        <Section title="Columns" hint={String(table.columns.length)}>
          <table className="explorer-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Type</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {table.columns.map((column) => (
                <tr key={column.name}>
                  <td>
                    <code>{column.name}</code>
                  </td>
                  <td>{column.dataType}</td>
                  <td>
                    {[
                      column.primaryKey ? "pk" : undefined,
                      column.unique ? "unique" : undefined,
                      column.notNull ? "not null" : "nullable",
                      column.hasDefault ? "default" : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {table.selectors.length > 0 && (
            <Facts
              items={[
                ["Lookups", table.selectors.map((selector) => selector.join(" + ")).join(", ")],
                ["Database name", <code key="d">{table.databaseName}</code>],
              ]}
            />
          )}
        </Section>
      )}
      <Relations hierarchy={hierarchy} node={node} onSelect={onSelect} />
    </>
  );
}

export function EventDetails({ hierarchy, node, onSelect }: DetailProps) {
  const version = eventVersion(node);
  return (
    <>
      <Section title="Payload" {...(version === undefined ? {} : { hint: `v${version}` })}>
        <SchemaDisclosure title="Fields" schema={eventPayload(node)} open />
      </Section>
      <Relations hierarchy={hierarchy} node={node} onSelect={onSelect} />
    </>
  );
}

export function ChannelDetails({ hierarchy, node, onSelect }: DetailProps) {
  const events = channelEvents(node);
  return (
    <>
      <Section title="Channel">
        <Facts items={[["Client access", channelClient(node)]]} />
        <SchemaDisclosure title="Parameters" schema={channelParams(node)} />
      </Section>
      <Section title="Messages" hint={String(events.length)}>
        {events.map((event) => (
          <SchemaDisclosure key={event.name} title={event.name} schema={event.schema} />
        ))}
      </Section>
      <Relations hierarchy={hierarchy} node={node} onSelect={onSelect} />
    </>
  );
}
