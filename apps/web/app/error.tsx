'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
      <p className="mb-3 font-medium">Something went wrong.</p>
      <p className="mb-4">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-lg border border-red-300 px-3 py-1.5 hover:bg-red-100"
      >
        Try again
      </button>
    </div>
  );
}
