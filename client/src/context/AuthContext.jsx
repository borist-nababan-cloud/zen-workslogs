import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, IS_SUPABASE_CONFIGURED, SUPERUSER_ROLE_ID } from '../supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unauthorizedNotice, setUnauthorizedNotice] = useState(null);

  const loadUserProfile = useCallback(async (activeSession) => {
    if (!supabase || !activeSession?.user?.id) {
      setProfile(null);
      setUnauthorizedNotice(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('users_profile')
        .select('uid, email, full_name, user_role, role_user')
        .eq('uid', activeSession.user.id)
        .maybeSingle();

      if (error) {
        setProfile(null);
        setUnauthorizedNotice(
          'Gagal memverifikasi peran pengguna. Akses tulis tetap dikunci kecuali terkonfirmasi sebagai SUPERUSER (Role ID 8).'
        );
        return;
      }

      setProfile(data || null);
      const roleId = Number(data?.user_role ?? data?.role_user ?? 0);

      if (roleId !== SUPERUSER_ROLE_ID) {
        setUnauthorizedNotice(
          `Akun Anda (Role ID ${roleId || 'Tidak Terdaftar'}) hanya memiliki akses baca. Fitur Toggle Trained, Kelola Catatan, dan Upload/Hapus Rilis khusus untuk SUPERUSER (Role ID 8).`
        );
      } else {
        setUnauthorizedNotice(null);
      }
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    if (!supabase || !IS_SUPABASE_CONFIGURED) {
      setLoading(false);
      return undefined;
    }

    let isMounted = true;

    const init = async () => {
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        if (!isMounted) return;
        setSession(currentSession);
        await loadUserProfile(currentSession);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setTimeout(() => {
        if (isMounted) {
          loadUserProfile(nextSession);
        }
      }, 0);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadUserProfile]);

  const signInWithPassword = async (email, password) => {
    if (!supabase || !IS_SUPABASE_CONFIGURED) {
      const err = new Error('Konfigurasi koneksi server belum lengkap, silakan hubungi tim IT.');
      err.isUserMessage = true;
      throw err;
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    await loadUserProfile(data.session);
    return data;
  };

  const signInWithGoogle = async () => {
    if (!supabase || !IS_SUPABASE_CONFIGURED) {
      const err = new Error('Konfigurasi koneksi server belum lengkap, silakan hubungi tim IT.');
      err.isUserMessage = true;
      throw err;
    }
    const redirectTo = window.location.origin.replace(/\/$/, '') + window.location.pathname;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } finally {
      setSession(null);
      setProfile(null);
      setUnauthorizedNotice(null);
    }
  };

  const roleId = Number(profile?.user_role ?? profile?.role_user ?? 0);
  const isSuperuser = Boolean(session?.user && roleId === SUPERUSER_ROLE_ID);

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    roleId,
    isSuperuser,
    loading,
    unauthorizedNotice,
    signInWithPassword,
    signInWithGoogle,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider');
  }
  return ctx;
}
