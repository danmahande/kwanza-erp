'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { LucideIcon, Plus } from 'lucide-react'

interface StatItem {
  label: string
  value: string | number
  icon: LucideIcon
  color: string
  bg: string
  border: string
  gradient: string
}

interface OfficeHeaderProps {
  title: string
  description: string
  icon: LucideIcon
  iconColor?: string
  stats: StatItem[]
  actionLabel?: string
  onAction?: () => void
  children?: React.ReactNode
}

export default function OfficeHeader({ title, description, icon: Icon, iconColor = '#FF6B35', stats, actionLabel, onAction, children }: OfficeHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Grand Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1B2A4A] to-[#0F1A2E] p-6 lg:p-8">
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF6B35]/5 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-[#FF6B35]/3 rounded-full translate-y-1/2" />

        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FF6B35]/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Icon size={28} style={{ color: iconColor }} />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">{title}</h1>
              <p className="text-sm text-blue-200/60 mt-0.5">{description}</p>
            </div>
          </div>
          {actionLabel && onAction && (
            <Button
              onClick={onAction}
              className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl h-11 px-6 font-medium shadow-lg shadow-[#FF6B35]/25"
            >
              <Plus size={18} className="mr-2" />
              {actionLabel}
            </Button>
          )}
        </div>

        {/* KPI Strip */}
        <div className="relative mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 + i * 0.05 }}
              className="bg-white/8 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10 hover:bg-white/12 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center shrink-0`}>
                  <stat.icon size={16} style={{ color: stat.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-blue-200/50 uppercase tracking-wider font-medium">{stat.label}</p>
                  <p className="text-lg font-bold text-white truncate">{stat.value}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      {children && (
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {children}
        </div>
      )}
    </motion.div>
  )
}
