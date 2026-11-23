import { useEffect, useState } from 'react';
import { X, Lock, Mail, KeyRound, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { loginSchema, formatZodError } from '../utils/validation';
import { mapSafeErrorMessage } from '../utils/errorShield';

export default function LoginModal({ isOpen, onClose }) {
  const { signInWithPassword, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(formatZodError(parsed));
      return;
    }

    setSubmitting(true);
    try {
      await signInWithPassword(parsed.data.email, parsed.data.password);
      setPassword('');
      onClose();
    } catch (err) {
      setError(mapSafeErrorMessage(err, 'Gagal masuk ke akun. Silakan periksa kembali data Anda.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(mapSafeErrorMessage(err, 'Gagal memulai proses login Google.'));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zen-charcoal/50 backdrop-blur-sm p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-zen-sand w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 bg-zen-linen border-b border-zen-sand/70 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-primary-500 text-white rounded-lg">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zen-charcoal">Masuk Admin Work Logs</h2>
              <p className="text-xs text-zen-charcoal/70">Khusus Role ID 8 (SUPERUSER)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-zen-charcoal/60 hover:bg-zen-sand/30 hover:text-zen-charcoal transition-colors disabled:opacity-50"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 text-xs text-primary-900 leading-relaxed">
            Akses tulis (<strong>Toggle Trained</strong>, <strong>Tambah/Edit Catatan</strong>, dan{' '}
            <strong>Upload/Hapus Rilis</strong>) hanya aktif untuk akun dengan{' '}
            <strong>Role ID 8 (SUPERUSER)</strong>.
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start space-x-2.5 text-sm text-red-700">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={submitting}
            className="w-full flex items-center justify-center space-x-2.5 px-4 py-2.5 border border-zen-sand rounded-lg bg-white hover:bg-zen-linen text-zen-charcoal font-medium transition-colors disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>Masuk dengan Google</span>
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-zen-sand/70"></div>
            <span className="flex-shrink mx-3 text-xs text-zen-charcoal/50 uppercase tracking-wider">
              atau dengan email
            </span>
            <div className="flex-grow border-t border-zen-sand/70"></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zen-charcoal/50" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@zenfamilyspa.id"
                  className="input pl-9"
                  disabled={submitting}
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">Kata Sandi</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zen-charcoal/50" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input pl-9"
                  disabled={submitting}
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="btn-secondary"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary flex items-center space-x-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>Masuk</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
