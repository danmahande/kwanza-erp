'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Wallet, AlertTriangle, CheckCircle2, Banknote, Search,
} from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
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

  const stats = [
    { label: 'COD Collected', value: formatCurrencyCompact(totalCollected), icon: Banknote, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'COD Banked', value: formatCurrencyCompact(totalBanked), icon: Wallet, color: '#3B82F6', bg: 'bg-blue-500/20', border: 'border-blue-400/30', gradient: 'from-blue-500/10 to-blue-500/5' },
    { label: 'Outstanding', value: formatCurrencyCompact(totalOutstanding), icon: AlertTriangle, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Shortfalls', value: formatCurrencyCompact(totalShortfalls), icon: AlertTriangle, color: '#EF4444', bg: 'bg-red-500/20', border: 'border-red-400/30', gradient: 'from-red-500/10 to-red-500/5' },
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <OfficeHeader
        title="COD Reconciliation"
        description="Track driver COD collections vs bankings. Verify deposits and flag shortfalls."
        icon={Wallet}
        stats={stats}
        actionLabel="Record Banking"
        onAction={openCreate}
      >
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by driver name or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 rounded-xl border-gray-200 bg-white"
          />
        </div>
      </OfficeHeader>

      {filteredDrivers.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Wallet size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No driver COD data yet</p>
          <p className="text-sm text-gray-400 mt-1">COD reconciliation appears once drivers start delivering COD orders</p>
        </motion.div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Driver</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Phone</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    COD Collected <InfoTip term="codCollected" size={11} />
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    COD Banked <InfoTip term="codBanked" size={11} />
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Outstanding</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Shortfalls <InfoTip term="shortfall" size={11} />
                  </th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDrivers.map((d, i) => (
                  <motion.tr
                    key={d.driverId}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.03 }}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{d.driverName}</p>
                      <p className="text-xs text-gray-400 font-mono">{d.driverId}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{d.phone || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-700">{formatCurrency(d.codCollected)}</td>
                    <td className="px-4 py-3 text-right font-medium text-blue-700">{formatCurrency(d.codBanked)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={d.outstanding > 0 ? 'font-bold text-orange-700' : 'text-gray-500'}>
                        {formatCurrency(d.outstanding)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {d.shortfallBankingsAmount > 0 ? (
                        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0 text-[10px]">
                          {formatCurrencyCompact(d.shortfallBankingsAmount)} ({d.shortfallBankingsCount})
                        </Badge>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => openBankingsForDriver(d)}>
                        View Bankings
                      </Button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
        title={selectedDriver ? `Bankings — ${selectedDriver.driverName}` : 'Bankings'}
        subtitle={selectedDriver ? `${formatCurrency(selectedDriver.codCollected)} collected, ${formatCurrency(selectedDriver.codBanked)} banked, ${formatCurrency(selectedDriver.outstanding)} outstanding` : ''}
        width="lg"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={() => setBankingsOpen(false)} className="rounded-xl">Close</Button>
          </div>
        }
      >
        <div className="space-y-3">
          {bankings.filter(b => !selectedDriver || b.driverId === selectedDriver.driverId).length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No bankings recorded for this driver yet.</p>
          ) : (
            bankings
              .filter(b => !selectedDriver || b.driverId === selectedDriver.driverId)
              .map(b => (
                <div key={b.id} className="p-3 rounded-xl border border-gray-100 bg-white">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-mono text-xs text-gray-400">{b.bankingId}</p>
                      <p className="font-bold text-gray-900">{formatCurrency(b.amount)}</p>
                      <p className="text-xs text-gray-500">{new Date(b.bankedAt).toLocaleString()}</p>
                    </div>
                    <Badge className={
                      b.status === 'verified' ? 'bg-green-100 text-green-700 hover:bg-green-100 border-0 text-[10px]'
                      : b.status === 'shortfall' ? 'bg-red-100 text-red-700 hover:bg-red-100 border-0 text-[10px]'
                      : b.status === 'disputed' ? 'bg-orange-100 text-orange-700 hover:bg-orange-100 border-0 text-[10px]'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-100 border-0 text-[10px]'
                    }>
                      {b.status.toUpperCase()}
                    </Badge>
                  </div>
                  {(b.bankName || b.bankReference) && (
                    <p className="text-xs text-gray-600">
                      {b.bankName} {b.bankReference && `· Ref: ${b.bankReference}`}
                    </p>
                  )}
                  {b.shortfallAmount > 0 && (
                    <p className="text-xs text-red-600 mt-1">Shortfall: {formatCurrency(b.shortfallAmount)}</p>
                  )}
                  {b.notes && <p className="text-xs text-gray-500 mt-1 italic">{b.notes}</p>}
                  {b.status === 'pending' && (
                    <Button variant="outline" size="sm" className="mt-2 h-7 text-[11px] rounded-lg" onClick={() => handleVerify(b)}>
                      <CheckCircle2 size={12} className="mr-1" /> Verify
                    </Button>
                  )}
                </div>
              ))
          )}
        </div>
      </DetailSlideOver>
    </motion.div>
  )
}
