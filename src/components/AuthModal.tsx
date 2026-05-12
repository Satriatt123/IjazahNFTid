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
  const { loginWithGoogle, logout } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'student' | 'admin'>('student');

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const user = await loginWithGoogle();
      const email = user?.email?.toLowerCase() || '';

      // Validasi Domain
      if (activeTab === 'student') {
        if (!email.endsWith('@student.upnyk.ac.id')) {
          await signOut(auth); 
          throw new Error("Gunakan email Mahasiswa (@student.upnyk.ac.id)");
        }
      } else {
        const isStaff = email.endsWith('@upnyk.ac.id') || email === 'satriaanjasmara04@gmail.com';
        if (!isStaff) {
          await signOut(auth);
          throw new Error("Gunakan email Staff resmi (@upnyk.ac.id)");
        }
      }
      onClose();
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Login dibatalkan.');
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
        className="w-full max-w-md bg-white shadow-2xl rounded-2xl overflow-hidden"
      >
        <div className="flex bg-gray-100 p-1">
          <button 
            onClick={() => setActiveTab('student')}
            className={`flex-1 py-3 text-xs font-bold transition-all ${activeTab === 'student' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
          >
            MAHASISWA
          </button>
          <button 
            onClick={() => setActiveTab('admin')}
            className={`flex-1 py-3 text-xs font-bold transition-all ${activeTab === 'admin' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
          >
            STAFF ADMIN
          </button>
        </div>

        <div className="p-8 flex flex-col items-center">
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-stone-800">Sistem Aktivitas & Prestasi</h2>
            <p className="text-xs text-stone-500 mt-2">Login SSO khusus Civitas Akademika UPNYK</p>
          </div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full p-4 mb-6 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* HANYA TOMBOL GOOGLE, TIDAK ADA INPUT LAGI */}
          <button 
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-4 bg-white border-2 border-stone-200 rounded-xl hover:bg-stone-50 hover:border-blue-400 transition-all group disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            ) : (
              <>
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                <span className="font-bold text-stone-700 group-hover:text-blue-600">
                  Lanjutkan dengan Google
                </span>
              </>
            )}
          </button>

          <div className="mt-12 pt-6 border-t border-stone-100 w-full text-center text-[10px] text-stone-400 uppercase tracking-[0.3em]">
            Ijazah Digital ID &bull; Secure Protocol
          </div>
        </div>
      </motion.div>
    </div>
  );
}