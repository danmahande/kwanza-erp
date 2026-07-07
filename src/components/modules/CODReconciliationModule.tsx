'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Wallet, AlertTriangle, CheckCircle2, Banknote, Search, Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader, DenseTable, DenseTh, DenseTd, DenseTr } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { InfoTip } from '@/components/ui/info-tip'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'

interface DriverRow {
  driverId: string
  driverName: string
  phone: string
  codCollected: number
  codBanked: number
  outstanding: number
  damages: number
  loss: number
  pendingBankingsCount: number
  pendingBankingsAmount: number
  shortfallBankingsCount: number
  shortfallBankingsAmount: number
}

interface DriverBanking {
  id: string
  bankingId: string
  driverId: string
  driverName: string
  amount: number
  bankName: string | null
  bankReference: string | null
  slipPhotoUrl: string | null
  runsheetId: string | null
  status: string
  verifiedBy: string | null
  verifiedAt: string | null
  shortfallAmount: number
  notes: string | null
  bankedAt: string
}

interface Driver {
  id: string
  driverId: string
  name: string
  phone: string
}

export default function CODReconciliationModule() {
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [bankings, setBankings] = useState<DriverBanking[]>([])
  const [driverList, setDriverList] = useState<Driver[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [bankingsOpen, setBankingsOpen] = useState(false)
  const [selectedDriver, setSelectedDriver] = useState<DriverRow | null>(null)
  const [form, setForm] = useState({
    driverId: '',
    amount: '',
    bankName: '',
    bankReference: '',
    runsheetId: '',
    notes: '',
  })

  const fetchData = () => {
    fetch('/api/cod-reconciliation').then(r => r.json()).then(d => {
      setDrivers(d.drivers || [])
    })
    fetch('/api/driver-banking').then(r => r.json()).then(setBankings)
  }

  useEffect(() => {
    fetchData()
    fetch('/api/drivers').then(r => r.json()).then(d => setDriverList(Array.isArray(d) ? d : []))
  }, [])

  const filteredDrivers = drivers.filter(d =>
    !search || d.driverName.toLowerCase().includes(search.toLowerCase()) || d.driverId.toLowerCase().includes(search.toLowerCase())
  )

  const totalCollected = drivers.reduce((s, d) => s + d.codCollected, 0)
  const totalBanked = drivers.reduce((s, d) => s + d.codBanked, 0)
  const totalOutstanding = drivers.reduce((s, d) => s + d.outstanding, 0)
  const totalShortfalls = drivers.reduce((s, d) => s + d.shortfallBankingsAmount, 0)

  const kpiCells = [
    { label: 'COLLECTED', value: formatCurrencyCompact(totalCollected) },
    { label: 'BANKED', value: formatCurrencyCompact(totalBanked) },
    { label: 'OUTSTANDING', value: formatCurrencyCompact(totalOutstanding), highlight: totalOutstanding > 0, highlightColor: 'orange' as const },
    { label: 'SHORTFALLS', value: formatCurrencyCompact(totalShortfalls), highlight: totalShortfalls > 0, highlightColor: 'red' as const },
  ]

  const handleCreateBanking = async () => {
    if (!form.driverId || !form.amount) {
      toast.error('Driver and amount are required')
      return
    }
    try {
      const res = await fetch('/api/driver-banking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: form.driverId,
          amount: parseFloat(form.amount),
          bankName: form.bankName || undefined,
          bankReference: form.bankReference || undefined,
          runsheetId: form.runsheetId || undefined,
          notes: form.notes || undefined,
        }),
      })
      if (res.ok) {
        toast.success('Banking recorded')
        setOpen(false)
        setForm({ driverId: '', amount: '', bankName: '', bankReference: '', runsheetId: '', notes: '' })
        fetchData()
      } else {
        toast.error('Failed to record banking')
      }
    } catch {
      toast.error('Failed to record banking')
    }
  }

  const handleVerify = async (banking: DriverBanking) => {
    try {
      const res = await fetch('/api/driver-banking', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: banking.id, status: 'verified', verifiedBy: 'admin' }),
      })
      if (res.ok) {
        toast.success('Banking verified')
        fetchData()
      }
    } catch {
      toast.error('Failed to verify banking')
    }
  }

  const openBankingsForDriver = (driver: DriverRow) => {
    setSelectedDriver(driver)
    setBankingsOpen(true)
  }

  const openCreate = () => {
    setForm({ driverId: '', amount: '', bankName: '', bankReference: '', runsheetId: '', notes: '' })
    setOpen(true)
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-3">
      <OpsHeader
        title="COD Reconciliation"
        description="Driver COD collections vs bankings. verify deposits, flag shortfalls"
        kpiCells={kpiCells}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by driver name or ID..."
        actionLabel="Record Banking"
        onAction={openCreate}
      />

      {/* Dense table */}
      {filteredDrivers.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">No driver COD data.</div>
      ) : (
        <DenseTable>
          <thead>
            <tr>
              <DenseTh>Driver</DenseTh>
              <DenseTh className="w-28">Phone</DenseTh>
              <DenseTh className="w-28 text-right">Collected <InfoTip term="codCollected" size={11} /></DenseTh>
              <DenseTh className="w-28 text-right">Banked <InfoTip term="codBanked" size={11} /></DenseTh>
              <DenseTh className="w-28 text-right">Outstanding</DenseTh>
              <DenseTh className="w-28 text-right">Shortfalls</DenseTh>
              <DenseTh className="w-24 text-center">Actions</DenseTh>
            </tr>
          </thead>
          <tbody>
            {filteredDrivers.map(d => (
              <DenseTr key={d.driverId} tint={d.outstanding > 0 ? 'bg-orange-50/30' : d.shortfallBankingsAmount > 0 ? 'bg-red-50/30' : ''}>
                <DenseTd>
                  <p className="text-gray-900 font-medium">{d.driverName}</p>
                  <p className="text-[10px] text-gray-400 font-mono">{d.driverId}</p>
                </DenseTd>
                <DenseTd className="text-gray-600 text-[10px]">{d.phone || '—'}</DenseTd>
                <DenseTd mono right className="text-green-700">{formatCurrencyCompact(d.codCollected)}</DenseTd>
                <DenseTd mono right className="text-blue-700">{formatCurrencyCompact(d.codBanked)}</DenseTd>
                <DenseTd mono right className={d.outstanding > 0 ? 'text-orange-700 font-bold' : 'text-gray-400'}>{formatCurrencyCompact(d.outstanding)}</DenseTd>
                <DenseTd mono right className={d.shortfallBankingsAmount > 0 ? 'text-red-600 font-bold' : 'text-gray-400'}>
                  {d.shortfallBankingsAmount > 0 ? `${formatCurrencyCompact(d.shortfallBankingsAmount)} (${d.shortfallBankingsCount})` : '—'}
                </DenseTd>
                <DenseTd className="text-center">
                  <button onClick={() => openBankingsForDriver(d)} className="text-[10px] text-[#FF6B35] hover:text-[#E55A25] font-medium">
                    View Bankings
                  </button>
                </DenseTd>
              </DenseTr>
            ))}
          </tbody>
        </DenseTable>
      )}

      <DetailSlideOver
        open={open}
        onClose={() => setOpen(false)}
        title="Record Driver Banking"
        subtitle="Cash deposit made by a driver against their COD collections"
        width="lg"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleCreateBanking} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Record</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Driver <span className="text-red-400">*</span></Label>
            <select
              value={form.driverId}
              onChange={e => setForm({ ...form, driverId: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select a driver...</option>
              {driverList.map(d => (
                <option key={d.driverId} value={d.driverId}>{d.name} ({d.driverId})</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Amount Banked (UGX) <span className="text-red-400">*</span></Label>
            <Input
              type="number"
              value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })}
              placeholder="e.g. 500000"
              className="rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Bank / Agent</Label>
              <Input
                value={form.bankName}
                onChange={e => setForm({ ...form, bankName: e.target.value })}
                placeholder="e.g. Stanbic, MTN MoMo"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Bank Reference</Label>
              <Input
                value={form.bankReference}
                onChange={e => setForm({ ...form, bankReference: e.target.value })}
                placeholder="Slip / transaction ID"
                className="rounded-xl"
              />
            </div>
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Runsheet ID (optional)</Label>
            <Input
              value={form.runsheetId}
              onChange={e => setForm({ ...form, runsheetId: e.target.value })}
              placeholder="If this banking covers a specific runsheet"
              className="rounded-xl"
            />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Notes</Label>
            <Input
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Any extra context"
              className="rounded-xl"
            />
          </div>
        </div>
      </DetailSlideOver>

      <DetailSlideOver
        open={bankingsOpen}
        onClose={() => setBankingsOpen(false)}
        title={selectedDriver ? `Bankings, ${selectedDriver.driverName}` : 'Bankings'}
        subtitle={selectedDriver ? `${selectedDriver.driverId}` : ''}
        width="lg"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={() => setBankingsOpen(false)} className="rounded-xl">Close</Button>
          </div>
        }
      >
        <div className="space-y-3">
          {/* Single dense card, driver COD summary */}
          {selectedDriver && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">COD Summary</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">COD Collected</span>
                  <span className="font-mono font-bold text-green-700">{formatCurrency(selectedDriver.codCollected)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">COD Banked</span>
                  <span className="font-mono font-bold text-blue-700">{formatCurrency(selectedDriver.codBanked)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Outstanding</span>
                  <span className={`font-mono font-bold ${selectedDriver.outstanding > 0 ? 'text-orange-700' : 'text-gray-400'}`}>{formatCurrency(selectedDriver.outstanding)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Pending Bankings</span>
                  <span className="font-mono text-gray-700">{selectedDriver.pendingBankingsCount} ({formatCurrencyCompact(selectedDriver.pendingBankingsAmount)})</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-gray-500">Shortfall Bankings</span>
                  <span className={`font-mono ${selectedDriver.shortfallBankingsAmount > 0 ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                    {selectedDriver.shortfallBankingsCount} ({formatCurrencyCompact(selectedDriver.shortfallBankingsAmount)})
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Banking records, DenseTable */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Banking Records</span>
            {bankings.filter(b => !selectedDriver || b.driverId === selectedDriver.driverId).length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">No bankings recorded for this driver.</div>
            ) : (
              <DenseTable>
                <thead>
                  <tr>
                    <DenseTh className="w-24">Banking ID</DenseTh>
                    <DenseTh className="w-28 text-right">Amount</DenseTh>
                    <DenseTh className="w-32">Bank / Ref</DenseTh>
                    <DenseTh className="w-24 text-center">Status</DenseTh>
                    <DenseTh className="w-20 text-right">Action</DenseTh>
                  </tr>
                </thead>
                <tbody>
                  {bankings
                    .filter(b => !selectedDriver || b.driverId === selectedDriver.driverId)
                    .map(b => (
                      <DenseTr key={b.id} tint={b.status === 'shortfall' ? 'bg-red-50/30' : b.status === 'pending' ? 'bg-orange-50/30' : ''}>
                        <DenseTd mono className="text-gray-500 text-[10px]">{b.bankingId}</DenseTd>
                        <DenseTd mono right className="text-gray-900 font-bold">{formatCurrencyCompact(b.amount)}</DenseTd>
                        <DenseTd className="text-gray-600 text-[10px] truncate max-w-[100px]">
                          {b.bankName || '—'}{b.bankReference ? `, ${b.bankReference}` : ''}
                          {b.shortfallAmount > 0 && <span className="text-red-600 block">SF: {formatCurrencyCompact(b.shortfallAmount)}</span>}
                        </DenseTd>
                        <DenseTd className="text-center">
                          <span className={`inline-block px-1 py-0.5 rounded text-[8px] font-semibold ${
                            b.status === 'verified' ? 'bg-green-100 text-green-700'
                            : b.status === 'shortfall' ? 'bg-red-100 text-red-700'
                            : b.status === 'disputed' ? 'bg-orange-100 text-orange-700'
                            : 'bg-gray-100 text-gray-700'
                          }`}>{b.status.toUpperCase()}</span>
                        </DenseTd>
                        <DenseTd right>
                          {b.status === 'pending' ? (
                            <button onClick={() => handleVerify(b)} className="text-[10px] text-green-600 hover:text-green-700 font-medium">
                              <CheckCircle2 size={12} />
                            </button>
                          ) : (
                            <span className="text-gray-300 text-[10px]">{new Date(b.bankedAt).toLocaleDateString('en-UG', { month: 'short', day: 'numeric' })}</span>
                          )}
                        </DenseTd>
                      </DenseTr>
                    ))}
                </tbody>
              </DenseTable>
            )}
          </div>
        </div>
      </DetailSlideOver>
    </motion.div>
  )
}
