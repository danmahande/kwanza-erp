'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Search, User, Users, ShoppingCart, Banknote, Mail, Phone, MapPin, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader, DenseTable, DenseTh, DenseTd, DenseTr } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'

interface Customer {
  id: string
  customerId: string
  name: string
  contact: string
  email: string | null
  address: string | null
  totalOrders: number
  totalOrderValue: number
  createdAt: string
}

export default function CustomersModule() {
  const [data, setData] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [viewing, setViewing] = useState<Customer | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')

  const fetchData = () => {
    fetch(`/api/customers?search=${search}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }

  useEffect(() => { fetchData() }, [search])

  const kpiCells = [
    { label: 'TOTAL', value: data.length },
    { label: 'WITH ORDERS', value: data.filter(c => c.totalOrders > 0).length },
    { label: 'TOTAL ORDERS', value: data.reduce((s, c) => s + (c.totalOrders || 0), 0) },
    { label: 'LIFETIME VALUE', value: formatCurrencyCompact(data.reduce((s, c) => s + (c.totalOrderValue || 0), 0)) },
  ]

  const handleView = (item: Customer) => {
    setViewing(item)
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setViewing(null)
  }

  // CSV import — bulk create customers (for pre-loading before orders exist)
  const handleImport = async () => {
    if (!importText.trim()) { toast.error('Paste CSV data first'); return }
    const lines = importText.trim().split('\n')
    const header = lines[0].toLowerCase().split(',').map(h => h.trim())
    if (!header.includes('name') || !header.includes('contact')) {
      toast.error('CSV must have columns: name, contact (and optionally: email, address)')
      return
    }
    let success = 0, failed = 0
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim())
      if (vals.length < 2) continue
      const row: Record<string, string> = {}
      header.forEach((h, j) => { row[h] = vals[j] || '' })
      try {
        await fetch('/api/customers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: row.name, contact: row.contact, email: row.email || '',
            address: row.address || '', createdBy: 'admin',
          }),
        })
        success++
      } catch { failed++ }
    }
    toast.success(`Imported ${success} customers${failed > 0 ? `, ${failed} failed` : ''}`)
    setImportOpen(false); setImportText(''); fetchData()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-3">
      <OpsHeader
        title="Customers"
        description="Auto-created from Order Processing — no manual entry"
        kpiCells={kpiCells}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or phone..."
      >
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="h-7 text-xs rounded-md">
          <Upload size={12} className="mr-1" /> Import CSV
        </Button>
      </OpsHeader>

      {/* Dense table */}
      {data.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">
          <User size={32} className="mx-auto mb-3 text-gray-300" />
          No customers yet. Customers are created automatically when orders are placed.
        </div>
      ) : (
        <DenseTable>
          <thead>
            <tr>
              <DenseTh className="w-24">Customer ID</DenseTh>
              <DenseTh>Name</DenseTh>
              <DenseTh className="w-28">Phone</DenseTh>
              <DenseTh>Email</DenseTh>
              <DenseTh className="w-16 text-right">Orders</DenseTh>
              <DenseTh className="w-28 text-right">Lifetime Value</DenseTh>
              <DenseTh className="w-24">Joined</DenseTh>
            </tr>
          </thead>
          <tbody>
            {data.map(c => (
              <DenseTr key={c.id} onClick={() => handleView(c)} tint={c.totalOrders === 0 ? 'bg-gray-50/50' : ''}>
                <DenseTd mono className="text-gray-500">{c.customerId}</DenseTd>
                <DenseTd className="text-gray-900 font-medium">{c.name}</DenseTd>
                <DenseTd className="text-gray-600 text-[11px]">{c.contact}</DenseTd>
                <DenseTd className="text-gray-500 text-[11px] truncate max-w-[150px]">{c.email || '—'}</DenseTd>
                <DenseTd mono right className={c.totalOrders > 0 ? 'text-gray-900 font-bold' : 'text-gray-300'}>{c.totalOrders}</DenseTd>
                <DenseTd mono right className={c.totalOrderValue > 0 ? 'text-green-700 font-bold' : 'text-gray-300'}>
                  {c.totalOrderValue > 0 ? formatCurrencyCompact(c.totalOrderValue) : '—'}
                </DenseTd>
                <DenseTd className="text-gray-500 text-[10px]">{new Date(c.createdAt).toLocaleDateString('en-UG')}</DenseTd>
              </DenseTr>
            ))}
          </tbody>
        </DenseTable>
      )}

      {/* View-only detail slide-over — single dense card pattern */}
      <DetailSlideOver
        open={open}
        onClose={handleClose}
        title={viewing?.name || ''}
        subtitle={viewing ? `ID: ${viewing.customerId}` : ''}
        width="lg"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={handleClose} className="rounded-xl">Close</Button>
          </div>
        }
      >
        {viewing && (
          <div className="space-y-3">
            {/* Single dense card — customer details */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Customer Details</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Name</span>
                  <span className="font-medium text-gray-900">{viewing.name}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Customer ID</span>
                  <span className="font-mono text-gray-700">{viewing.customerId}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Phone</span>
                  <span className="font-medium text-gray-900">{viewing.contact}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Email</span>
                  <span className="text-gray-700">{viewing.email || '—'}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Address</span>
                  <span className="text-gray-700">{viewing.address || '—'}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Joined</span>
                  <span className="text-gray-700">{new Date(viewing.createdAt).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Total Orders</span>
                  <span className="font-mono font-bold text-gray-900">{viewing.totalOrders}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-gray-500">Lifetime Value</span>
                  <span className="font-mono font-bold text-green-700">{formatCurrency(viewing.totalOrderValue)}</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
              Customers are created automatically when orders are placed in Order Processing. Use Import CSV to pre-load customer data in bulk.
            </div>
          </div>
        )}
      </DetailSlideOver>

      {/* CSV Import dialog */}
      <AlertDialog open={importOpen} onOpenChange={setImportOpen}>
        <AlertDialogContent className="rounded-2xl max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Upload size={18} /> Import Customers from CSV</AlertDialogTitle>
            <AlertDialogDescription>
              Paste CSV data below. Required columns: name, contact.
              Optional: email, address. Customers are also auto-created from Order Processing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={'name,contact,email,address\nJohn Doe,0700123456,john@gmail.com,Kampala\nJane Smith,0700789012,,Entebbe'}
              rows={8}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-mono"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              First line must be the header row. Each subsequent line is one customer.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleImport} className="bg-[#FF6B35] hover:bg-[#E55A25] rounded-xl">Import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
