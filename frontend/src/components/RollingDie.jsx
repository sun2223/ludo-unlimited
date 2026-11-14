import React, { useEffect, useState } from 'react';
import { Die } from './Icons.jsx';
export function RollingDie({ value, rolling }) {
  const [face, setFace] = useState(1);
  useEffect(() => {
    if (!rolling || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setFace((n) => (n % 6) + 1), 65);
    return () => clearInterval(timer);
  }, [rolling]);
  return (
    <span
      className={rolling ? 'dice-stage rolling' : 'dice-stage'}
      aria-label={rolling ? 'Dice rolling' : undefined}
    >
      <Die value={rolling ? face : value} />
    </span>
  );
}
