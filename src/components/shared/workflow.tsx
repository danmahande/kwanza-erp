'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  getAllowedTransitions, getStage, getNextMainStep, getMainStages, getStageIndex,
  type WorkflowStage,
} from '@/lib/workflow'
import { Check, ChevronRight, AlertTriangle, X, RotateCcw, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'

// ── WorkflowActions ──
// Renders the action buttons for the current status — only legal transitions are shown.

interface WorkflowActionsProps {
  module: string
  currentStatus: string
  onTransition: (toStatus: string) => void
  size?: 'sm' | 'lg' | 'default'
  variant?: 'inline' | 'stacked'
}

export function WorkflowActions({
  module, currentStatus, onTransition, size = 'sm', variant = 'inline',
}: WorkflowActionsProps) {
  const allowed = getAllowedTransitions(module, currentStatus)
  if (allowed.length === 0) return null

  const buttons = allowed.map(toStatus => {
    const stage = getStage(module, toStatus)
    if (!stage) return null
    const isException = stage.isException
    const label = stage.action || `→ ${stage.label}`
    return { toStatus, label, isException }
  }).filter(Boolean) as Array<{ toStatus: string; label: string; isException: boolean }>

  if (buttons.length === 0) return null

  const mainButtons = buttons.filter(b => !b.isException)
  const exceptionButtons = buttons.filter(b => b.isException)

  const btn = (b: { toStatus: string; label: string; isException: boolean }, idx: number) => (
    <Button
      key={b.toStatus}
      size={size}
      variant={b.isException ? 'outline' : 'default'}
      onClick={(e) => { e.stopPropagation(); onTransition(b.toStatus) }}
      className={
        b.isException
          ? 'text-red-600 border-red-200 hover:bg-red-50 rounded-lg'
          : 'bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-lg'
      }
    >
      {b.isException ? <X size={12} className="mr-1" /> : <Check size={12} className="mr-1" />}
      {b.label}
    </Button>
  )

  if (variant === 'stacked') {
    return (
      <div className="flex flex-col gap-1">
        {mainButtons.map(btn)}
        {exceptionButtons.length > 0 && (
          <div className="flex gap-1 mt-1 pt-1 border-t border-gray-100">
            {exceptionButtons.map(btn)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {mainButtons.map(btn)}
      {exceptionButtons.length > 0 && exceptionButtons.map(btn)}
    </div>
  )
}

// ── NextStepBanner ──
// Shows a "Next: X" banner at the top of a record — guides the user to the next action.

interface NextStepBannerProps {
  module: string
  currentStatus: string
  onAdvance?: (toStatus: string) => void
  customMessage?: string
}

export function NextStepBanner({ module, currentStatus, onAdvance, customMessage }: NextStepBannerProps) {
  const next = getNextMainStep(module, currentStatus)
  const currentStage = getStage(module, currentStatus)
  if (!next && !customMessage) return null

  // Terminal state — show a "complete" banner
  if (!next) {
    const isException = currentStage?.isException
    return (
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        className={`p-3 rounded-xl border flex items-center gap-2 ${
          isException
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-green-50 border-green-200 text-green-800'
        }`}
      >
        {isException ? <AlertTriangle size={16} /> : <Check size={16} />}
        <span className="text-sm font-medium">
          {isException ? 'Workflow ended:' : 'Complete:'} {currentStage?.label}
        </span>
        <span className="text-xs opacity-70">— {currentStage?.description}</span>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-3 rounded-xl bg-orange-50 border border-orange-200 flex items-center gap-3"
    >
      <div className="w-8 h-8 rounded-full bg-[#FF6B35] flex items-center justify-center shrink-0">
        <ArrowRight size={16} className="text-white" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-orange-900">
          Next: {next.action || `→ ${next.label}`}
        </p>
        <p className="text-xs text-orange-700">{next.description}</p>
      </div>
      {onAdvance && (
        <Button
          size="sm"
          onClick={() => onAdvance(next.status)}
          className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-lg"
        >
          {next.action || 'Advance'} <ChevronRight size={14} className="ml-1" />
        </Button>
      )}
    </motion.div>
  )
}

// ── StatusStepper ──
// Visual progress indicator: ● Picked → ● Packed → ○ Dispatched → ○ Delivered

interface StatusStepperProps {
  module: string
  currentStatus: string
  size?: 'sm' | 'md'
}

export function StatusStepper({ module, currentStatus, size = 'sm' }: StatusStepperProps) {
  const mainStages = getMainStages(module)
  const currentIndex = getStageIndex(module, currentStatus)
  const currentStage = getStage(module, currentStatus)
  const isException = currentStage?.isException

  if (mainStages.length === 0) {
    // Fallback: just show the status as a badge
    return <Badge className="bg-gray-100 text-gray-700 border-0 text-[10px]">{currentStatus}</Badge>
  }

  const iconSize = size === 'sm' ? 10 : 12
  const textSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]'

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {mainStages.map((stage, idx) => {
        const isDone = idx < currentIndex
        const isCurrent = idx === currentIndex
        const isFuture = idx > currentIndex
        return (
          <div key={stage.status} className="flex items-center gap-1">
            <div className={`flex items-center gap-1 ${textSize}`}>
              <div
                className={`rounded-full flex items-center justify-center ${
                  size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'
                } ${
                  isDone
                    ? 'bg-green-500 text-white'
                    : isCurrent
                    ? 'bg-[#FF6B35] text-white'
                    : 'bg-gray-200 text-gray-400'
                }`}
              >
                {isDone && <Check size={iconSize} />}
                {isCurrent && <span className={size === 'sm' ? 'text-[8px]' : 'text-[10px]'}>●</span>}
              </div>
              <span
                className={
                  isDone
                    ? 'text-green-700 font-medium'
                    : isCurrent
                    ? 'text-[#FF6B35] font-semibold'
                    : 'text-gray-400'
                }
              >
                {stage.label}
              </span>
            </div>
            {idx < mainStages.length - 1 && (
              <ChevronRight size={size === 'sm' ? 10 : 12} className="text-gray-300" />
            )}
          </div>
        )
      })}
      {isException && (
        <Badge className="ml-2 bg-red-100 text-red-700 border-0 text-[9px]">
          <AlertTriangle size={9} className="mr-1" />
          {currentStage?.label}
        </Badge>
      )}
    </div>
  )
}

// ── StatusBadge (simple) ──
// Just a colored badge based on the workflow stage

export function WorkflowStatusBadge({ module, status }: { module: string; status: string }) {
  const stage = getStage(module, status)
  if (!stage) return <Badge className="bg-gray-100 text-gray-700 border-0 text-[10px]">{status}</Badge>

  const isException = stage.isException
  const isTerminal = getAllowedTransitions(module, status).length === 0

  let color = 'bg-blue-100 text-blue-700 border-0'
  if (isException) color = 'bg-red-100 text-red-700 border-0'
  else if (isTerminal && status !== 'pending' && status !== 'new_order' && status !== 'initiated' && status !== 'received') {
    color = 'bg-green-100 text-green-700 border-0'
  } else if (status === 'pending' || status === 'new_order' || status === 'initiated' || status === 'received') {
    color = 'bg-gray-100 text-gray-700 border-0'
  }

  return <Badge className={`text-[10px] ${color}`}>{stage.label}</Badge>
}
