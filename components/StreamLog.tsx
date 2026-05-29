"use client";

import { useEffect, useRef } from "react";

export interface LogEntry {
  id: string;
  message: string;
  level: "info" | "success" | "skip" | "warn";
  company?: string;
}

interface Props {
  entries: LogEntry[];
  isRunning: boolean;
}

const levelClass: Record<LogEntry["level"], string> = {
  info: "text-slate-400",
  success: "text-emerald-400",
  skip: "text-amber-400",
  warn: "text-red-400",
};

export default function StreamLog({ entries, isRunning }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <div className="h-64 overflow-y-auto bg-slate-950 rounded-lg border border-slate-800 p-3 font-mono text-xs">
      {entries.length === 0 ? (
        <p className="text-slate-700 italic">
          {isRunning ? "Starting agent..." : "Agent log will appear here once you run..."}
        </p>
      ) : (
        entries.map((entry) => (
          <div key={entry.id} className={`mb-0.5 leading-relaxed ${levelClass[entry.level]}`}>
            {entry.company && (
              <span className="text-slate-600">[{entry.company}] </span>
            )}
            {entry.message}
          </div>
        ))
      )}
      {isRunning && (
        <div className="text-slate-600 animate-pulse mt-0.5">▊</div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
