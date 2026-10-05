# @relkit/providers-standard

This package retains an empty compatibility entrypoint for existing RELKIT release
and tooling references. It exports no provider factories or runtime services.

Redis and S3 support lives in `@relkit/redis` and `@relkit/s3`. Legacy implementations
were removed when integration-backed runtimes replaced them. Removing this package
requires a separate coordinated migration of release metadata, project references,
scope scans and boundary guards.
