"use client";

import dynamic from "next/dynamic";

const Spline = dynamic(() => import("@splinetool/react-spline"), {
  ssr: false,
  loading: () => <span className="landing-scene-loader">Loading interactive model…</span>,
});

export function HeroScene() {
  return (
    <Spline
      className="landing-spline"
      scene="https://prod.spline.design/mZBrYNcnoESGlTUG/scene.splinecode"
    />
  );
}
