import { readPublicFingerprint } from "./manifest.js";

type NextConfig = Readonly<Record<string, unknown>> & {
  readonly env?: Readonly<Record<string, string | undefined>>;
};

export function withRelkit(
  config: NextConfig = {},
  options: { readonly root?: string } = {},
): NextConfig {
  return {
    ...config,
    env: {
      ...config.env,
      NEXT_PUBLIC_RELKIT_PUBLIC_FINGERPRINT: readPublicFingerprint(options.root),
    },
  };
}
