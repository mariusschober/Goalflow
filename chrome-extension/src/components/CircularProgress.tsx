import React from 'react';

export function CircularProgress({ remaining, total, size = 72 }: { remaining: number; total: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const progress = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const offset = c * (1 - progress);
  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <circle cx={size/2} cy={size/2} r={r} stroke="#e7e5e4" strokeWidth={2} fill="none" />
      <circle
        cx={size/2} cy={size/2} r={r}
        stroke={progress > 0.2 ? '#5B5BD6' : '#10b981'}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.3s linear' }}
      />
      <text
        x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        fontSize={10} fontWeight={700} fill="#57534e"
      >
        {total > 0 ? `${Math.ceil(remaining/60)}m` : '—'}
      </text>
    </svg>
  );
}
