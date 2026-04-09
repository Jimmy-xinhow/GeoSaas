'use client';

import Link from 'next/link';
import { Globe, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAllIndustryStats } from '@/hooks/use-directory';
import { INDUSTRIES } from '@geovault/shared';

export default function IndustriesClient() {
  const { data: stats, isLoading } = useAllIndustryStats();

  const industryMap = new Map(INDUSTRIES.map((i) => [i.value as string, i.label]));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold text-gray-900">
          各行業 AI 搜尋優化現況
        </h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          查看各行業品牌的 AI 搜尋能見度數據，了解你的行業在 GEO 優化上的現況與機會
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stats?.map((stat) => {
            const label = industryMap.get(stat.industry) || stat.industry;
            return (
              <Link key={stat.industry} href={`/directory/industry/${stat.industry}`}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full group">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {label}
                      </h2>
                      <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                    </div>
                    <div className="flex items-center gap-6">
                      <div>
                        <p className="text-2xl font-bold text-blue-600">{stat.count}</p>
                        <p className="text-xs text-muted-foreground">品牌數</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-green-600">{stat.avgScore}</p>
                        <p className="text-xs text-muted-foreground">平均 GEO 分數</p>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${stat.avgScore >= 70 ? 'bg-green-500' : stat.avgScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${stat.avgScore}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
