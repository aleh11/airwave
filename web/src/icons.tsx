import type { SVGProps } from "react";

export function RaspberryMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 6.3c-.3-2.3 1.1-3.8 3.8-4.3-.1 2.5-1.2 4-3.8 4.3Zm-.8.1C9 6 7.7 4.6 7.6 2.5c2.4.2 3.8 1.5 3.6 3.9Z"
        fill="currentColor"
      />
      <path
        d="M8.1 6.2c1.5-.6 3 .1 3.9 1.4.9-1.3 2.4-2 3.9-1.4 1.7.6 2.6 2.2 2.2 3.7 1.5.8 2 2.5 1.3 4-.5 1.1-1.5 1.8-2.6 1.9.1 1.5-1 2.9-2.5 3.3-.8.2-1.6 0-2.3-.4-.7.4-1.5.6-2.3.4-1.5-.4-2.6-1.8-2.5-3.3-1.1-.1-2.1-.8-2.6-1.9-.7-1.5-.2-3.2 1.3-4-.4-1.5.5-3.1 2.2-3.7Z"
        fill="currentColor"
      />
      <path
        d="M9.1 9.5h.1m5.6 0h.1m-8.2 3h.1m5.1 0h.1m5.1 0h.1m-8.1 3h.1m5.6 0h.1"
        stroke="var(--color-background-surface)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
