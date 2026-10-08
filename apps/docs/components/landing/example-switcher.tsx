"use client";

import { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "fumadocs-ui/components/ui/tabs";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useReducedMotion } from "motion/react";
import * as motion from "motion/react-m";
import type { HeroExample } from "./hero-examples";
import { HeroCodePanels } from "./hero-code-panels";

export function ExampleSwitcher({ examples }: { readonly examples: readonly HeroExample[] }) {
  const [selected, setSelected] = useState("routes");
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const updateEdges = () => {
    const element = viewport.current;
    if (!element) return;
    setAtStart(element.scrollLeft < 2);
    setAtEnd(element.scrollLeft + element.clientWidth >= element.scrollWidth - 2);
  };
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scrollTabs = (direction: number) => {
    viewport.current?.scrollBy({
      left: direction * viewport.current.clientWidth * 0.7,
      behavior: reducedMotion ? "instant" : "smooth",
    });
  };
  return (
    <Tabs value={selected} onValueChange={setSelected} className="hero-examples">
      <motion.div className="hero-tabs-row">
        <motion.div className="hero-container hero-tabs-container">
          <ScrollArea.Root className="hero-tab-scroll" type="scroll">
            <ScrollArea.Viewport
              ref={viewport}
              onScroll={updateEdges}
              className="hero-tab-viewport"
            >
              <TabsList className="hero-tab-list" aria-label="Relkit capabilities">
                {examples.map((example) => (
                  <TabsTrigger
                    className="hero-tab"
                    value={example.id}
                    key={example.id}
                    onFocus={(event) =>
                      event.currentTarget.scrollIntoView({
                        block: "nearest",
                        inline: "center",
                        behavior: reducedMotion ? "instant" : "smooth",
                      })
                    }
                  >
                    {example.title}
                  </TabsTrigger>
                ))}
              </TabsList>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar orientation="horizontal" className="hero-tab-scrollbar">
              <ScrollArea.Thumb className="hero-tab-thumb" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
          {!atStart && (
            <motion.button
              className={buttonVariants({
                size: "icon-sm",
                className: "hero-tab-arrow hero-tab-prev",
              })}
              type="button"
              aria-label="Previous tabs"
              onClick={() => scrollTabs(-1)}
            >
              <ChevronLeft size={14} aria-hidden="true" />
            </motion.button>
          )}
          {!atEnd && (
            <motion.button
              className={buttonVariants({
                size: "icon-sm",
                className: "hero-tab-arrow hero-tab-next",
              })}
              type="button"
              aria-label="Next tabs"
              onClick={() => scrollTabs(1)}
            >
              <ChevronRight size={14} aria-hidden="true" />
            </motion.button>
          )}
        </motion.div>
      </motion.div>
      {examples.map((example) => (
        <TabsContent value={example.id} key={example.id} className="hero-panel-row">
          <motion.div
            className="hero-container hero-code-grid"
            data-single-panel={example.panels.length === 1}
            initial={{ opacity: 0.5, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <HeroCodePanels panels={example.panels} guide={example.guide} />
          </motion.div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
