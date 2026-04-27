'use client'

import { HelpCircle, FileText, Database, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ContentTypeSelectorProps {
  value: string
  onChange: (value: string) => void
}

interface TypeDef {
  id: string
  icon: typeof HelpCircle
  label: string
  description: string
  badge: string
  // Tailwind gradient + glow palette per type
  gradientFrom: string
  gradientTo: string
  iconText: string
  glow: string
  ring: string
}

const contentTypes: TypeDef[] = [
  {
    id: 'faq',
    icon: HelpCircle,
    label: '常見問題',
    description: 'FAQ JSON-LD 結構化資料',
    badge: 'JSON-LD',
    gradientFrom: 'from-cyan-500/30',
    gradientTo: 'to-sky-500/10',
    iconText: 'text-cyan-300',
    glow: 'shadow-cyan-500/20',
    ring: 'ring-cyan-400/60',
  },
  {
    id: 'article',
    icon: FileText,
    label: '權威文章',
    description: 'SEO 優化的 Markdown 長文',
    badge: 'Markdown',
    gradientFrom: 'from-violet-500/30',
    gradientTo: 'to-purple-500/10',
    iconText: 'text-violet-300',
    glow: 'shadow-violet-500/20',
    ring: 'ring-violet-400/60',
  },
  {
    id: 'knowledge',
    icon: Database,
    label: '品牌知識庫',
    description: '完整品牌知識庫條目',
    badge: 'Knowledge',
    gradientFrom: 'from-amber-500/30',
    gradientTo: 'to-orange-500/10',
    iconText: 'text-amber-300',
    glow: 'shadow-amber-500/20',
    ring: 'ring-amber-400/60',
  },
]

export default function ContentTypeSelector({
  value,
  onChange,
}: ContentTypeSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {contentTypes.map((type) => {
        const isActive = value === type.id
        return (
          <button
            key={type.id}
            onClick={() => onChange(type.id)}
            type="button"
            className={cn(
              'group relative overflow-hidden rounded-xl border text-left p-4 transition-all duration-200',
              'bg-white/5 backdrop-blur-sm hover:-translate-y-0.5',
              isActive
                ? cn(
                    'border-transparent ring-2 shadow-lg',
                    type.ring,
                    type.glow,
                  )
                : 'border-white/10 hover:border-white/20 hover:bg-white/[0.07]',
            )}
          >
            {/* Animated gradient background — only on active */}
            <div
              className={cn(
                'absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300 pointer-events-none',
                type.gradientFrom,
                type.gradientTo,
                isActive && 'opacity-100',
              )}
            />

            {/* Subtle gradient hint on hover (when inactive) */}
            <div
              className={cn(
                'absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-40 transition-opacity duration-300 pointer-events-none',
                type.gradientFrom,
                type.gradientTo,
                isActive && 'hidden',
              )}
            />

            {/* Active checkmark — top right */}
            <div
              className={cn(
                'absolute top-3 right-3 h-5 w-5 rounded-full bg-white/90 flex items-center justify-center transition-all duration-200',
                isActive ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
              )}
            >
              <Check className="h-3 w-3 text-gray-900 stroke-[3]" />
            </div>

            {/* Body */}
            <div className="relative flex items-start gap-3">
              <div
                className={cn(
                  'h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                  isActive
                    ? 'bg-white/15 ring-1 ring-white/20'
                    : 'bg-white/5 ring-1 ring-white/10 group-hover:bg-white/10',
                )}
              >
                <type.icon
                  className={cn(
                    'h-5 w-5 transition-colors',
                    isActive ? type.iconText : 'text-gray-400 group-hover:text-gray-200',
                  )}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4
                    className={cn(
                      'font-semibold transition-colors',
                      isActive ? 'text-white' : 'text-gray-200',
                    )}
                  >
                    {type.label}
                  </h4>
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider transition-colors',
                      isActive
                        ? 'bg-white/15 text-white'
                        : 'bg-white/5 text-gray-500 group-hover:text-gray-300',
                    )}
                  >
                    {type.badge}
                  </span>
                </div>
                <p
                  className={cn(
                    'text-xs mt-1 leading-relaxed transition-colors',
                    isActive ? 'text-gray-200' : 'text-gray-500 group-hover:text-gray-400',
                  )}
                >
                  {type.description}
                </p>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
