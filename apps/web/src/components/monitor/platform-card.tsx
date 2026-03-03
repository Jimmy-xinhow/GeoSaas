import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface PlatformCardProps {
  platform: string;
  mentionRate: number;
  trend: 'up' | 'down' | 'stable';
  lastChecked: string;
}

const trendConfig = {
  up: {
    icon: TrendingUp,
    color: 'text-green-500',
    label: '上升',
  },
  down: {
    icon: TrendingDown,
    color: 'text-red-500',
    label: '下降',
  },
  stable: {
    icon: Minus,
    color: 'text-muted-foreground',
    label: '穩定',
  },
};

export function PlatformCard({
  platform,
  mentionRate,
  trend,
  lastChecked,
}: PlatformCardProps) {
  const { icon: TrendIcon, color, label } = trendConfig[trend];

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">{platform}</h3>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold">{mentionRate}%</span>
              <div className={cn('flex items-center gap-1', color)}>
                <TrendIcon className="h-4 w-4" />
                <span className="text-xs">{label}</span>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          最後檢查: {lastChecked}
        </p>
      </CardContent>
    </Card>
  );
}
