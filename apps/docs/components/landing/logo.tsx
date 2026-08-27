import Image from "next/image";

export function RelkitLogo({ size = 34 }: { readonly size?: number }) {
  return (
    <Image className="landing-logo" src="/logo.svg" alt="" width={size} height={size} priority />
  );
}
