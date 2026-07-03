'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  FileText, Download, Search, Plus, Wallet, CheckCircle2, Clock,
  Send, Check, X, AlertTriangle, Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader, DenseTable, DenseTh, DenseTd, DenseTr } from '@/components/shared/ops-ui'
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
  const [activeFilter, setActiveFilter] = useState('all')
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-3">
      <OpsHeader
        title="Statements"
        description="Monthly merchant statements with approval workflow"
        kpiCells={[
          { label: 'STATEMENTS', value: data.length },
          { label: 'NET PAYABLE', value: formatCurrencyCompact(totalNetPayable) },
          { label: 'PAID', value: paidCount, highlight: paidCount > 0, highlightColor: 'green' as const },
          { label: 'UNPAID', value: unpaidCount, highlight: unpaidCount > 0, highlightColor: 'orange' as const },
        ]}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by statement ID, merchant, or period..."
        actionLabel="Generate Statement"
        onAction={openCreate}
      />

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-gray-400" />
        {[
          { key: 'all', label: 'All', status: '' },
          { key: 'draft', label: 'Draft', status: 'draft' },
          { key: 'pending', label: 'Pending Approval', status: 'pending_approval' },
          { key: 'approved', label: 'Approved', status: 'approved' },
          { key: 'issued', label: 'Issued', status: 'issued' },
          { key: 'paid', label: 'Paid', status: 'paid' },
          { key: 'rejected', label: 'Rejected', status: 'rejected' },
        ].map(chip => {
          const count = chip.key === 'all' ? data.length : data.filter(s => s.isPaid && chip.status === 'paid' ? true : !s.isPaid && s.status === chip.status).length
          const isActive = (activeFilter === chip.key)
          return (
            <button key={chip.key} onClick={() => setActiveFilter(chip.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isActive ? 'bg-[#FF6B35] text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {chip.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${isActive ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Dense table */}
      {data.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">No statements found.</div>
      ) : (
        <DenseTable>
          <thead>
            <tr>
              <DenseTh className="w-28">Statement ID</DenseTh>
              <DenseTh>Merchant</DenseTh>
              <DenseTh className="w-20">Period</DenseTh>
              <DenseTh className="w-28 text-right">Sales</DenseTh>
              <DenseTh className="w-28 text-right">Fees</DenseTh>
              <DenseTh className="w-28 text-right">Net Payable</DenseTh>
              <DenseTh className="w-28 text-center">Status</DenseTh>
              <DenseTh className="w-20 text-right">Actions</DenseTh>
            </tr>
          </thead>
          <tbody>
            {data.map((stmt) => {
              const totalFees = stmt.inboundFees + stmt.storageFees + stmt.outboundFees + stmt.returnFees + stmt.shrinkageDebits + stmt.codFees + stmt.commissions
              const statusCls = stmt.isPaid ? 'bg-green-100 text-green-700'
                : stmt.status === 'issued' ? 'bg-blue-100 text-blue-700'
                : stmt.status === 'approved' ? 'bg-purple-100 text-purple-700'
                : stmt.status === 'pending_approval' ? 'bg-amber-100 text-amber-700'
                : stmt.status === 'rejected' ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-700'
              const statusLabel = stmt.isPaid ? 'PAID' : stmt.status === 'pending_approval' ? 'PEND APPR' : stmt.status.toUpperCase()
              return (
                <DenseTr key={stmt.id} onClick={() => openView(stmt)} tint={stmt.status === 'rejected' ? 'bg-red-50/30' : stmt.isPaid ? 'bg-green-50/30' : ''}>
                  <DenseTd mono className="text-gray-500">{stmt.statementId}</DenseTd>
                  <DenseTd className="text-gray-900 font-medium">{stmt.merchantName}</DenseTd>
                  <DenseTd mono className="text-gray-500">{stmt.period}</DenseTd>
                  <DenseTd mono right className="text-gray-700">{formatCurrencyCompact(stmt.salesValue)}</DenseTd>
                  <DenseTd mono right className="text-red-600">{formatCurrencyCompact(totalFees)}</DenseTd>
                  <DenseTd mono right className="text-gray-900 font-bold">{formatCurrencyCompact(stmt.netPayable)}</DenseTd>
                  <DenseTd className="text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${statusCls}`}>{statusLabel}</span>
                  </DenseTd>
                  <DenseTd right>
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handleDownload(stmt, 'excel')} title="Excel" className="p-1 text-gray-400 hover:text-green-600"><Download size={11} /></button>
                      <button onClick={() => handleDownload(stmt, 'pdf')} title="PDF" className="p-1 text-gray-400 hover:text-red-600"><FileText size={11} /></button>
                    </div>
                  </DenseTd>
                </DenseTr>
              )
            })}
          </tbody>
        </DenseTable>
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
