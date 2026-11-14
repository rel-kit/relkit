import { CodeBlock } from "../components/blocks/code-block";
import { Section } from "../components/blocks/section";
import type { InspectorObject } from "../lib/api-types";
import { functionCaptures, type CaptureView } from "../lib/function-capture";

const NOT_RECORDED = "HTTP headers and raw request and response bodies are not recorded.";

/**
 * The function's input and result, as the application's redacted capture kept them, and an
 * honest line about what is never recorded. A request that no function handled says so instead
 * of showing empty boxes.
 */
export function RequestExchangePanel({
  request,
  spans,
}: {
  readonly request: InspectorObject;
  readonly spans: readonly InspectorObject[];
}) {
  const captures = functionCaptures(request, spans);
  const off = captures?.input.state === "off" || captures?.output.state === "off";
  return (
    <Section
      id="request-exchange"
      title="Function input and result"
      description={captures ? `From the span of ${captures.functionId}` : undefined}
    >
      {captures === undefined ? (
        <p className="m-0 text-xs text-foreground">
          This request did not reach a function, so there is no input or result to show. Requests
          handled by the authentication mount or a system route, and requests rejected before the
          function ran, have none.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Capture
            title="Function input"
            value={captures.input}
            empty="The function took no input."
          />
          <Capture
            title="Function result"
            value={captures.output}
            empty="The function returned no value."
          />
        </div>
      )}
      <p className="mt-3 mb-0 text-xs text-muted-foreground">
        {NOT_RECORDED}
        {off
          ? " Input and result are kept only when the application config sets telemetry.redaction to the development-redacted mode."
          : ""}
      </p>
    </Section>
  );
}

function Capture({
  title,
  value,
  empty,
}: {
  readonly title: string;
  readonly value: CaptureView;
  readonly empty: string;
}) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {value.state === "captured" ? (
        <>
          <CodeBlock value={value.content} label={title.toLowerCase()} maxHeight="14rem" />
          <p className="m-0 text-[11px] text-muted-foreground">
            Redacted: protected values show as [redacted]. {value.bytes.toLocaleString("en-US")}{" "}
            bytes.
          </p>
        </>
      ) : (
        <p className="schema-empty m-0 rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
          {value.state === "truncated"
            ? `Larger than the ${value.limit.toLocaleString("en-US")}-byte capture limit, so it was not kept.`
            : value.state === "empty"
              ? empty
              : "Not captured. Capture is off in this application."}
        </p>
      )}
    </div>
  );
}
