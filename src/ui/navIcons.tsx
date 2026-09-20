import type { ReactNode } from "react";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      {children}
    </svg>
  );
}

export function IconOverview() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3c2.2 3.4 3.2 6.4 3.2 9S14.2 17.6 12 21" />
      <path d="M3.6 9h16.8M3.6 15h16.8" />
    </Icon>
  );
}

export function IconAnalyze() {
  return (
    <Icon>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" strokeLinecap="round" />
    </Icon>
  );
}

export function IconTrips() {
  return (
    <Icon>
      <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" />
      <circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconIngest() {
  return (
    <Icon>
      <path d="M12 4v10" strokeLinecap="round" />
      <path d="M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 16v2.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V16" strokeLinecap="round" />
    </Icon>
  );
}

export function IconEditor() {
  return (
    <Icon>
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" strokeLinejoin="round" />
    </Icon>
  );
}
