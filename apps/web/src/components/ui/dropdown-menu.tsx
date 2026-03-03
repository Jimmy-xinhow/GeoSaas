'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Context                                                           */
/* ------------------------------------------------------------------ */

interface DropdownMenuContextValue {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  triggerRef: React.RefObject<HTMLElement>
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue>({
  open: false,
  setOpen: () => {},
  triggerRef: { current: null },
})

/* ------------------------------------------------------------------ */
/*  DropdownMenu (root)                                               */
/* ------------------------------------------------------------------ */

interface DropdownMenuProps {
  children: React.ReactNode
}

function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLElement>(null)

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef }}>
      <div className="relative inline-block">{children}</div>
    </DropdownMenuContext.Provider>
  )
}

/* ------------------------------------------------------------------ */
/*  DropdownMenuTrigger                                               */
/* ------------------------------------------------------------------ */

interface DropdownMenuTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
}

const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuTriggerProps
>(({ className, children, asChild, onClick, ...props }, ref) => {
  const { open, setOpen, triggerRef } = React.useContext(DropdownMenuContext)

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setOpen((prev) => !prev)
    onClick?.(e)
  }

  // When asChild, clone the single child element with our click handler
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: (e: React.MouseEvent<HTMLElement>) => {
        setOpen((prev) => !prev)
        ;(children as React.ReactElement<any>).props.onClick?.(e)
      },
      ref: (node: HTMLElement | null) => {
        ;(triggerRef as React.MutableRefObject<HTMLElement | null>).current = node
        if (typeof ref === 'function') ref(node as HTMLButtonElement | null)
        else if (ref)
          (ref as React.MutableRefObject<HTMLButtonElement | null>).current =
            node as HTMLButtonElement | null
        // also forward the child's ref if it has one
        const childRef = (children as any).ref
        if (typeof childRef === 'function') childRef(node)
        else if (childRef) childRef.current = node
      },
      'aria-expanded': open,
      'data-state': open ? 'open' : 'closed',
    })
  }

  return (
    <button
      ref={(node) => {
        ;(triggerRef as React.MutableRefObject<HTMLElement | null>).current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node
      }}
      type="button"
      aria-expanded={open}
      data-state={open ? 'open' : 'closed'}
      className={className}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  )
})
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger'

/* ------------------------------------------------------------------ */
/*  DropdownMenuContent                                               */
/* ------------------------------------------------------------------ */

interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
}

const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  DropdownMenuContentProps
>(({ className, children, align = 'center', sideOffset = 4, ...props }, ref) => {
  const { open, setOpen } = React.useContext(DropdownMenuContext)
  const contentRef = React.useRef<HTMLDivElement>(null)

  // Close when clicking outside
  React.useEffect(() => {
    if (!open) return

    function handleClick(e: MouseEvent) {
      if (
        contentRef.current &&
        !contentRef.current.contains(e.target as Node)
      ) {
        setTimeout(() => setOpen(false), 0)
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, setOpen])

  if (!open) return null

  const alignClass =
    align === 'end'
      ? 'right-0'
      : align === 'start'
      ? 'left-0'
      : 'left-1/2 -translate-x-1/2'

  return (
    <div
      ref={(node) => {
        ;(contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
      }}
      role="menu"
      data-state={open ? 'open' : 'closed'}
      className={cn(
        'absolute z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
        'animate-in fade-in-0 zoom-in-95',
        alignClass,
        className
      )}
      style={{ marginTop: sideOffset }}
      {...props}
    >
      {children}
    </div>
  )
})
DropdownMenuContent.displayName = 'DropdownMenuContent'

/* ------------------------------------------------------------------ */
/*  DropdownMenuItem                                                  */
/* ------------------------------------------------------------------ */

interface DropdownMenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  disabled?: boolean
}

const DropdownMenuItem = React.forwardRef<HTMLDivElement, DropdownMenuItemProps>(
  ({ className, children, disabled, onClick, ...props }, ref) => {
    const { setOpen } = React.useContext(DropdownMenuContext)

    return (
      <div
        ref={ref}
        role="menuitem"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        data-disabled={disabled || undefined}
        className={cn(
          'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
          disabled && 'pointer-events-none opacity-50',
          className
        )}
        onClick={(e) => {
          if (disabled) return
          onClick?.(e)
          setOpen(false)
        }}
        {...props}
      >
        {children}
      </div>
    )
  }
)
DropdownMenuItem.displayName = 'DropdownMenuItem'

/* ------------------------------------------------------------------ */
/*  DropdownMenuSeparator                                             */
/* ------------------------------------------------------------------ */

interface DropdownMenuSeparatorProps
  extends React.HTMLAttributes<HTMLDivElement> {}

const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  DropdownMenuSeparatorProps
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      role="separator"
      className={cn('-mx-1 my-1 h-px bg-muted', className)}
      {...props}
    />
  )
})
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator'

/* ------------------------------------------------------------------ */
/*  Exports                                                           */
/* ------------------------------------------------------------------ */

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
}
