'use client'

import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DetailSlideOverProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  width?: 'md' | 'lg' | 'xl'
}

const widthMap = {
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
}

export default function DetailSlideOver({ open, onClose, title, subtitle, children, footer, width = 'lg' }: DetailSlideOverProps) {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [open, handleEscape])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={`fixed right-0 top-0 bottom-0 ${widthMap[width]} w-full bg-white shadow-2xl z-50 flex flex-col overflow-hidden`}
          >
            {/* Header */}
            <div className="shrink-0 px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50/80 to-white">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-gray-900 truncate">{title}</h2>
                  {subtitle && (
                    <p className="text-sm text-gray-400 mt-0.5 truncate">{subtitle}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="shrink-0 ml-4 rounded-xl hover:bg-gray-100 h-9 w-9"
                >
                  <X size={18} className="text-gray-500" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="p-6">
                {children}
              </div>
            </div>

            {/* Footer */}
            {footer && (
              <div className="shrink-0 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
