import { ExternalLink } from "lucide-react";
import { SCALAR_API_REFERENCE_URL } from "../../lib/api-reference";

export default function ApiReferencePage() {
  return (
    <div className="api-reference-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">HTTP</p>
          <h1>API Reference</h1>
          <p className="lede">Explore the active generation with Scalar.</p>
        </div>
        <a className="button-link" href={SCALAR_API_REFERENCE_URL} target="_blank" rel="noreferrer">
          Open Scalar API Reference <ExternalLink aria-hidden="true" className="size-4" />
        </a>
      </header>
      <section className="panel" aria-label="Scalar API Reference">
        <p className="supporting-copy">
          Scalar displays the active backend’s OpenAPI document in a separate tab.
        </p>
      </section>
    </div>
  );
}
