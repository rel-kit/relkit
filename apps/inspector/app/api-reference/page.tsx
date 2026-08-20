const apiReferenceUrl = "/_zsys/backend/_zsys/v1/api-reference";

export default function ApiReferencePage() {
  return (
    <div className="api-reference-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">HTTP</p>
          <h1>API Reference</h1>
          <p className="lede">Explore the active generation with Scalar.</p>
        </div>
        <a
          className="button-link button-link--quiet"
          href={apiReferenceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open in new tab
        </a>
      </header>
      <iframe className="api-reference-frame" src={apiReferenceUrl} title="Scalar API Reference" />
    </div>
  );
}
