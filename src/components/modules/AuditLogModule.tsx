'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, Search, Filter } from 'lucide-react'
import { OpsHeader } from '@/components/shared/ops-ui'
import { format } from 'date-fns'

interface AuditLog {
  id: string
  userId: string | null
  userName: string | null
  action: string
  module: string
  entityId: string | null
  details: string | null
  createdAt: string
}

export default function AuditLogModule() {
  const [data, setData] = useState<AuditLog[]>([])
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')

  const fetchData = () => {
    fetch(`/api/audit-log?search=${search}&module=${moduleFilter}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }

  useEffect(() => { fetchData() }, [search, moduleFilter])

  const stats = [
    { label: 'Total Events', value: data.length, icon: ClipboardList, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Last 24h', value: data.filter(l => Date.now() - new Date(l.createdAt).getTime() < 86400000).length, icon: ClipboardList, color: '#3B82F6', bg: 'bg-blue-500/20', border: 'border-blue-400/30', gradient: 'from-blue-500/10 to-blue-500/5' },
    { label: 'Last 7 days', value: data.filter(l => Date.now() - new Date(l.createdAt).getTime() < 604800000).length, icon: ClipboardList, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
  ]

  const moduleOptions = ['all', ...Array.from(new Set(data.map(l => l.module)))]

  const actionColor = (action: string) => {
    const a = action.toUpperCase()
    if (a.includes('CREATE')) return 'bg-green-100 text-green-700 border-0'
    if (a.includes('UPDATE') || a.includes('APPROVE')) return 'bg-blue-100 text-blue-700 border-0'
    if (a.includes('DELETE') || a.includes('REJECT')) return 'bg-red-100 text-red-700 border-0'
    if (a.includes('STATUS')) return 'bg-purple-100 text-purple-700 border-0'
    return 'bg-gray-100 text-gray-700 border-0'
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-3">
      <OpsHeader
        title="Audit Log"
        description="Every state change recorded. for compliance and dispute resolution"
        kpiCells={[
          { label: 'TOTAL EVENTS', value: data.length },
          { label: 'LAST 24H', value: data.filter(l => Date.now() - new Date(l.createdAt).getTime() < 86400000).length },
          { label: 'LAST 7 DAYS', value: data.filter(l => Date.now() - new Date(l.createdAt).getTime() < 604800000).length },
        ]}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by action, user, or details..."
      >
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <select
            value={moduleFilter}
            onChange={e => setModuleFilter(e.target.value)}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs h-7"
          >
            {moduleOptions.map(m => (
              <option key={m} value={m}>{m === 'all' ? 'All modules' : m}</option>
            ))}
          </select>
        </div>
      </OpsHeader>

      {data.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <ClipboardList size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No audit log entries</p>
          <p className="text-sm text-gray-400 mt-1">Audit entries appear here as users perform actions across the system</p>
        </motion.div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Timestamp</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">User</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Module</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Action</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Entity</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 200).map((l, i) => (
                  <motion.tr
                    key={l.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: Math.min(i * 0.01, 0.5) }}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono whitespace-nowrap">
                      {format(new Date(l.createdAt), 'MMM d, yyyy HH:mm:ss')}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{l.userName || l.userId || 'system'}</td>
                    <td className="px-4 py-3">
                      <Badge className="bg-gray-100 text-gray-700 border-0 text-[10px]">{l.module}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${actionColor(l.action)}`}>{l.action}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{l.entityId || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-md truncate" title={l.details || ''}>{l.details || '—'}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.length > 200 && (
            <div className="p-3 text-center text-xs text-gray-500 border-t border-gray-100">
              Showing 200 of {data.length} entries. Use search to filter.
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
