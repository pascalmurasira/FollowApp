interface NudgeLogoProps {
  className?: string
}

/**
 * Nudge brand mark — a rounded speech bubble (with tail) cradling a spark,
 * signalling "a message worth sending." Drawn entirely in currentColor so it
 * themes cleanly against any background (clay app bar, secondary chip, etc).
 */
export function NudgeLogo({ className }: NudgeLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Speech bubble with a downward-left tail */}
      <path d="M5.5 4h13A2.5 2.5 0 0 1 21 6.5v7A2.5 2.5 0 0 1 18.5 16H10l-4 3.4A.5.5 0 0 1 5.2 19V16A2.5 2.5 0 0 1 4 13.5v-7A2.5 2.5 0 0 1 5.5 4Z" />
      {/* Spark / nudge inside */}
      <path
        d="M12 7.2c.3 1.7 1.1 2.5 2.8 2.8-1.7.3-2.5 1.1-2.8 2.8-.3-1.7-1.1-2.5-2.8-2.8 1.7-.3 2.5-1.1 2.8-2.8Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  )
}
