"use client";

import React from "react";
import { ExternalLink, X, Clock, Globe } from "lucide-react";
import type { ClusterDetail } from "@/lib/api";

interface Props {
  detail: ClusterDetail | null;
  loading: boolean;
  onClose: () => void;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "Unknown date";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ClusterPanel({ detail, loading, onClose }: Props) {
  if (!detail && !loading) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-gray-900 border-l border-gray-700 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-gray-700 gap-3">
        <div>
          {loading ? (
            <div className="h-5 w-48 bg-gray-700 rounded animate-pulse" />
          ) : (
            <h2 className="text-lg font-semibold text-white leading-tight">
              {detail?.cluster.label}
            </h2>
          )}
          {!loading && detail && (
            <p className="text-xs text-gray-400 mt-1">
              {detail.articles.length} articles ·{" "}
              {fmtDate(detail.cluster.earliest)} → {fmtDate(detail.cluster.latest)}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors mt-0.5"
        >
          <X size={20} />
        </button>
      </div>

      {/* Articles */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-gray-800 rounded-lg p-4 space-y-2 animate-pulse">
                <div className="h-4 bg-gray-700 rounded w-3/4" />
                <div className="h-3 bg-gray-700 rounded w-full" />
                <div className="h-3 bg-gray-700 rounded w-1/2" />
              </div>
            ))
          : detail?.articles.map((article) => (
              <article
                key={article.id}
                className="bg-gray-800 hover:bg-gray-750 rounded-lg p-4 transition-colors"
              >
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group"
                >
                  <h3 className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors leading-snug mb-2 flex items-start gap-1.5">
                    <span className="flex-1">{article.title}</span>
                    <ExternalLink size={13} className="shrink-0 mt-0.5 text-gray-500 group-hover:text-blue-400" />
                  </h3>
                </a>

                {article.summary && (
                  <p className="text-xs text-gray-400 leading-relaxed line-clamp-3 mb-3">
                    {article.summary.slice(0, 220)}
                    {article.summary.length > 220 ? "…" : ""}
                  </p>
                )}

                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Globe size={11} />
                    {article.source}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {fmtDate(article.published)}
                  </span>
                </div>
              </article>
            ))}
      </div>
    </div>
  );
}
