'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Column<T = any> {
  key: string
  label: string
  sortable?: boolean
  className?: string
  headerClassName?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render?: (value: any, row: T) => React.ReactNode
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DataTableProps<T = any> {
  data: T[]
  columns: Column<T>[]
  keyExtractor: (row: T) => string
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string
  pageSize?: number
  emptyMessage?: string
  emptyIcon?: React.ReactNode
}

type SortDir = 'asc' | 'desc' | null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function DataTable<T = any>({
  data,
  columns,
  keyExtractor,
  onRowClick,
  rowClassName,
  pageSize = 25,
  emptyMessage = 'No records found',
  emptyIcon,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [page, setPage] = useState(1)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else if (sortDir === 'desc') { setSortDir(null); setSortKey(null) }
      else setSortDir('asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return data
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey]
      const bVal = (b as Record<string, unknown>)[sortKey]
      if (aVal == null) return 1
      if (bVal == null) return -1
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      }
      const aStr = String(aVal)
      const bStr = String(bVal)
      return sortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
    })
  }, [data, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize))
  const paginatedData = useMemo(
    () => sortedData.slice((page - 1) * pageSize, page * pageSize),
    [sortedData, page, pageSize]
  )

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sortKey !== colKey) return <ChevronsUpDown size={13} className="text-gray-300" />
    if (sortDir === 'asc') return <ChevronUp size={13} className="text-[#FF6B35]" />
    return <ChevronDown size={13} className="text-[#FF6B35]" />
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        {emptyIcon || <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4" />}
        <p className="text-sm font-medium">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Results count */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{sortedData.length} record{sortedData.length !== 1 ? 's' : ''}</span>
        {sortKey && sortDir && (
          <button
            onClick={() => { setSortKey(null); setSortDir(null) }}
            className="text-[#FF6B35] hover:text-[#E55A25] font-medium transition-colors"
          >
            Clear sort
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-gray-50/80 to-gray-100/40 border-b border-gray-100">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left text-[10px] uppercase tracking-wider font-semibold text-gray-500 whitespace-nowrap ${col.headerClassName || ''}`}
                  >
                    {col.sortable ? (
                      <button
                        onClick={() => handleSort(col.key)}
                        className="flex items-center gap-1.5 hover:text-gray-800 transition-colors group"
                      >
                        {col.label}
                        <SortIcon colKey={col.key} />
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {paginatedData.map((row, idx) => (
                  <motion.tr
                    key={keyExtractor(row)}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, delay: idx * 0.015 }}
                    className={`border-b border-gray-50 last:border-b-0 transition-colors ${
                      onRowClick
                        ? 'cursor-pointer hover:bg-[#FF6B35]/[0.03] hover:border-[#FF6B35]/10'
                        : ''
                    } ${rowClassName ? rowClassName(row) : ''}`}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={`px-4 py-3 text-gray-700 whitespace-nowrap ${col.className || ''}`}>
                        {col.render
                          ? col.render((row as Record<string, unknown>)[col.key], row)
                          : String((row as Record<string, unknown>)[col.key] ?? '')}
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {sortedData.length > pageSize && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="text-xs text-gray-500">
            Showing {(page - 1) * pageSize + 1}&ndash;{Math.min(page * pageSize, sortedData.length)} of {sortedData.length.toLocaleString()}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" disabled={page <= 1} onClick={() => setPage(1)}><ChevronsLeft size={14} /></Button>
            <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></Button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 7) pageNum = i + 1
              else if (page <= 4) pageNum = i + 1
              else if (page >= totalPages - 3) pageNum = totalPages - 6 + i
              else pageNum = page - 3 + i
              return (
                <Button key={pageNum} variant={pageNum === page ? 'default' : 'outline'} size="icon"
                  className={`h-7 w-7 text-xs rounded-lg ${pageNum === page ? 'bg-[#1B2A4A] hover:bg-[#1B2A4A]' : ''}`}
                  onClick={() => setPage(pageNum)}>{pageNum}</Button>
              )
            })}
            <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></Button>
            <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" disabled={page >= totalPages} onClick={() => setPage(totalPages)}><ChevronsRight size={14} /></Button>
          </div>
        </div>
      )}
    </div>
  )
}
