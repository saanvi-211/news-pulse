// lib/api.ts — typed API client for News Pulse backend

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export interface TimelineItem {
  id: number;
  label: string;
  article_count: number;
  start_time: string | null;
  end_time: string | null;
  sources: string[];
  intensity: number;
}

export interface ClusterSummary {
  id: number;
  label: string;
  article_count: number;
  earliest: string | null;
  latest: string | null;
  sources: string;
}

export interface Article {
  id: number;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  published: string | null;
  cluster_id: number | null;
}

export interface ClusterDetail {
  cluster: ClusterSummary;
  articles: Article[];
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getTimeline: () =>
    apiFetch<{ timeline: TimelineItem[] }>("/timeline"),

  getClusters: () =>
    apiFetch<{ clusters: ClusterSummary[] }>("/clusters"),

  getCluster: (id: number) =>
    apiFetch<ClusterDetail>(`/clusters/${id}`),

  getSources: () =>
    apiFetch<{ sources: string[] }>("/sources"),

  triggerIngest: () =>
    apiFetch<{ jobId: string; status: string }>("/ingest/trigger", {
      method: "POST",
    }),

  getJobStatus: (jobId: string) =>
    apiFetch<{ status: string; result?: unknown; error?: string }>(
      `/ingest/status/${jobId}`
    ),
};
