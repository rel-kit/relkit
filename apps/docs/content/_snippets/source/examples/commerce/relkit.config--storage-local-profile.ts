assets: docker(
  s3({
    endpoint: binding.url("ASSETS_S3_ENDPOINT"),
    bucketName: binding.string("ASSETS_S3_BUCKET"),
    region: binding.string("ASSETS_S3_REGION"),
    credentials: {
      accessKeyId: binding.secret("ASSETS_S3_ACCESS_KEY_ID"),
      secretAccessKey: binding.secret("ASSETS_S3_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: true,
  }),
),
