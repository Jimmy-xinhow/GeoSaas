import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface CardSkeletonProps {
  /** number of body lines */
  lines?: number
  className?: string
}

/** Single card-shaped loading placeholder. */
export function CardSkeleton({ lines = 3, className }: CardSkeletonProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
      </CardHeader>
      <CardContent className="space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-1/2' : 'w-full')} />
        ))}
      </CardContent>
    </Card>
  )
}

interface SectionSkeletonProps {
  /** number of skeleton cards */
  count?: number
  /** grid columns at sm+ */
  columns?: 1 | 2 | 3 | 4
  lines?: number
  className?: string
}

const colClasses: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
}

/** Grid of card skeletons — the standard list/grid loading state. */
export function SectionSkeleton({
  count = 3,
  columns = 1,
  lines = 3,
  className,
}: SectionSkeletonProps) {
  return (
    <div className={cn('grid gap-4', colClasses[columns], className)}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} lines={lines} />
      ))}
    </div>
  )
}
