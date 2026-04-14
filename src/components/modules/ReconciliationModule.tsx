'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Scale, Banknote, ClipboardCheck, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface ReconRecord {
  id: string
  type: string
  referenceId: string | null
  expectedQty: number
  actualQty: number
  variance: number
  varianceReason: string | null
  reconciledBy: string
  date: string
  createdAt: string
}

const statCards = [
  { key: 'physical', label: 'Physical Records', color: 'orange' as const },
  { key: 'cash', label: 'Cash Records', color: 'navy' as const },
  { key: 'variance', label: 'With Variance', color: 'red' as const },
] as const

const colorMap = {
  orange: {
    gradient: 'from-orange-500/10 to-orange-50',
    border: 'border-orange-200/60',
    iconBg: 'bg-orange-500/15',
    iconColor: 'text-orange-600',
  },
  navy: {
    gradient: 'from-slate-600/10 to-slate-50',
    border: 'border-slate-300/60',
    iconBg: 'bg-slate-600/15',
    iconColor: 'text-slate-700',
  },
  red: {
    gradient: 'from-red-500/10 to-red-50',
    border: 'border-red-200/60',
    iconBg: 'bg-red-500/15',
    iconColor: 'text-red-600',
  },
} as const

const statIcons: Record<string, React.ReactNode> = {
  physical: <Scale size={20} />,
  cash: <Banknote size={20} />,
  variance: <AlertCircle size={20} />,
}

function ReconTable({ records }: { records: ReconRecord[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-[#1B2A4A] hover:bg-[#1B2A4A]">
            <TableHead className="text-white font-semibold">Reference</TableHead>
            <TableHead className="text-white font-semibold">Expected</TableHead>
            <TableHead className="text-white font-semibold">Actual</TableHead>
            <TableHead className="text-white font-semibold">Variance</TableHead>
            <TableHead className="text-white font-semibold">Reason</TableHead>
            <TableHead className="text-white font-semibold">Reconciled By</TableHead>
            <TableHead className="text-white font-semibold">Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((item, i) => (
            <TableRow key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
              <TableCell className="font-mono text-sm">{item.referenceId || '-'}</TableCell>
              <TableCell>{item.expectedQty.toLocaleString()}</TableCell>
              <TableCell>{item.actualQty.toLocaleString()}</TableCell>
              <TableCell>
                <Badge variant={item.variance === 0 ? 'default' : 'destructive'} className={item.variance === 0 ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}>
                  {item.variance === 0 ? 'Match' : item.variance > 0 ? `+${item.variance}` : String(item.variance)}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{item.varianceReason || '-'}</TableCell>
              <TableCell className="text-sm">{item.reconciledBy}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{new Date(item.date).toLocaleDateString()}</TableCell>
            </TableRow>
          ))}
          {records.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-sm text-gray-400 text-center py-12">
                <ClipboardCheck size={32} className="mx-auto mb-2 opacity-40" />
                No records found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export default function ReconciliationModule() {
  const [data, setData] = useState<ReconRecord[]>([])
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('physical')
  const [form, setForm] = useState({
    type: 'physical', referenceId: '', expectedQty: '', actualQty: '', varianceReason: '', reconciledBy: '',
  })

  const fetchData = () => {
    fetch('/api/reconciliation').then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSubmit = async () => {
    if (!form.expectedQty || !form.actualQty || !form.reconciledBy) {
      toast.error('Please fill all required fields')
      return
    }
    await fetch('/api/reconciliation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, type: tab }),
    })
    toast.success('Reconciliation recorded')
    setOpen(false)
    setForm({ type: 'physical', referenceId: '', expectedQty: '', actualQty: '', varianceReason: '', reconciledBy: '' })
    fetchData()
  }

  const physicalRecords = data.filter(r => r.type === 'physical')
  const cashRecords = data.filter(r => r.type === 'cash')

  const statValues: Record<string, number> = {
    physical: physicalRecords.length,
    cash: cashRecords.length,
    variance: data.filter(r => r.variance !== 0).length,
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Reconciliation</h1>
          <p className="text-sm text-gray-400">Reconcile physical goods and cash balances</p>
        </div>
        <Button onClick={() => { setForm({ type: tab, referenceId: '', expectedQty: '', actualQty: '', varianceReason: '', reconciledBy: '' }); setOpen(true) }} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
          <Plus size={18} className="mr-2" /> New Reconciliation
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((stat, i) => {
          const colors = colorMap[stat.color]
          return (
            <motion.div
              key={stat.key}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.07 }}
              className={`bg-gradient-to-br ${colors.gradient} border ${colors.border} rounded-2xl p-5`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{statValues[stat.key]}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${colors.iconBg} flex items-center justify-center ${colors.iconColor}`}>
                  {statIcons[stat.key]}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      <div className="bg-white/80 backdrop-blur-sm border border-gray-100 hover:shadow-md transition-shadow rounded-2xl">
        <div className="p-5 pb-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="physical" className="flex items-center gap-2"><Scale size={16} /> Physical Goods</TabsTrigger>
              <TabsTrigger value="cash" className="flex items-center gap-2"><Banknote size={16} /> Cash</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="p-5 pt-4">
          {tab === 'physical' ? <ReconTable records={physicalRecords} /> : <ReconTable records={cashRecords} />}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Reconciliation ({tab === 'physical' ? 'Physical Goods' : 'Cash'})</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Reference ID</Label><Input value={form.referenceId} onChange={e => setForm({ ...form, referenceId: e.target.value })} placeholder="Product or payment reference" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Expected *</Label><Input type="number" value={form.expectedQty} onChange={e => setForm({ ...form, expectedQty: e.target.value })} placeholder="Expected amount" /></div>
              <div><Label>Actual *</Label><Input type="number" value={form.actualQty} onChange={e => setForm({ ...form, actualQty: e.target.value })} placeholder="Actual amount" /></div>
            </div>
            {form.expectedQty && form.actualQty && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`p-4 rounded-xl border ${
                  parseFloat(form.expectedQty) - parseFloat(form.actualQty) === 0
                    ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200/60'
                    : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ClipboardCheck size={18} className={
                    parseFloat(form.expectedQty) - parseFloat(form.actualQty) === 0
                      ? 'text-green-600'
                      : 'text-red-500'
                  } />
                  <span className="text-sm font-medium text-gray-600">Variance Preview</span>
                </div>
                <p className={`text-lg font-bold mt-1 ${
                  parseFloat(form.expectedQty) - parseFloat(form.actualQty) === 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {parseFloat(form.expectedQty) - parseFloat(form.actualQty) === 0
                    ? 'No variance'
                    : `${parseFloat(form.expectedQty) - parseFloat(form.actualQty) > 0 ? '+' : ''}${parseFloat(form.expectedQty) - parseFloat(form.actualQty)}`
                  }
                </p>
              </motion.div>
            )}
            <div><Label>Variance Reason</Label><textarea className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.varianceReason} onChange={e => setForm({ ...form, varianceReason: e.target.value })} placeholder="Explain the variance" /></div>
            <div><Label>Reconciled By *</Label><Input value={form.reconciledBy} onChange={e => setForm({ ...form, reconciledBy: e.target.value })} placeholder="Your name" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
