export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-1/3 rounded bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-40 rounded-xl bg-slate-200" />
        <div className="h-40 rounded-xl bg-slate-200" />
        <div className="h-40 rounded-xl bg-slate-200" />
      </div>
    </div>
  );
}
