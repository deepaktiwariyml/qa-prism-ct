/** Code & Theory monogram — "C&T" in a rounded square. */
export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#0f172a" />
      <text
        x="16"
        y="21"
        textAnchor="middle"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
        fontSize="12.5"
        fontWeight="700"
        letterSpacing="-0.5"
        fill="#ffffff"
      >
        {'C&T'}
      </text>
    </svg>
  );
}
