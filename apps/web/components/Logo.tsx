export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="prism" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <path d="M16 3 3 26h26L16 3Z" stroke="url(#prism)" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M16 3 16 26" stroke="url(#prism)" strokeWidth="1.4" opacity="0.55" />
      <path d="M16 10 9.5 22h13L16 10Z" fill="url(#prism)" opacity="0.9" />
    </svg>
  );
}
