import { useState } from 'react';
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import {
  Eye,
  Menu,
  X,
  Package,
  LogIn,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
} from 'lucide-react';
import DisplayPage from './pages/Display';
import FilesPage from './pages/Files';
import LoginModal from './components/LoginModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { IS_SUPABASE_CONFIGURED } from './supabase';

function AppShell() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const location = useLocation();
  const { user, profile, roleId, isSuperuser, loading: authLoading, unauthorizedNotice, signOut } =
    useAuth();

  const isActive = (path) => location.pathname === path;

  const displayName =
    profile?.full_name || user?.user_metadata?.full_name || user?.email || 'Pengguna';

  return (
    <div className="min-h-screen bg-zen-linen flex flex-col">
      {/* Header Navigasi */}
      <nav className="bg-white/95 backdrop-blur border-b border-zen-sand/70 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Brand Logo */}
            <div className="flex items-center">
              <Link to="/" className="flex items-center space-x-2.5">
                <img
                  src="/logo.png"
                  alt="Zen Family Spa"
                  className="h-9 w-9 rounded-xl object-cover border border-zen-sand/70 shadow-sm bg-zen-linen"
                />
                <div>
                  <span className="text-lg font-bold text-zen-charcoal block leading-tight">
                    Zen Work Logs
                  </span>
                  <span className="text-[11px] text-zen-charcoal/60 hidden sm:block">
                    Catatan Pembaruan &amp; Release Hub
                  </span>
                </div>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-2">
              <Link
                to="/"
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive('/')
                    ? 'bg-primary-50 text-primary-700 border border-primary-200'
                    : 'text-zen-charcoal/80 hover:bg-zen-linen'
                }`}
              >
                <Eye className="h-4 w-4" />
                <span>Catatan Kerja</span>
              </Link>

              <Link
                to="/files"
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive('/files')
                    ? 'bg-primary-50 text-primary-700 border border-primary-200'
                    : 'text-zen-charcoal/80 hover:bg-zen-linen'
                }`}
              >
                <Package className="h-4 w-4" />
                <span>Release Hub</span>
              </Link>

              <div className="h-6 w-px bg-zen-sand/70 mx-2" />

              {authLoading ? (
                <div className="h-9 w-28 rounded-lg bg-zen-linen animate-pulse border border-zen-sand/50" />
              ) : user ? (
                <div className="flex items-center space-x-2">
                  <div
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs ${
                      isSuperuser
                        ? 'bg-primary-50 border-primary-300 text-primary-800'
                        : 'bg-amber-50 border-amber-300 text-amber-800'
                    }`}
                  >
                    {isSuperuser ? (
                      <ShieldCheck className="h-4 w-4 text-primary-600 shrink-0" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
                    )}
                    <span className="font-semibold max-w-[160px] truncate">{displayName}</span>
                    <span className="px-1.5 py-0.5 rounded bg-white/80 font-mono text-[10px]">
                      {isSuperuser ? 'SUPERUSER' : `Role ${roleId || '-'}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={signOut}
                    className="flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium text-zen-charcoal/80 hover:bg-red-50 hover:text-red-700 border border-zen-sand/70 transition-colors"
                    title="Keluar dari sesi"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Keluar</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setLoginModalOpen(true)}
                  disabled={!IS_SUPABASE_CONFIGURED}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors shadow-sm disabled:opacity-50"
                >
                  <LogIn className="h-4 w-4" />
                  <span>Masuk Admin</span>
                </button>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="flex items-center md:hidden">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-zen-charcoal/80 hover:bg-zen-linen"
                aria-label="Toggle Menu"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-zen-sand/70 bg-white px-4 py-3 space-y-2">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-lg text-sm font-medium ${
                isActive('/')
                  ? 'bg-primary-50 text-primary-700 border border-primary-200'
                  : 'text-zen-charcoal/80 hover:bg-zen-linen'
              }`}
            >
              <Eye className="h-4 w-4" />
              <span>Catatan Kerja</span>
            </Link>

            <Link
              to="/files"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-lg text-sm font-medium ${
                isActive('/files')
                  ? 'bg-primary-50 text-primary-700 border border-primary-200'
                  : 'text-zen-charcoal/80 hover:bg-zen-linen'
              }`}
            >
              <Package className="h-4 w-4" />
              <span>Release Hub</span>
            </Link>

            <div className="pt-2 border-t border-zen-sand/50">
              {authLoading ? (
                <div className="h-9 w-full rounded-lg bg-zen-linen animate-pulse border border-zen-sand/50" />
              ) : user ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-zen-charcoal truncate">
                    <span className="font-semibold">{displayName}</span>{' '}
                    <span className="text-zen-charcoal/60">
                      ({isSuperuser ? 'SUPERUSER' : `Role ${roleId || '-'}`})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      signOut();
                    }}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-50 border border-red-200"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Keluar</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setLoginModalOpen(true);
                  }}
                  disabled={!IS_SUPABASE_CONFIGURED}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary-500 text-white disabled:opacity-50"
                >
                  <LogIn className="h-4 w-4" />
                  <span>Masuk Admin (Role 8)</span>
                </button>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Banner peringatan jika env Supabase belum diset */}
      {!IS_SUPABASE_CONFIGURED && (
        <div className="bg-red-50 border-b border-red-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center space-x-2.5 text-sm text-red-800">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <span>
              Konfigurasi koneksi Supabase belum tersedia (<code>VITE_SUPABASE_URL</code> /{' '}
              <code>VITE_SUPABASE_ANON_KEY</code>). Silakan hubungi tim IT.
            </span>
          </div>
        </div>
      )}

      {/* Banner peringatan jika login bukan Role ID 8 */}
      {user && unauthorizedNotice && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center space-x-2 text-xs sm:text-sm text-amber-900">
            <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
            <span>{unauthorizedNotice}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        <Routes>
          <Route path="/" element={<DisplayPage />} />
          <Route
            path="/files"
            element={<FilesPage onRequestLogin={() => setLoginModalOpen(true)} />}
          />
          <Route path="/upload" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-zen-sand/70 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zen-charcoal/60">
          <span>Zen Family Spa &amp; Reflexology • Zen Work Logs &amp; Release Hub</span>
          <span>Powered by Supabase Production</span>
        </div>
      </footer>

      <LoginModal isOpen={loginModalOpen} onClose={() => setLoginModalOpen(false)} />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;
