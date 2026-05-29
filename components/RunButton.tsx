"use client";

interface Props {
  onClick: () => void;
  isRunning: boolean;
  disabled: boolean;
}

export default function RunButton({ onClick, isRunning, disabled }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isRunning}
      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold text-sm text-white transition-colors flex items-center justify-center gap-2"
    >
      {isRunning ? (
        <>
          <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Running...
        </>
      ) : (
        "Run Agent"
      )}
    </button>
  );
}
