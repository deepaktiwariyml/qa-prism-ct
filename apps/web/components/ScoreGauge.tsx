import { scoreColor } from '@/lib/ui';

/** A circular score gauge (Ocean Health Index–style ring) with the value in the center. */
export function ScoreGauge({
  score,
  size = 132,
  stroke = 12,
  label,
}: {
  score: number;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = scoreColor(score);

  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * pct} ${circumference}`}
          style={{ transition: 'stroke-dasharray 700ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold" style={{ color }}>
          {Math.round(score)}
        </span>
        <span className="text-[11px] text-slate-400">/ 100</span>
      </div>
      {label && <span className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>}
    </div>
  );
}

/** Compact ring for pillar cards. */
export function MiniRing({ score, size = 52, stroke = 6 }: { score: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = scoreColor(score);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * pct} ${circumference}`}
        />
      </svg>
      <span className="absolute text-sm font-semibold" style={{ color }}>
        {Math.round(score)}
      </span>
    </div>
  );
}
