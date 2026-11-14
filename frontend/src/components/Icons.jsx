import React from 'react';
export function Icon({ name, size = 20, ...props }) {
  const paths = {
    arrow: <path d="M4 12h15M13 6l6 6-6 6" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="3" />
        <path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
      </>
    ),
    link: (
      <path
        d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1"
        transform="translate(1 0) scale(.9)"
      />
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-2-4" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
    infinity: <path d="M12 12C8 4 2 6 2 12s6 8 10 0 10-6 10 0-6 8-10 0Z" />,
    send: <path d="m3 3 18 9-18 9 3-9-3-9Zm3 9h15" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    trophy: (
      <path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 1v6m-5 2h10" />
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] ?? paths.arrow}
    </svg>
  );
}
export function Die({ value = 5, small = false }) {
  const spots = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  return (
    <span className={`die ${small ? 'small' : ''}`} aria-label={`Dice ${value}`} role="img">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={spots[value]?.includes(i) ? 'pip' : ''} />
      ))}
    </span>
  );
}
