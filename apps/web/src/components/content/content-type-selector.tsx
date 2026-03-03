'use client'

import { HelpCircle, FileText, Database } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ContentTypeSelectorProps {
  value: string
  onChange: (value: string) => void
}

const contentTypes = [
  {
    id: 'faq',
    icon: HelpCircle,
    label: '常見問題',
    description: '生成 FAQ JSON-LD 結構化資料',
  },
  {
    id: 'article',
    icon: FileText,
    label: '權威文章',
    description: '生成 SEO 優化的 Markdown 文章',
  },
  {
    id: 'knowledge',
    icon: Database,
    label: '品牌知識庫',
    description: '生成完整的品牌知識庫內容',
  },
]

export default function ContentTypeSelector({
  value,
  onChange,
}: ContentTypeSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {contentTypes.map((type) => {
        const isActive = value === type.id
        return (
          <button
            key={type.id}
            onClick={() => onChange(type.id)}
            className={cn(
              'flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all text-center hover:shadow-md',
              isActive
                ? 'border-blue-600 bg-blue-50 shadow-sm'
                : 'border-gray-200 bg-white hover:border-gray-300'
            )}
          >
            <div
              className={cn(
                'h-12 w-12 rounded-xl flex items-center justify-center transition-colors',
                isActive ? 'bg-blue-100' : 'bg-gray-100'
              )}
            >
              <type.icon
                className={cn(
                  'h-6 w-6 transition-colors',
                  isActive ? 'text-blue-600' : 'text-gray-500'
                )}
              />
            </div>
            <div>
              <h4
                className={cn(
                  'font-semibold transition-colors',
                  isActive ? 'text-blue-700' : 'text-gray-900'
                )}
              >
                {type.label}
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                {type.description}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
