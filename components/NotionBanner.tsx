"use client";

interface Props {
  show: boolean;
  roleCount: number;
  onDismiss: () => void;
}

export default function NotionBanner({ show, roleCount, onDismiss }: Props) {
  if (!show) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-3 px-5 py-3 bg-slate-800 border border-emerald-700 rounded-full shadow-2xl text-slate-100">
        <span className="text-emerald-400 font-bold">✓</span>
        <span className="text-sm font-medium">
          {roleCount} qualifying role{roleCount !== 1 ? "s" : ""} logged to Notion
        </span>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-slate-500 hover:text-slate-300 ml-1 text-xl leading-none transition-colors"
        >
          ×
        </button>
      </div>
    </div>
  );
}
