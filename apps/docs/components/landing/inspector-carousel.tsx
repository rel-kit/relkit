"use client";

import { Link } from "fumadocs-core/framework";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import styles from "./landing-showcase.module.css";

/** Screens captured from the Inspector at 1280×900, once per theme (public/inspector). */
const slides = [
  {
    id: "overview",
    label: "Overview",
    caption: "Health, traffic and every capability of the running application.",
  },
  {
    id: "route",
    label: "Route",
    caption: "A route's contract, with a request composer built from its schema.",
  },
  {
    id: "requests",
    label: "Requests",
    caption: "Retained, redacted requests, filtered by status, method and path.",
  },
  {
    id: "trace",
    label: "Trace",
    caption: "One request through route, function and cache, step by step.",
  },
  {
    id: "logs",
    label: "Logs",
    caption: "Structured logs, correlated with the request that wrote them.",
  },
] as const;

const themes = ["light", "dark"] as const;

/**
 * Cycles through Inspector screens; each slide shows the screenshot of the page's current theme,
 * chosen in CSS from the data-theme attribute so the server render already matches.
 */
export function InspectorCarousel() {
  const [active, setActive] = useState(0);
  const count = slides.length;
  const go = (index: number) => setActive((index + count) % count);
  const current = slides[active]!;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") go(active + 1);
    else if (event.key === "ArrowLeft") go(active - 1);
    else return;
    event.preventDefault();
  };

  return (
    <section
      className={styles.carousel}
      aria-roledescription="carousel"
      aria-label="RelKit Inspector screens"
      onKeyDown={onKeyDown}
    >
      <div className={styles.inspector}>
        <div className={styles.inspectorBar}>
          <span>
            <i /> 127.0.0.1:3210
          </span>
          <Link href="/docs/modules/operations/inspector">
            RelKit Inspector <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <div className={styles.slides}>
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              className={styles.slide}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${count}: ${slide.label}`}
              aria-hidden={index !== active}
              data-active={index === active}
            >
              {themes.map((theme) => (
                <img
                  key={theme}
                  className={theme === "dark" ? styles.inspectorDark : styles.inspectorLight}
                  src={`/inspector/${slide.id}-${theme}.webp`}
                  alt={`RelKit Inspector ${slide.label} page`}
                  width={1280}
                  height={900}
                  loading="lazy"
                  decoding="async"
                  sizes="(max-width: 560px) 90vw, (max-width: 1200px) 85vw, 992px"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.carouselControls}>
        <button type="button" onClick={() => go(active - 1)} aria-label="Previous screen">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <div className={styles.carouselTabs} role="group" aria-label="Choose a screen">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              aria-current={index === active}
              onClick={() => go(index)}
            >
              {slide.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => go(active + 1)} aria-label="Next screen">
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <p className={styles.carouselCaption} aria-live="polite">
        {current.caption}
      </p>
    </section>
  );
}
