import localFont from "next/font/local";

export const heroSans = localFont({
  src: "../../public/fonts/geist-latin.woff2",
  variable: "--hero-sans",
  display: "swap",
  weight: "100 900",
});

export const heroMono = localFont({
  src: "../../public/fonts/geist-mono-latin.woff2",
  variable: "--hero-mono",
  display: "swap",
  weight: "100 900",
});

export const heroCode = localFont({
  src: "../../public/fonts/fira-code.ttf",
  variable: "--hero-code",
  display: "swap",
  weight: "300 700",
  adjustFontFallback: false,
});

export const heroNeon = localFont({
  src: [
    { path: "../../public/fonts/monaspace-neon-regular.otf", weight: "400", style: "normal" },
    { path: "../../public/fonts/monaspace-neon-italic.otf", weight: "400", style: "italic" },
  ],
  variable: "--hero-neon",
  display: "swap",
  adjustFontFallback: false,
});
