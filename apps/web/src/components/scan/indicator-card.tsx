import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface IndicatorCardProps {
  name: string;
  score: number;
  status: 'pass' | 'warning' | 'fail';
  suggestion?: string;
}

const statusConfig = {
  pass: { label: '通過', className: 'bg-green-500 text-white hover:bg-green-500/80' },
  warning: { label: '警告', className: 'bg-yellow-500 text-white hover:bg-yellow-500/80' },
  fail: { label: '未通過', className: 'bg-red-500 text-white hover:bg-red-500/80' },
};

export function IndicatorCard({
  name,
  score,
  status,
  suggestion,
}: IndicatorCardProps) {
  const config = statusConfig[status];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{name}</span>
              <span className="text-sm font-semibold">{score}</span>
            </div>
            <Progress value={score} className="h-2" />
          </div>
          <Badge className={config.className}>{config.label}</Badge>
        </div>
        {suggestion && (
          <p className="mt-3 text-xs text-muted-foreground">{suggestion}</p>
        )}
      </CardContent>
    </Card>
  );
}
