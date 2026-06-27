"use client";

import React, { useState, useCallback } from "react";
import { RefreshCw, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  onDone: () => void;
}

type Phase = "idle" | "triggering" | "polling" | "done" | "error";

export default function RefreshButton({ onDone }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");

  const handleClick = useCallback(async () => {
    if (phase === "triggering" || phase === "polling") return;
    setPhase("triggering");
    setMessage("Starting pipeline…");

    let jobId: string;
    try {
      const res = await api.triggerIngest();
      jobId = res.jobId;
    } catch (err) {
      setPhase("error");
      setMessage(String(err));
      return;
    }

    setPhase("polling");
    setMessage("Ingesting articles…");

    // Poll every 3s for up to 3 minutes
    const maxAttempts = 60;
    let attempts = 0;

    const poll = async () => {
      attempts++;
      try {
        const status = await api.getJobStatus(jobId);
        if (status.status === "done") {
          setPhase("done");
          const r = status.result as { new_articles?: number; clusters?: number } | undefined;
          setMessage(
            r
              ? `Done! ${r.new_articles ?? 0} new articles, ${r.clusters ?? 0} clusters.`
              : "Done!"
          );
          onDone();
          setTimeout(() => { setPhase("idle"); setMessage(""); }, 5000);
        } else if (status.status === "error") {
          setPhase("error");
          setMessage(status.error || "Pipeline failed.");
        } else if (attempts < maxAttempts) {
          setTimeout(poll, 3000);
        } else {
          setPhase("error");
          setMessage("Timed out waiting for pipeline.");
        }
      } catch (err) {
        setPhase("error");
        setMessage(String(err));
      }
    };

    setTimeout(poll, 3000);
  }, [phase, onDone]);

  const icons = {
    idle:       <RefreshCw size={15} />,
    triggering: <Loader2 size={15} className="animate-spin" />,
    polling:    <Loader2 size={15} className="animate-spin" />,
    done:       <CheckCircle size={15} />,
    error:      <AlertCircle size={15} />,
  };

  const colours = {
    idle:       "bg-indigo-600 hover:bg-indigo-500",
    triggering: "bg-indigo-700 cursor-wait",
    polling:    "bg-indigo-700 cursor-wait",
    done:       "bg-green-700",
    error:      "bg-red-700",
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={phase === "triggering" || phase === "polling"}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${colours[phase]}`}
      >
        {icons[phase]}
        Refresh data
      </button>
      {message && (
        <span
          className={`text-xs ${
            phase === "error" ? "text-red-400" : "text-gray-400"
          }`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
