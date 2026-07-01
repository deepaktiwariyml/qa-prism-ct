'use client';

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';
import type { PillarScore } from '@qa-prism/core';

export function PillarRadar({ pillars }: { pillars: PillarScore[] }) {
  const data = pillars.map((p) => ({ pillar: p.pillar, score: p.score }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={data} outerRadius="70%">
        <PolarGrid />
        <PolarAngleAxis dataKey="pillar" tick={{ fontSize: 12, fill: '#475569' }} />
        <PolarRadiusAxis domain={[0, 100]} angle={90} tick={false} axisLine={false} />
        <Radar dataKey="score" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.4} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
