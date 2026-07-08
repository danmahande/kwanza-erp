'use client'

import { useState, useEffect } from 'react'
import { Package, TrendingUp, Wallet, FileText, Truck, AlertTriangle } from 'lucide-react'

/**
 * B: Merchant Self-Service Portal
 *
 * A simple read-only page where merchants can check:
 * - Their stock levels (what's in our warehouse)
 * - Their recent orders (delivery status)
 * - Their latest statement
 * - Their payment status (pending, paid)
 *
 * Access: /portal/merchant?merchantId=MCH-001
 * No login required for v1 (query param access). Add auth later.
 */

export default function MerchantPortal() {
  const [merchantId, setMerchantId] = useState('')
  const [entered, setEntered] = useState(false)
  const [merchant, setMerchant] = useState<Record<string, unknown> | null>(null)
  const [products, setProducts] = useState<Array<Record<string, unknown>>>([])
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([])
  const [statements, setStatements] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(false)

  const loadData = async (mid: string) => {
    setLoading(true)
    try {
      const [mRes, pRes, oRes, sRes] = await Promise.all([
        fetch(`/api/merchants?search=${mid}`),
        fetch(`/api/products?search=${mid}`),
        fetch(`/api/order-processing?search=${mid}`),
        fetch(`/api/merchant-statements?merchantId=${mid}`),
      ])
      const mData = await mRes.json()
      setMerchant(Array.isArray(mData) && mData.length > 0 ? mData[0] : null)
      setProducts(Array.isArray(await pRes.json()) ? await pRes.clone().json() : [])
      const oData = await oRes.json()
      setOrders(Array.isArray(oData) ? oData.filter((o: Record<string, unknown>) => o.merchantId === mid || o.vendorId === mid).slice(0, 20) : [])
      const sData = await sRes.json()
      setStatements(Array.isArray(sData) ? sData.slice(0, 5) : [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const mid = params.get('merchantId')
    if (mid) {
      setMerchantId(mid)
      setEntered(true)
      loadData(mid)
    }
  }, [])

  const handleEnter = () => {
    if (!merchantId.trim()) return
    setEntered(true)
    loadData(merchantId.trim())
  }

  if (!entered) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-[#FF6B35]/10 flex items-center justify-center mx-auto mb-3">
              <Package size={32} className="text-[#FF6B35]" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Merchant Portal</h1>
            <p className="text-sm text-gray-400 mt-1">Check your stock, orders, and payments</p>
          </div>
          <input
            type="text"
            value={merchantId}
            onChange={e => setMerchantId(e.target.value)}
            placeholder="Enter your Merchant ID (e.g. MCH-001)"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm mb-3"
            onKeyDown={e => e.key === 'Enter' && handleEnter()}
          />
          <button
            onClick={handleEnter}
            className="w-full bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl py-3 text-sm font-medium"
          >
            View My Account
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">Loading...</p></div>
  }

  if (!merchant) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertTriangle size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Merchant not found</p>
          <p className="text-sm text-gray-400 mt-1">Check your Merchant ID and try again</p>
          <button onClick={() => setEntered(false)} className="mt-4 text-[#FF6B35] text-sm font-medium">← Back</button>
        </div>
      </div>
    )
  }

  const fmt = (n: number) => `UGX ${(n || 0).toLocaleString()}`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1B2A4A] text-white p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-bold">{String(merchant.businessName || '')}</h1>
          <p className="text-xs text-blue-200/60 mt-0.5">{String(merchant.merchantId || '')} · Merchant Portal</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Financial Summary */}
        <div className="bg-[#1B2A4A] text-white rounded-lg overflow-hidden flex">
          <div className="flex-1 px-4 py-3 border-r border-white/10">
            <span className="text-[9px] text-blue-200/60 uppercase">Total Sales</span>
            <p className="font-mono font-bold text-sm">{fmt(Number(merchant.totalSalesValue))}</p>
          </div>
          <div className="flex-1 px-4 py-3 border-r border-white/10">
            <span className="text-[9px] text-blue-200/60 uppercase">Pending Payment</span>
            <p className="font-mono font-bold text-sm text-orange-300">{fmt(Number(merchant.pendingPayment))}</p>
          </div>
          <div className="flex-1 px-4 py-3 border-r border-white/10">
            <span className="text-[9px] text-blue-200/60 uppercase">Paid</span>
            <p className="font-mono font-bold text-sm text-green-300">{fmt(Number(merchant.actualPayment))}</p>
          </div>
          <div className="flex-1 px-4 py-3">
            <span className="text-[9px] text-blue-200/60 uppercase">Storage Due</span>
            <p className="font-mono font-bold text-sm text-blue-300">{fmt(Number(merchant.storageLiabilityBalance))}</p>
          </div>
        </div>

        {/* Stock Levels */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Package size={14} /> My Stock in Warehouse
          </h2>
          {products.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No products in warehouse</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 text-[9px] uppercase border-b border-gray-100">
                  <th className="text-left py-2">Product</th>
                  <th className="text-right py-2">Stock</th>
                  <th className="text-right py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 text-gray-900">{String(p.productLabel || '')}</td>
                    <td className="py-2 text-right font-mono font-bold text-gray-900">{String(p.currentStock || 0)}</td>
                    <td className="py-2 text-right font-mono text-gray-600">{fmt(Number(p.currentStock) * Number(p.unitCost || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Truck size={14} /> Recent Orders
          </h2>
          {orders.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No orders yet</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 text-[9px] uppercase border-b border-gray-100">
                  <th className="text-left py-2">Order #</th>
                  <th className="text-left py-2">Customer</th>
                  <th className="text-right py-2">Amount</th>
                  <th className="text-center py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 10).map((o, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 font-mono text-gray-500">{String(o.orderNumber || '')}</td>
                    <td className="py-2 text-gray-900">{String(o.customerName || '')}</td>
                    <td className="py-2 text-right font-mono text-gray-700">{fmt(Number(o.totalAmount || 0))}</td>
                    <td className="py-2 text-center">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-600">
                        {String(o.status || '').replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Latest Statement */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3 flex items-center gap-2">
            <FileText size={14} /> Latest Statement
          </h2>
          {statements.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No statements generated yet</p>
          ) : (
            <div className="space-y-2">
              {statements.slice(0, 3).map((s, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-xs">
                  <div>
                    <p className="font-mono text-gray-500">{String(s.period || '')}</p>
                    <p className="text-gray-400 text-[10px]">{String(s.statementId || '')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-gray-900">{fmt(Number(s.netPayable || 0))}</p>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${s.isPaid ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {s.isPaid ? 'PAID' : 'PENDING'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-[10px] text-gray-400 pt-4">
          Kwanza Logistics · Merchant Portal · For questions call your account manager
        </p>
      </div>
    </div>
  )
}
