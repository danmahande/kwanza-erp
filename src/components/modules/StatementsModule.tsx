'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  FileText, Download, Search, Plus, Wallet, CheckCircle2, Clock,
  Send, Check, X, AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { InfoTip } from '@/components/ui/info-tip'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'

interface Statement {
  id: string
  statementId: string
  merchantId: string
  merchantName: string
  period: string
  openingBalance: number
  inboundFees: number
  storageFees: number
  outboundFees: number
  returnFees: number
  shrinkageDebits: number
  codCollected: number
  codFees: number
  commissions: number
  salesValue: number
  netPayable: number
  isPaid: boolean
  paidAt: string | null
  status: string
  submittedBy: string | null
  submittedAt: string | null
  approvedBy: string | null
  approvedAt: string | null
  rejectedBy: string | null
  rejectionReason: string | null
  pdfUrl: string | null
  excelUrl: string | null
  createdAt: string
}

interface Merchant {
  id: string
  merchantId: string
  businessName: string
}

export default function StatementsModule() {
  const [data, setData] = useState<Statement[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Statement | null>(null)
  const [form, setForm] = useState({
    merchantId: '',
    period: new Date().toISOString().slice(0, 7),
  })
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetch('/api/merchants').then(r => r.json()).then(setMerchants)
    fetchData()
  }, [])

  const fetchData = () => {
    fetch(`/api/merchant-statements?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => { fetchData() }, [search])

  const totalNetPayable = data.reduce((s, d) => s + d.netPayable, 0)
  const paidCount = data.filter(d => d.isPaid).length
  const unpaidCount = data.length - paidCount

  const stats = [
    { label: 'Total Statements', value: data.length, icon: FileText, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Net Payable (all)', value: formatCurrencyCompact(totalNetPayable), icon: Wallet, color: '#3B82F6', bg: 'bg-blue-500/20', border: 'border-blue-400/30', gradient: 'from-blue-500/10 to-blue-500/5' },
    { label: 'Paid', value: paidCount, icon: CheckCircle2, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'Unpaid', value: unpaidCount, icon: Clock, color: '#EF4444', bg: 'bg-red-500/20', border: 'border-red-400/30', gradient: 'from-red-500/10 to-red-500/5' },
  ]

  const handleGenerate = async () => {
    if (!form.merchantId || !form.period) {
      toast.error('Please select a merchant and period')
      return
    }
    setGenerating(true)
    try {
      const res = await fetch('/api/merchant-statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: form.merchantId,
          period: form.period,
          generatedBy: 'admin',
        }),
      })
      const result = await res.json()
      if (res.ok) {
        toast.success(`Statement generated. Net payable: ${formatCurrency(result.netPayable)}`)
        setOpen(false)
        fetchData()
      } else {
        toast.error(result.error || 'Failed to generate statement')
      }
    } catch {
      toast.error('Failed to generate statement')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async (stmt: Statement, format: 'excel' | 'pdf') => {
    try {
      const res = await fetch(`/api/merchant-statements?id=${stmt.id}&format=${format}`)
      const result = await res.json()
      if (res.ok) {
        toast.success(`${format.toUpperCase()} ready: ${result.fileName}`)
      } else {
        toast.error(result.error || `Failed to generate ${format.toUpperCase()}`)
      }
    } catch {
      toast.error(`Failed to generate ${format.toUpperCase()}`)
    }
  }

  // ── Approval workflow actions ──
  const handleStatementAction = async (stmt: Statement, action: 'submit' | 'approve' | 'reject' | 'issue') => {
    let reason: string | undefined
    if (action === 'reject') {
      const r = prompt('Reason for rejection:')
      if (r === null) return
      reason = r || 'Rejected by approver'
    }
    try {
      const res = await fetch('/api/merchant-statements', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: stmt.id, reason, by: 'admin' }),
      })
      const result = await res.json()
      if (res.ok) {
        toast.success(`Statement ${action}ed`)
        fetchData()
        if (editing?.id === stmt.id) setEditing({ ...stmt, ...result })
      } else {
        toast.error(result.error || `Failed to ${action} statement`)
      }
    } catch {
      toast.error(`Failed to ${action} statement`)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ merchantId: '', period: new Date().toISOString().slice(0, 7) })
    setOpen(true)
  }

  const openView = (stmt: Statement) => {
    setEditing(stmt)
    setOpen(true)
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <OfficeHeader
        title="Statements Office"
        description="Generate monthly merchant statements and download as Excel or PDF"
        icon={FileText}
        stats={stats}
        actionLabel="Generate Statement"
        onAction={openCreate}
      >
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by statement ID, merchant, or period..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 rounded-xl border-gray-200 bg-white"
          />
        </div>
      </OfficeHeader>

      {data.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <FileText size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No statements yet</p>
          <p className="text-sm text-gray-400 mt-1">Generate the first monthly statement for a merchant</p>
        </motion.div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Statement ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Merchant</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Period</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Sales</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Fees</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Net Payable</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((stmt, i) => {
                  const totalFees = stmt.inboundFees + stmt.storageFees + stmt.outboundFees + stmt.returnFees + stmt.shrinkageDebits + stmt.codFees + stmt.commissions
                  return (
                    <motion.tr
                      key={stmt.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.03 }}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                      onClick={() => openView(stmt)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{stmt.statementId}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{stmt.merchantName}</td>
                      <td className="px-4 py-3 text-gray-600">{stmt.period}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(stmt.salesValue)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{formatCurrency(totalFees)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(stmt.netPayable)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={
                          stmt.isPaid ? 'bg-green-100 text-green-700 hover:bg-green-100 border-0 text-[10px]'
                          : stmt.status === 'issued' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 text-[10px]'
                          : stmt.status === 'approved' ? 'bg-purple-100 text-purple-700 hover:bg-purple-100 border-0 text-[10px]'
                          : stmt.status === 'pending_approval' ? 'bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 text-[10px]'
                          : stmt.status === 'rejected' ? 'bg-red-100 text-red-700 hover:bg-red-100 border-0 text-[10px]'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-100 border-0 text-[10px]'
                        }>
                          {stmt.isPaid ? 'PAID' : stmt.status === 'pending_approval' ? 'PENDING APPROVAL' : stmt.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownload(stmt, 'excel')} title="Download Excel">
                            <Download size={14} className="text-green-600" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownload(stmt, 'pdf')} title="Download PDF">
                            <FileText size={14} className="text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DetailSlideOver
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Statement ${editing.statementId}` : 'Generate Statement'}
        subtitle={editing ? `${editing.merchantName} — ${editing.period}` : 'Select a merchant and the monthly period to generate for'}
        width="lg"
        footer={
          <div className="flex items-center gap-2 flex-wrap">
            {editing && !editing.isPaid && (
              <>
                {editing.status === 'draft' && (
                  <Button variant="outline" className="rounded-xl text-[#FF6B35] border-[#FF6B35]/30 hover:bg-[#FF6B35]/5"
                    onClick={() => handleStatementAction(editing, 'submit')}>
                    <Send size={14} className="mr-1.5" /> Submit for Approval
                  </Button>
                )}
                {editing.status === 'pending_approval' && (
                  <>
                    <Button className="rounded-xl bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleStatementAction(editing, 'approve')}>
                      <Check size={14} className="mr-1.5" /> Approve
                    </Button>
                    <Button variant="outline" className="rounded-xl text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => handleStatementAction(editing, 'reject')}>
                      <X size={14} className="mr-1.5" /> Reject
                    </Button>
                  </>
                )}
                {editing.status === 'approved' && (
                  <Button className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => handleStatementAction(editing, 'issue')}>
                    <FileText size={14} className="mr-1.5" /> Issue to Merchant
                  </Button>
                )}
                {editing.status === 'rejected' && (
                  <span className="text-xs text-red-600 italic mr-2">Rejected: {editing.rejectionReason}</span>
                )}
              </>
            )}
            <div className="flex gap-3 ml-auto">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Close</Button>
              {!editing && (
                <Button onClick={handleGenerate} disabled={generating} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
                  {generating ? 'Generating...' : 'Generate'}
                </Button>
              )}
            </div>
          </div>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-400/30">
              <p className="text-xs uppercase tracking-wider text-orange-700 font-semibold mb-1">Net Payable to Merchant</p>
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(editing.netPayable)}</p>
              <p className="text-xs text-gray-500 mt-1">Period: {editing.period}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-white border border-gray-100">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Opening Balance</p>
                <p className="font-semibold text-gray-900">{formatCurrency(editing.openingBalance)}</p>
              </div>
              <div className="p-3 rounded-lg bg-white border border-gray-100">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Sales Value</p>
                <p className="font-semibold text-green-700">{formatCurrency(editing.salesValue)}</p>
              </div>
              <div className="p-3 rounded-lg bg-white border border-gray-100">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Inbound Fees</p>
                <p className="font-semibold text-red-600">{formatCurrency(editing.inboundFees)}</p>
              </div>
              <div className="p-3 rounded-lg bg-white border border-gray-100">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                  Storage Fees <InfoTip term="storageLiability" size={11} />
                </p>
                <p className="font-semibold text-red-600">{formatCurrency(editing.storageFees)}</p>
              </div>
              <div className="p-3 rounded-lg bg-white border border-gray-100">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Outbound Pick/Pack</p>
                <p className="font-semibold text-red-600">{formatCurrency(editing.outboundFees)}</p>
              </div>
              <div className="p-3 rounded-lg bg-white border border-gray-100">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Return Fees</p>
                <p className="font-semibold text-red-600">{formatCurrency(editing.returnFees)}</p>
              </div>
              <div className="p-3 rounded-lg bg-white border border-gray-100">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                  Shrinkage <InfoTip term="shrinkage" size={11} />
                </p>
                <p className="font-semibold text-red-600">{formatCurrency(editing.shrinkageDebits)}</p>
              </div>
              <div className="p-3 rounded-lg bg-white border border-gray-100">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                  Commission <InfoTip term="commission" size={11} />
                </p>
                <p className="font-semibold text-red-600">{formatCurrency(editing.commissions)}</p>
              </div>
              <div className="p-3 rounded-lg bg-white border border-gray-100">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                  COD Collected <InfoTip term="codCollected" size={11} />
                </p>
                <p className="font-semibold text-green-700">{formatCurrency(editing.codCollected)}</p>
              </div>
              <div className="p-3 rounded-lg bg-white border border-gray-100">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">COD Fees</p>
                <p className="font-semibold text-red-600">{formatCurrency(editing.codFees)}</p>
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-gray-100">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => handleDownload(editing, 'excel')}>
                <Download size={14} className="mr-2" /> Download Excel
              </Button>
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => handleDownload(editing, 'pdf')}>
                <FileText size={14} className="mr-2" /> Download PDF
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Merchant <span className="text-red-400">*</span></Label>
              <select
                value={form.merchantId}
                onChange={e => setForm({ ...form, merchantId: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select a merchant...</option>
                {merchants.map(m => (
                  <option key={m.merchantId} value={m.merchantId}>{m.businessName} ({m.merchantId})</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Period (YYYY-MM) <span className="text-red-400">*</span></Label>
              <Input
                type="month"
                value={form.period}
                onChange={e => setForm({ ...form, period: e.target.value })}
                className="rounded-xl"
              />
              <p className="text-xs text-gray-500 mt-2">
                <InfoTip term="statement" size={12} className="mr-1" />
                Generates a complete statement for the selected month, including all fees, sales, COD, and shrinkage. Downloads available as Excel and PDF.
              </p>
            </div>
          </div>
        )}
      </DetailSlideOver>
    </motion.div>
  )
}
