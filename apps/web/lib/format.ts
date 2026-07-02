/** "Jul 2, 2026, 2:30 PM" — absolute local date + time. */
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "2h ago" / "just now" — relative to now. */
export function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const sec = Math.round(diffMs / 1000);
  if (Math.abs(sec) < 60) return rtf.format(-sec, 'second');
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(-hr, 'hour');
  const day = Math.round(hr / 24);
  if (Math.abs(day) < 30) return rtf.format(-day, 'day');
  const mo = Math.round(day / 30);
  if (Math.abs(mo) < 12) return rtf.format(-mo, 'month');
  return rtf.format(-Math.round(mo / 12), 'year');
}

/** Human label for a minutes count, e.g. 60 → "1 hour", 30 → "30 minutes". */
export function humanizeMinutes(min: number): string {
  if (min % 60 === 0) {
    const h = min / 60;
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

/** Human duration between two timestamps, e.g. "1.4s" / "2m 5s". */
export function duration(start?: string | null, end?: string | null): string {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}
