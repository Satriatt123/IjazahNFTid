import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { auth } from '../lib/firebase'; // Pastikan path ini benar
import { signOut } from 'firebase/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { loginWithGoogle } = useAuth(); // Pastikan fungsi ini ada di useAuth
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'student' | 'admin'>('student');

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Jalankan Login Google
      const user = await loginWithGoogle();
      
      if (!user || !user.email) {
        throw new Error("Gagal mendapatkan informasi email dari Google.");
      }

      const email = user.email.toLowerCase();
      const isStudent = activeTab === 'student';

      // 2. Validasi Domain Keamanan UPNYK
      if (isStudent) {
        if (!email.endsWith('@student.upnyk.ac.id')) {
          await signOut(auth); // Paksa logout jika domain salah
          throw new Error("Akses Ditolak! Mahasiswa wajib menggunakan email @student.upnyk.ac.id");
        }
      } else {
        if (!email.endsWith('@upnyk.ac.id')) {
          await signOut(auth); // Paksa logout jika domain salah
          throw new Error("Akses Ditolak! Staff wajib menggunakan email resmi @upnyk.ac.id");
        }
      }

      // Jika lolos validasi
      onClose();
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Terjadi kesalahan saat login.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/95 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md flex flex-col items-center py-8 bg-white shadow-2xl rounded-xl border border-stone-100 p-8"
      >
        {/* Tabs */}
        <div className="w-full flex mb-8 rounded-lg overflow-hidden border border-gray-200">
          <button 
            onClick={() => setActiveTab('student')}
            className={`flex-1 py-3 text-sm font-bold transition-all ${activeTab === 'student' ? 'bg-[#2196F3] text-white' : 'bg-gray-100 text-gray-500'}`}
          >
            Mahasiswa
          </button>
          <button 
            onClick={() => setActiveTab('admin')}
            className={`flex-1 py-3 text-sm font-bold transition-all ${activeTab === 'admin' ? 'bg-[#2196F3] text-white' : 'bg-gray-100 text-gray-500'}`}
          >
            Staff Admin
          </button>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-800">Single Sign-On</h2>
          <p className="text-sm text-gray-500 mt-2">Login khusus civitas akademika UPN "Veteran" Yogyakarta</p>
        </div>

        {error && (
          <div className="w-full p-4 mb-6 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button 
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-4 bg-white border-2 border-gray-200 rounded-xl hover:bg-gray-50 hover:border-blue-400 transition-all group disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          ) : (
            <>
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
              <span className="font-semibold text-gray-700 group-hover:text-blue-600">
                Lanjutkan dengan Google
              </span>
            </>
          )}
        </button>

        <div className="mt-8 pt-6 border-t border-gray-100 w-full text-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest">
            Ijazah Digital ID &bull; Secure Protocol
          </p>
        </div>
      </motion.div>
    </div>
  );
}