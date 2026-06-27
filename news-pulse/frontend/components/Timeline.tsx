"use client";

import React, { useMemo } from "react";
import type { TimelineItem } from "@/lib/api";

interface Props {
  items: TimelineItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  activeSources: Set<string>;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = parseDate(s);
  if (!d) return s;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Timeline({ items, selectedId, onSelect, activeSources }: Props) {
  // Filter by active sources
  const filtered = useMemo(
    () =>
      items.filter((item) =>
        item.sources.some((s) => activeSources.has(s))
      ),
    [items, activeSources]
  );

  // Compute global time bounds
  const { minMs, maxMs } = useMemo(() => {
    let minMs = Infinity;
    let maxMs = -Infinity;
    filtered.forEach((item) => {
      const start = parseDate(item.start_time);
      const end = parseDate(item.end_time);
      if (start) minMs = Math.min(minMs, start.getTime());
      if (end) maxMs = Math.max(maxMs, end.getTime());
    });
    if (!isFinite(minMs)) minMs = Date.now() - 86400000;
    if (!isFinite(maxMs)) maxMs = Date.now();
    return { minMs, maxMs };
  }, [filtered]);

  const rangeMs = maxMs - minMs || 1;

  // Source colour palette
  const sourceColors: Record<string, string> = {
    "BBC News": "#cc0000",
    "NPR": "#1a8cff",
    "Reuters": "#ff6600",
    "Al Jazeera": "#009933",
  };
  const fallbackColors = ["#7c3aed", "#0891b2", "#be185d", "#b45309"];
  const colorOf = (src: string, idx: number) =>
    sourceColors[src] || fallbackColors[idx % fallbackColors.length];

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        No clusters to display. Try triggering an ingest or adjusting source filters.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      {/* Time axis labels */}
      <div className="relative h-6 mb-2 mx-4">
        <span className="absolute left-0 text-xs text-gray-400">{fmtDate(new Date(minMs).toISOString())}</span>
        <span className="absolute right-0 text-xs text-gray-400">{fmtDate(new Date(maxMs).toISOString())}</span>
      </div>

      {/* Axis line */}
      <div className="relative mx-4 h-1 bg-gray-700 rounded mb-4" />

      {/* Cluster rows */}
      <div className="space-y-2 mx-4">
        {filtered.map((item, rowIdx) => {
          const startMs = parseDate(item.start_time)?.getTime() ?? minMs;
          const endMs = parseDate(item.end_time)?.getTime() ?? startMs;

          const leftPct = ((startMs - minMs) / rangeMs) * 100;
          const widthPct = Math.max(
            ((endMs - startMs) / rangeMs) * 100,
            0.8 // minimum width so single-article clusters are visible
          );

          const primarySrc = item.sources[0] || "";
          const color = colorOf(primarySrc, rowIdx);

          // Intensity → opacity + thickness
          const opacity = 0.45 + item.intensity * 0.55;
          const height = 28 + Math.round(item.intensity * 18); // 28–46 px
          const isSelected = item.id === selectedId;

          return (
            <div key={item.id} className="relative" style={{ height: `${height}px` }}>
              {/* Background track */}
              <div className="absolute inset-y-0 left-0 right-0 rounded bg-gray-800" />

              {/* Cluster bar */}
              <button
                onClick={() => onSelect(item.id)}
                title={`${item.label} — ${item.article_count} articles`}
                className="absolute top-0 bottom-0 rounded transition-all focus:outline-none"
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  backgroundColor: color,
                  opacity: isSelected ? 1 : opacity,
                  border: isSelected ? `2px solid white` : "2px solid transparent",
                  boxShadow: isSelected ? `0 0 0 2px ${color}` : "none",
                  minWidth: "6px",
                }}
              >
                {widthPct > 8 && (
                  <span
                    className="absolute inset-0 flex items-center px-2 text-white font-medium truncate"
                    style={{ fontSize: "11px" }}
                  >
                    {item.label}
                  </span>
                )}
              </button>

              {/* Article count badge */}
              <span
                className="absolute right-1 top-1/2 -translate-y-1/2 text-xs text-gray-300 pointer-events-none"
                style={{ fontSize: "10px" }}
              >
                {item.article_count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-6 mx-4">
        {Array.from(activeSources).map((src, i) => (
          <div key={src} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: colorOf(src, i) }}
            />
            <span className="text-xs text-gray-400">{src}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
