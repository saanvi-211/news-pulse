"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Newspaper, BarChart2, Clock } from "lucide-react";
import Timeline from "@/components/Timeline";
import ClusterPanel from "@/components/ClusterPanel";
import SourceFilter from "@/components/SourceFilter";
import RefreshButton from "@/components/RefreshButton";
import { api, type TimelineItem, type ClusterDetail } from "@/lib/api";

export default function Home() {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set());
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [clusterDetail, setClusterDetail] = useState<ClusterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ clusters: 0, articles: 0 });

  const loadTimeline = useCallback(async () => {
    try {
      const [tlRes, srcRes] = await Promise.all([
        api.getTimeline(),
        api.getSources(),
      ]);
      setTimeline(tlRes.timeline);
      setSources(srcRes.sources);
      setActiveSources(new Set(srcRes.sources));
      const totalArticles = tlRes.timeline.reduce((s, i) => s + i.article_count, 0);
      setStats({ clusters: tlRes.timeline.length, articles: totalArticles });
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setTimelineLoading(false);
    }
  }, []);

  useEffect(() => { loadTimeline(); }, [loadTimeline]);

  // Auto-refresh every 5 minutes (stretch goal)
  useEffect(() => {
    const id = setInterval(loadTimeline, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [loadTimeline]);

  const handleSelectCluster = useCallback(async (id: number) => {
    setSelectedCluster(id);
    setDetailLoading(true);
    setClusterDetail(null);
    try {
      const detail = await api.getCluster(id);
      setClusterDetail(detail);
    } catch (err) {
      console.error("Failed to load cluster:", err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const toggleSource = useCallback((src: string) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(src)) {
        if (next.size > 1) next.delete(src); // always keep at least one
      } else {
        next.add(src);
      }
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Newspaper size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none">News Pulse</h1>
              <p className="text-xs text-gray-400 mt-0.5">Topic-Clustered News Timeline</p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <BarChart2 size={13} />
              {stats.clusters} clusters
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={13} />
              {stats.articles} articles
            </span>
          </div>

          <RefreshButton onDone={loadTimeline} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Source filter */}
        <div className="mb-6">
          <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Filter by source</p>
          <SourceFilter
            sources={sources}
            activeSources={activeSources}
            onToggle={toggleSource}
          />
        </div>

        {/* Timeline */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-5">
            Timeline · <span className="text-gray-500 font-normal">click a cluster to explore</span>
          </h2>

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 text-sm mb-4">
              {error.includes("fetch") || error.includes("ECONNREFUSED")
                ? "Cannot reach the backend API. Make sure the Node.js server is running on port 4000."
                : error}
            </div>
          )}

          {timelineLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-8 bg-gray-800 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <Timeline
              items={timeline}
              selectedId={selectedCluster}
              onSelect={handleSelectCluster}
              activeSources={activeSources}
            />
          )}
        </div>

        {/* Empty state */}
        {!timelineLoading && timeline.length === 0 && !error && (
          <div className="mt-8 text-center">
            <p className="text-gray-400 text-sm">
              No articles yet. Click <strong>Refresh data</strong> to pull the latest news.
            </p>
          </div>
        )}
      </main>

      {/* Cluster detail side panel */}
      <ClusterPanel
        detail={clusterDetail}
        loading={detailLoading && selectedCluster !== null}
        onClose={() => {
          setSelectedCluster(null);
          setClusterDetail(null);
        }}
      />

      {/* Dim overlay when panel is open */}
      {(selectedCluster !== null) && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => {
            setSelectedCluster(null);
            setClusterDetail(null);
          }}
        />
      )}
    </div>
  );
}
