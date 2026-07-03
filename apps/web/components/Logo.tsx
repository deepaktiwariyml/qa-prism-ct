/** Code & Theory monogram — a clean ampersand mark in a rounded square. */
export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#0f172a" />
      <text
        x="16"
        y="23"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="21"
        fontStyle="italic"
        fontWeight="700"
        fill="#ffffff"
      >
        {'&'}
      </text>
    </svg>
  );
}
