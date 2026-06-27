"use client";

import React from "react";

interface Props {
  sources: string[];
  activeSources: Set<string>;
  onToggle: (source: string) => void;
}

const SOURCE_COLORS: Record<string, string> = {
  "BBC News":   "bg-red-600 border-red-600",
  "NPR":        "bg-blue-500 border-blue-500",
  "Reuters":    "bg-orange-500 border-orange-500",
  "Al Jazeera": "bg-green-600 border-green-600",
};

export default function SourceFilter({ sources, activeSources, onToggle }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {sources.map((src) => {
        const active = activeSources.has(src);
        const colorClass = SOURCE_COLORS[src] || "bg-purple-600 border-purple-600";
        return (
          <button
            key={src}
            onClick={() => onToggle(src)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              active
                ? `${colorClass} text-white`
                : "bg-transparent border-gray-600 text-gray-400 hover:border-gray-400"
            }`}
          >
            {src}
          </button>
        );
      })}
    </div>
  );
}
