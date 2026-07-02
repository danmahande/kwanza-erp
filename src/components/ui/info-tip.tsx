'use client'

import { Info } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { getGlossaryTerm } from '@/lib/glossary'

interface InfoTipProps {
  /** Key into the glossary, e.g. 'storageLiability' */
  term: string
  /** Optional custom label to show next to the icon — defaults to nothing (icon only) */
  label?: string
  /** Size of the info icon in pixels */
  size?: number
  /** Optional className override */
  className?: string
}

/**
 * InfoTip — a reusable (i) icon that shows plain-English definitions on hover/click.
 *
 * Usage:
 *   <InfoTip term="storageLiability" />
 *   <InfoTip term="rateCard" label="Rate Card" />
 *
 * The term must exist in src/lib/glossary.ts. The tooltip shows the short definition
 * on hover and the full definition (with example) on click.
 */
export function InfoTip({ term, label, size = 14, className }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const [showFull, setShowFull] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const glossaryTerm = getGlossaryTerm(term)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setShowFull(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!glossaryTerm) {
    console.warn(`InfoTip: glossary term "${term}" not found.`)
    return null
  }

  return (
    <div ref={ref} className={cn('inline-flex items-center relative', className)}>
      {label && <span className="mr-1">{label}</span>}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setShowFull(false) }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => { if (!showFull) setOpen(false) }}
        className="inline-flex items-center justify-center text-gray-400 hover:text-[#FF6B35] transition-colors focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 rounded-full"
        aria-label={`More info about ${glossaryTerm.term}`}
      >
        <Info size={size} />
      </button>

      {open && (
        <div
          className="absolute z-50 left-0 top-full mt-1 w-72 sm:w-80 p-3 rounded-xl bg-white shadow-xl border border-gray-100 text-left"
          role="tooltip"
        >
          <p className="text-xs font-semibold text-[#1B2A4A] mb-1">{glossaryTerm.term}</p>
          <p className="text-xs text-gray-600 leading-relaxed">{glossaryTerm.short}</p>

          {showFull && (
            <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
              <p className="text-xs text-gray-700 leading-relaxed">{glossaryTerm.long}</p>
              {glossaryTerm.example && (
                <div className="p-2 rounded-lg bg-orange-50 border border-orange-100">
                  <p className="text-[10px] uppercase tracking-wider text-orange-700 font-semibold mb-0.5">Example</p>
                  <p className="text-xs text-gray-700 leading-relaxed">{glossaryTerm.example}</p>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowFull(s => !s)}
            className="mt-2 text-[11px] text-[#FF6B35] hover:text-[#E55A25] font-medium"
          >
            {showFull ? '− Show less' : '+ Read more'}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Convenience wrapper for inline use next to a heading or label.
 * Renders as inline-flex so it sits naturally next to text.
 *
 * Example:
 *   <h2>Storage Liability <InfoTipInline term="storageLiability" /></h2>
 */
export function InfoTipInline({ term, size = 14, className }: Omit<InfoTipProps, 'label'>) {
  return <InfoTip term={term} size={size} className={cn('align-middle ml-1', className)} />
}
