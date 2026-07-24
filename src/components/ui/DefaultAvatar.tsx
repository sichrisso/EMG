/*
 * Default profile picture for accounts without a photo: a neutral illustrated
 * portrait in brand colours. We don't collect gender, so one considerate
 * default serves everyone (mentors are required to upload a real photo when
 * they apply).
 */
export function DefaultAvatar({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Profile">
      <defs>
        <clipPath id="da-circle"><circle cx="32" cy="32" r="32" /></clipPath>
      </defs>
      <g clipPath="url(#da-circle)">
        <rect width="64" height="64" fill="#D4DDE2" />
        <circle cx="32" cy="25" r="11" fill="#334155" />
        <path d="M32 40c-11 0-18 6.5-18 15v9h36v-9c0-8.5-7-15-18-15z" fill="#334155" />
        <path d="M32 40c-4 0-7.5.9-10.3 2.5L32 55l10.3-12.5C39.5 40.9 36 40 32 40z" fill="#E3B23C" />
      </g>
    </svg>
  );
}
