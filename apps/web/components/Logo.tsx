/** Code & Theory monogram — "C&T" in a rounded square. */
export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="#0f172a" />
      <text
        x="16"
        y="21.5"
        textAnchor="middle"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
        fontSize="14.5"
        fontWeight="800"
        letterSpacing="-0.6"
        fill="#ffffff"
      >
        {'C&T'}
      </text>
    </svg>
  );
}
