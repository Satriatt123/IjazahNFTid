import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'student' | 'admin'>('student');

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const user = await loginWithGoogle();
      const email = user?.email?.toLowerCase() || '';

      // Validasi Domain Institusi UPNYK
      if (activeTab === 'student') {
        if (!email.endsWith('@student.upnyk.ac.id')) {
          await signOut(auth); // Paksa logout jika salah akun
          throw new Error("Akses Ditolak! Mahasiswa wajib menggunakan email @student.upnyk.ac.id");
        }
      } else {
        const isStaff = email.endsWith('@upnyk.ac.id') || email === 'satriaanjasmara04@gmail.com';
        if (!isStaff) {
          await signOut(auth);
          throw new Error("Akses Ditolak! Staff wajib menggunakan email resmi @upnyk.ac.id");
        }
      }
      onClose();
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Proses login dibatalkan.');
      } else {
        setError(err.message || 'Login gagal.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white shadow-2xl rounded-[2rem] overflow-hidden border border-white/20"
      >
        {/* Tab Selector */}
        <div className="flex bg-stone-100 p-1.5 m-4 rounded-2xl">
          <button 
            onClick={() => setActiveTab('student')}
            className={`flex-1 py-3 text-[10px] font-black tracking-widest uppercase rounded-xl transition-all ${activeTab === 'student' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400'}`}
          >
            MAHASISWA
          </button>
          <button 
            onClick={() => setActiveTab('admin')}
            className={`flex-1 py-3 text-[10px] font-black tracking-widest uppercase rounded-xl transition-all ${activeTab === 'admin' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400'}`}
          >
            STAFF ADMIN
          </button>
        </div>

        <div className="p-10 flex flex-col items-center">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-serif italic text-stone-900">Single Sign-On</h2>
            <p className="text-xs text-stone-500 mt-2">Login khusus Civitas Akademika UPN "Veteran" Yogyakarta</p>
          </div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full p-4 mb-6 bg-red-50 border-l-4 border-red-500 text-red-700 text-[11px] flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-4 py-5 bg-white border-2 border-stone-100 rounded-2xl hover:border-[#2196F3] hover:bg-blue-50/30 transition-all group disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin text-[#2196F3]" />
            ) : (
              <>
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
                <span className="font-bold text-stone-700 group-hover:text-[#2196F3]">
                  Lanjutkan dengan Google
                </span>
              </>
            )}
          </button>

          <div className="mt-12 pt-8 border-t border-stone-100 w-full text-center">
            <p className="text-[9px] font-black text-stone-300 uppercase tracking-[0.4em]">
              Ijazah Digital ID &bull;Protocol
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}