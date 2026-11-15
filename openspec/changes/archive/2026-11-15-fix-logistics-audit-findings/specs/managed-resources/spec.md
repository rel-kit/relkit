## ADDED Requirements

### Requirement: Signed uploads carry the bucket's limits

A signed upload URL SHALL bind the content type the caller declares, SHALL be refused for a content type or size the bucket does not allow, and the stored object's content type SHALL be the declared one.

#### Scenario: Upload with a different content type

- **WHEN** a client uploads to a signed URL with a content type other than the one it was issued for
- **THEN** the storage service rejects the upload

#### Scenario: Declared size above the bucket limit

- **WHEN** application code requests a signed upload URL for a size above the bucket's limit
- **THEN** the request fails before a URL is issued
