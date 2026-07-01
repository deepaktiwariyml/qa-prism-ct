'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SEVERITIES, type Finding } from '@qa-prism/core';
import { SEVERITY_COLOR } from '@/lib/ui';

export function SeverityBar({ findings }: { findings: Finding[] }) {
  const data = SEVERITIES.map((severity) => ({
    severity,
    count: findings.filter((f) => f.severity === severity).length,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
        <XAxis dataKey="severity" tick={{ fontSize: 12, fill: '#475569' }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
        <Tooltip cursor={{ fill: '#f1f5f9' }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.severity} fill={SEVERITY_COLOR[d.severity]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
