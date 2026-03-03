'use client';

import React from 'react';

interface ScoreGaugeProps {
  score: number;
  size?: number;
}

function getScoreColor(score: number): string {
  if (score < 40) return '#ef4444'; // red
  if (score <= 70) return '#eab308'; // yellow
  return '#22c55e'; // green
}

export function ScoreGauge({ score, size = 160 }: ScoreGaugeProps) {
  const clampedScore = Math.min(100, Math.max(0, score));
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedScore / 100) * circumference;
  const center = size / 2;
  const color = getScoreColor(clampedScore);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--secondary))"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-in-out"
        />
      </svg>
      {/* Center text */}
      <div className="absolute flex flex-col items-center justify-center">
        <span
          className="font-bold"
          style={{ fontSize: size * 0.25, color }}
        >
          {clampedScore}
        </span>
        <span
          className="text-muted-foreground"
          style={{ fontSize: size * 0.1 }}
        >
          /100
        </span>
      </div>
    </div>
  );
}
