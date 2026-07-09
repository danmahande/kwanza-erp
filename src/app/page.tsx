'use client'

import { useState, useEffect, createContext, useContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard, Store, CreditCard, Users, Package, ArrowUpRight,
  RotateCcw, UserCog, Truck, Settings, LogOut, Menu, X,
  ChevronRight, ClipboardList, ShieldAlert, Navigation,
} from 'lucide-react'
import { toast, Toaster } from 'sonner'

import DashboardModule from '@/components/modules/DashboardModule'
import HubTodayModule from '@/components/modules/HubTodayModule'
import MerchantsModule from '@/components/modules/MerchantsModule'
import PaymentsParentModule from '@/components/modules/PaymentsParentModule'
import CustomersModule from '@/components/modules/CustomersModule'
import ProductsModule from '@/components/modules/ProductsModule'
import InventoryParentModule from '@/components/modules/InventoryParentModule'
import OutboundParentModule from '@/components/modules/OutboundParentModule'
import RunsheetModule from '@/components/modules/RunsheetModule'
import ReturnsParentModule from '@/components/modules/ReturnsParentModule'
import RiskModule from '@/components/modules/RiskModule'
import UsersModule from '@/components/modules/UsersModule'
import DriversModule from '@/components/modules/DriversModule'
import SettingsModule from '@/components/modules/SettingsModule'
import AuditLogModule from '@/components/modules/AuditLogModule'

type ModuleKey = 'hub_today' | 'dashboard' | 'merchants' | 'payments' | 'customers' | 'products' | 'inventory' | 'outbound' | 'runsheets' | 'returns' | 'risk' | 'drivers' | 'users' | 'settings' | 'audit_log'

interface NavItem {
  key: ModuleKey
  label: string
  icon: React.ElementType
  section?: string
}

interface UserSession {
  id: string
  email: string
  name: string
  role: string
}

interface AuthContextType {
  user: UserSession | null
  loading: boolean
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
}

const navItems: NavItem[] = [
  { key: 'hub_today', label: 'Operations Desk', icon: LayoutDashboard, section: 'Dashboard' },
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Dashboard' },
  { key: 'merchants', label: 'Merchants', icon: Store, section: 'Receiving' },
  { key: 'products', label: 'Products', icon: Package, section: 'Receiving' },
  { key: 'inventory', label: 'Inventory', icon: Package, section: 'Warehouse' },
  { key: 'outbound', label: 'Outbound', icon: ArrowUpRight, section: 'Warehouse' },
  { key: 'runsheets', label: 'Runsheets', icon: Navigation, section: 'Warehouse' },
  { key: 'returns', label: 'Returns', icon: RotateCcw, section: 'Warehouse' },
  { key: 'risk', label: 'Risk & Fraud', icon: ShieldAlert, section: 'Warehouse' },
  { key: 'drivers', label: 'Drivers', icon: Truck, section: 'Delivery' },
  { key: 'customers', label: 'Customers', icon: Users, section: 'Delivery' },
  { key: 'payments', label: 'Payments', icon: CreditCard, section: 'Finance' },
  { key: 'users', label: 'Users', icon: UserCog, section: 'System' },
  { key: 'settings', label: 'Settings', icon: Settings, section: 'System' },
  { key: 'audit_log', label: 'Audit Log', icon: ClipboardList, section: 'System' },
]

const moduleComponents: Record<ModuleKey, React.ComponentType<{ onNavigate?: (module: string) => void }>> = {
  hub_today: HubTodayModule,
  dashboard: DashboardModule,
  merchants: MerchantsModule,
  payments: PaymentsParentModule,
  customers: CustomersModule,
  products: ProductsModule,
  inventory: InventoryParentModule,
  outbound: OutboundParentModule,
  runsheets: RunsheetModule,
  returns: ReturnsParentModule,
  risk: RiskModule,
  drivers: DriversModule,
  users: UsersModule,
  settings: SettingsModule,
  audit_log: AuditLogModule,
}

// Auth context - simple cookie-based auth (no NextAuth)
const AuthContext = createContext<AuthContextType | null>(null)

function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be within AuthContext')
  return ctx
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user has a valid session on page load
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUser(data.user)
        }
      })
      .catch(() => {
        // Session check failed - user is not logged in
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (res.ok && data.user) {
        setUser(data.user)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// Login Page
function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const success = await login(email, password)
    setLoading(false)
    if (!success) {
      toast.error('Invalid email or password')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1B2A4A] via-[#243656] to-[#1B2A4A] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#FF6B35] mb-4 shadow-lg">
            <Package size={40} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Kwanza Logistics</h1>
          <p className="text-blue-200 mt-2">Enterprise Resource Planning System</p>
        </div>

        <Card className="shadow-2xl border-0">
          <CardContent className="p-8">
            <h2 className="text-xl font-bold text-[#1B2A4A] mb-1">Welcome back</h2>
            <p className="text-muted-foreground text-sm mb-6">Sign in to your account</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@kwanza.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="mt-1.5"
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="mt-1.5"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#FF6B35] hover:bg-[#E55A25] text-white h-11 text-base font-medium"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-gray-50 rounded-xl">
              <p className="text-xs text-muted-foreground font-medium mb-2">Demo Credentials:</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p><span className="font-semibold text-[#1B2A4A]">Admin:</span> admin@kwanza.com / admin123</p>
                <p><span className="font-semibold text-[#1B2A4A]">Warehouse:</span> warehouse@kwanza.com / warehouse123</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-blue-200/60 text-xs mt-6">&copy; 2025 Kwanza Logistics Ltd. All rights reserved.</p>
      </motion.div>
    </div>
  )
}

// Main App Content
function AppContent() {
  const { user, loading, logout } = useAuth()
  const [activeModule, setActiveModule] = useState<ModuleKey>('hub_today')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Inject sidebar scrollbar-hiding style into <head> — can't be cached separately
  useEffect(() => {
    const id = 'sidebar-scroll-style'
    if (document.getElementById(id)) return
    const el = document.createElement('style')
    el.id = id
    el.textContent = '.sidebar-nav::-webkit-scrollbar{display:none!important}.sidebar-nav{scrollbar-width:none!important;-ms-overflow-style:none!important}'
    document.head.appendChild(el)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  const userName = user.name || 'User'
  const userEmail = user.email || ''
  const userRole = user.role || 'viewer'
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const ActiveModuleComponent = moduleComponents[activeModule]

  const handleNavClick = (key: ModuleKey) => {
    setActiveModule(key)
    setSidebarOpen(false)
  }

  // Group nav items by section
  const sections: Record<string, NavItem[]> = {}
  navItems.forEach(item => {
    const section = item.section || 'Other'
    if (!sections[section]) sections[section] = []
    sections[section].push(item)
  })

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#FF6B35] flex items-center justify-center shrink-0">
          <Package size={22} className="text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-white truncate">KWANZA LOGISTICS</h1>
          <p className="text-[10px] text-blue-200/60 uppercase tracking-widest">ERP System</p>
        </div>
      </div>

      <Separator className="bg-white/10 mx-4" />

      {/* Navigation — scrollbar pushed off-screen, still scrollable */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 mr-[-20px] pr-[23px]">
        {Object.entries(sections).map(([section, items]) => (
          <div key={section} className="mb-4">
            <p className="px-3 mb-2 text-[10px] uppercase tracking-widest text-blue-200/40 font-semibold">{section}</p>
            {items.map((item) => {
              const isActive = activeModule === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => handleNavClick(item.key)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 mb-0.5
                    ${isActive
                      ? 'bg-[#FF6B35] text-white shadow-lg shadow-[#FF6B35]/25'
                      : 'text-blue-200/70 hover:bg-white/8 hover:text-white'
                    }
                  `}
                >
                  <item.icon size={18} />
                  <span className="font-medium truncate">{item.label}</span>
                  {isActive && <ChevronRight size={14} className="ml-auto" />}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User info at bottom */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-2">
          <Avatar className="h-9 w-9 bg-[#FF6B35]">
            <AvatarFallback className="text-white text-xs font-bold">{userInitials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{userName}</p>
            <p className="text-[10px] text-blue-200/50 truncate">{userRole.replace('_', ' ')}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          onClick={logout}
          className="w-full mt-3 justify-start text-blue-200/60 hover:text-white hover:bg-white/8"
        >
          <LogOut size={16} className="mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  )

  return (
    <div className="h-screen flex overflow-hidden bg-[#F8FAFC]">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Desktop */}
      <motion.aside
        initial={false}
        className="hidden lg:flex w-64 shrink-0 flex-col bg-gradient-to-b from-[#1B2A4A] to-[#0F1A2E] overflow-hidden"
      >
        {sidebarContent}
      </motion.aside>

      {/* Sidebar - Mobile */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 w-72 z-50 flex flex-col bg-gradient-to-b from-[#1B2A4A] to-[#0F1A2E] shadow-2xl overflow-hidden"
          >
            <button onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" className="absolute top-4 right-4 text-white/60 hover:text-white">
              <X size={20} />
            </button>
            {sidebarContent}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} className="text-[#1B2A4A]" />
            </Button>
            <h2 className="text-lg font-semibold text-[#1B2A4A]">
              {navItems.find(n => n.key === activeModule)?.label || 'Dashboard'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="hidden sm:flex text-xs bg-[#1B2A4A]/5 text-[#1B2A4A]">
              {userRole.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </Badge>
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8 bg-[#1B2A4A]">
                <AvatarFallback className="text-white text-xs font-bold">{userInitials}</AvatarFallback>
              </Avatar>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-[#1B2A4A] leading-tight">{userName}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{userEmail}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-4 lg:p-6">
            {/* Forward-moving flow breadcrumb — shows the physical goods pipeline */}
            {['merchants', 'inventory', 'outbound', 'returns'].includes(activeModule) && (
              <div className="mb-4 flex items-center gap-1 p-1 bg-gray-50 rounded-lg border border-gray-100 overflow-x-auto">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold px-2 shrink-0">Goods Flow:</span>
                {[
                  { key: 'merchants', label: 'Receive', desc: 'Merchant delivers stock' },
                  { key: 'inventory', label: 'Store', desc: 'Put away on shelves' },
                  { key: 'outbound', label: 'Dispatch', desc: 'Pick, pack & send out' },
                  { key: 'returns', label: 'Returns', desc: 'RMA, RTV & shrinkage' },
                ].map((step, i, arr) => {
                  const isActive = activeModule === step.key
                  const stepIndex = arr.findIndex(s => s.key === activeModule)
                  const isPast = stepIndex > i
                  const isNext = stepIndex >= 0 && i === stepIndex + 1
                  return (
                    <div key={step.key} className="flex items-center shrink-0">
                      <button
                        onClick={() => handleNavClick(step.key as ModuleKey)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-[#FF6B35] text-white shadow-sm'
                            : isPast
                            ? 'bg-green-50 text-green-700 hover:bg-green-100'
                            : isNext
                            ? 'bg-orange-50 text-orange-700 hover:bg-orange-100 ring-1 ring-orange-200'
                            : 'text-gray-500 hover:bg-gray-100'
                        }`}
                        title={step.desc}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          isActive ? 'bg-white' : isPast ? 'bg-green-500' : isNext ? 'bg-orange-500' : 'bg-gray-300'
                        }`} />
                        {step.label}
                        {isNext && <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">Next →</span>}
                      </button>
                      {i < arr.length - 1 && (
                        <ChevronRight size={12} className={`mx-0.5 ${isPast ? 'text-green-400' : 'text-gray-300'}`} />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeModule}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                <ActiveModuleComponent onNavigate={(m: string) => handleNavClick(m as ModuleKey)} />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <Toaster position="top-right" richColors />
    </div>
  )
}

export default function Home() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
