import { useId } from 'react';

/**
 * The desk's mark: an E whose three arms bend into one line, ending in a live dot. The
 * letter is Exposure; the arms meeting is the product, separate feeds becoming one governed
 * record. Set on a graphite tile so it holds as an app icon at 20px and as a logo at hero size.
 */
export function BrandMark({ size = 20 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#252B34" />
          <stop offset="1" stopColor="#11151A" />
        </linearGradient>
        <radialGradient id={`${id}-dot`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#3DD68C" stopOpacity="0.55" />
          <stop offset="1" stopColor="#3DD68C" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0.5" y="0.5" width="39" height="39" rx="10" fill={`url(#${id}-tile)`} />
      <rect x="0.5" y="0.5" width="39" height="39" rx="10" fill="none" stroke="rgba(255,255,255,0.14)" />
      <path d="M2 10.5V9a8.5 8.5 0 0 1 8.5-8.5h19" fill="none" stroke="rgba(255,255,255,0.10)" />
      <g fill="none" stroke="#E7EAEE" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 11.5V28.5" />
        <path d="M11 11.5H20.5L27.5 20" />
        <path d="M11 20H27.5" />
        <path d="M11 28.5H20.5L27.5 20" />
      </g>
      <circle cx="31.4" cy="20" r="5.5" fill={`url(#${id}-dot)`} />
      <circle cx="31.4" cy="20" r="2.5" fill="#3DD68C" />
    </svg>
  );
}

/** The lockup: the mark and a weighted wordmark. */
export function BrandLockup({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span className={`brand${className ? ` ${className}` : ''}`}>
      <BrandMark size={size} />
      <span className="brand-word">
        <b>Exposure</b> Desk
      </span>
    </span>
  );
}
