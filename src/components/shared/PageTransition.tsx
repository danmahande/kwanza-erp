'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ReactNode } from 'react'

/**
 * PageTransition
 *
 * Wraps a full-page view (wizard, analytical view, etc.) and animates its
 * entry/exit with a snappy spring + fade. Use inside an <AnimatePresence mode="wait">
 * at the parent level so the previous view exits before the new one enters.
 *
 * Pattern:
 *   <AnimatePresence mode="wait">
 *     {view === 'list' && <PageTransition key="list">...</PageTransition>}
 *     {view === 'wizard' && <PageTransition key="wizard">...</PageTransition>}
 *   </AnimatePresence>
 *
 * Vibe: Snappy & modern (220ms spring, damping 32, stiffness 340).
 * Matches DetailSlideOver physics for uniformity.
 */

const PAGE_TRANSITION = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
  transition: { type: 'spring' as const, damping: 34, stiffness: 320, mass: 0.8 },
}

export default function PageTransition({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial={PAGE_TRANSITION.initial}
      animate={PAGE_TRANSITION.animate}
      exit={PAGE_TRANSITION.exit}
      transition={PAGE_TRANSITION.transition}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/**
 * Variant: fade-only (for overlays that don't need horizontal motion).
 * Useful when switching between tabs in the same view.
 */
export function FadeTransition({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
