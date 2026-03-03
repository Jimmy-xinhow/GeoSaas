'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface DataPoint {
  month: string
  score: number
}

const defaultData: DataPoint[] = [
  { month: '1月', score: 45 },
  { month: '2月', score: 52 },
  { month: '3月', score: 58 },
  { month: '4月', score: 63 },
  { month: '5月', score: 71 },
  { month: '6月', score: 78 },
]

interface ScanHistoryChartProps {
  data?: DataPoint[]
}

export default function ScanHistoryChart({
  data = defaultData,
}: ScanHistoryChartProps) {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorScanScore" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            fontSize={12}
            tick={{ fill: '#9ca3af' }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            fontSize={12}
            domain={[0, 100]}
            tick={{ fill: '#9ca3af' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
            }}
            formatter={(value: number) => [`${value} 分`, 'GEO 分數']}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#colorScanScore)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
