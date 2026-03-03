'use client'

import * as React from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Context                                                           */
/* ------------------------------------------------------------------ */

interface SelectContextValue {
  value?: string
  onValueChange?: (value: string) => void
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  registerItem: (value: string, label: string) => void
  getLabel: (value: string) => string | undefined
  disabled?: boolean
}

const SelectContext = React.createContext<SelectContextValue>({
  open: false,
  setOpen: () => {},
  registerItem: () => {},
  getLabel: () => undefined,
  disabled: false,
})

/* ------------------------------------------------------------------ */
/*  Select (root)                                                     */
/* ------------------------------------------------------------------ */

interface SelectProps {
  children: React.ReactNode
  value?: string
  onValueChange?: (value: string) => void
  defaultValue?: string
  disabled?: boolean
}

function Select({ children, value, onValueChange, defaultValue, disabled }: SelectProps) {
  const [open, setOpen] = React.useState(false)
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const itemLabels = React.useRef<Map<string, string>>(new Map())

  const currentValue = value ?? internalValue
  const handleChange = React.useCallback(
    (v: string) => {
      if (onValueChange) onValueChange(v)
      else setInternalValue(v)
    },
    [onValueChange]
  )

  const registerItem = React.useCallback((val: string, label: string) => {
    itemLabels.current.set(val, label)
  }, [])

  const getLabel = React.useCallback((val: string) => {
    return itemLabels.current.get(val)
  }, [])

  return (
    <SelectContext.Provider
      value={{ value: currentValue, onValueChange: handleChange, open, setOpen, registerItem, getLabel, disabled }}
    >
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  )
}

/* ------------------------------------------------------------------ */
/*  SelectTrigger                                                     */
/* ------------------------------------------------------------------ */

interface SelectTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen, disabled } = React.useContext(SelectContext)

    return (
      <button
        ref={ref}
        type="button"
        role="combobox"
        disabled={disabled}
        aria-expanded={open}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        onClick={() => setOpen((prev) => !prev)}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
      </button>
    )
  }
)
SelectTrigger.displayName = 'SelectTrigger'

/* ------------------------------------------------------------------ */
/*  SelectValue                                                       */
/* ------------------------------------------------------------------ */

interface SelectValueProps {
  placeholder?: string
}

function SelectValue({ placeholder }: SelectValueProps) {
  const { value, getLabel } = React.useContext(SelectContext)
  const displayText = value ? (getLabel(value) ?? value) : undefined
  return (
    <span className={cn(!displayText && 'text-muted-foreground')}>
      {displayText || placeholder}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  SelectContent                                                     */
/* ------------------------------------------------------------------ */

interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {}

const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen } = React.useContext(SelectContext)
    const contentRef = React.useRef<HTMLDivElement>(null)

    // Close when clicking outside
    React.useEffect(() => {
      if (!open) return

      function handleClick(e: MouseEvent) {
        if (
          contentRef.current &&
          !contentRef.current.contains(e.target as Node)
        ) {
          // small delay so the trigger toggle doesn't immediately re-open
          setTimeout(() => setOpen(false), 0)
        }
      }

      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }, [open, setOpen])

    if (!open) return null

    return (
      <div
        ref={(node) => {
          (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
        }}
        className={cn(
          'absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95',
          className
        )}
        {...props}
      >
        <div className="p-1">{children}</div>
      </div>
    )
  }
)
SelectContent.displayName = 'SelectContent'

/* ------------------------------------------------------------------ */
/*  SelectItem                                                        */
/* ------------------------------------------------------------------ */

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  disabled?: boolean
}

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, children, value: itemValue, disabled, ...props }, ref) => {
    const { value, onValueChange, setOpen, registerItem } = React.useContext(SelectContext)
    const isSelected = value === itemValue

    // Register label text so SelectValue can display it
    React.useEffect(() => {
      const label = typeof children === 'string' ? children : itemValue
      registerItem(itemValue, label)
    }, [itemValue, children, registerItem])

    return (
      <div
        ref={ref}
        role="option"
        aria-selected={isSelected}
        aria-disabled={disabled}
        className={cn(
          'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
          isSelected && 'bg-accent text-accent-foreground',
          disabled && 'pointer-events-none opacity-50',
          className
        )}
        data-disabled={disabled || undefined}
        onClick={() => {
          if (disabled) return
          onValueChange?.(itemValue)
          setOpen(false)
        }}
        {...props}
      >
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          {isSelected && <Check className="h-4 w-4" />}
        </span>
        {children}
      </div>
    )
  }
)
SelectItem.displayName = 'SelectItem'

/* ------------------------------------------------------------------ */
/*  Exports                                                           */
/* ------------------------------------------------------------------ */

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
