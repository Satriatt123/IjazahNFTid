import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { X, Mail, Lock, Wallet, AlertCircle, Loader2, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useConnect } from 'wagmi';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { loginWithEmail, loginWithWallet } = useAuth();
  const { connectors } = useConnect();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  const [activeTab, setActiveTab] = useState<'student' | 'admin'>('student');

  // const handleEmailLogin = async (e: React.FormEvent) => {
  //   e.preventDefault();
  //   setLoading(true);
  //   setError(null);

  //   const isStudent = activeTab === 'student';
  //   const isStudentDomain = email.toLowerCase().endsWith('@student.upnyk.ac.id');
  //   const isAdminDomain = email.toLowerCase().endsWith('@upnyk.ac.id');

  //   if (isStudent && !isStudentDomain) {
  //     setError('Akses ditolak. Mahasiswa wajib menggunakan email institusi (@student.upnyk.ac.id).');
  //     setLoading(false);
  //     return;
  //   }
    
  //   if (!isStudent && !isAdminDomain) {
  //     setError('Akses ditolak. Staff wajib menggunakan email resmi (@upnyk.ac.id).');
  //     setLoading(false);
  //     return;
  //   }
  //   // --------------------------

  //   try {
  //     await loginWithEmail(email, password);
  //     onClose();
  //   } catch (err: any) {
  //     // ... kode error handling Anda yang sudah ada
  //     if (err.code === 'auth/operation-not-allowed') {
  //       setError('PENTING: Aktifkan "Email/Password" di Firebase Console.');
  //     } else {
  //       setError('ID atau password salah. Pastikan kredensial benar.');
  //     }
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await loginWithEmail(email, password);
      onClose();
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed') {
        setError('PENTING: Aktifkan "Email/Password" di Firebase Console (Authentication -> Sign-in method).');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Koneksi diblokir atau gagal. Matikan AdBlock/VPN dan coba buka link aplikasi di tab baru.');
      } else {
        setError('ID atau password salah. Pastikan kredensial yang Anda masukkan benar.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleWalletLogin = async (connector: any) => {
    setLoading(true);
    setError(null);
    try {
      if (!connector) {
        throw new Error('Wallet tidak terdeteksi. Pastikan ekstensi MetaMask atau OKX sudah terpasang dan aktif.');
      }
      await loginWithWallet(connector);
      onClose();
    } catch (err: any) {
      console.error('Wallet login error:', err);
      setError(err.message || 'Login wallet gagal.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (role: 'admin' | 'student') => {
    setLoading(true);
    setError(null);
    const demoEmail = role === 'admin' ? 'admin.satria@upnyk.ac.id' : 'mahasiswa.dummy@upnyk.ac.id';
    const demoPass = 'password123';
    
    try {
      const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
      const { auth } = await import('../lib/firebase');
      
      try {
        await signInWithEmailAndPassword(auth, demoEmail, demoPass);
        onClose();
      } catch (err: any) {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
          try {
            await createUserWithEmailAndPassword(auth, demoEmail, demoPass);
            onClose();
          } catch (createErr: any) {
            setError(`Gagal membuat akun dummy.`);
          }
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      setError(`Login ${role} gagal: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const useDemo = (role: 'admin' | 'student') => {
    handleDemoLogin(role);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/95 backdrop-blur-sm overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl flex flex-col items-center py-8"
      >

        {/* Tabs */}
        <div className="w-full flex mb-8 rounded-md overflow-hidden shadow-sm border border-gray-100">
          <button 
            onClick={() => setActiveTab('student')}
            className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'student' ? 'bg-[#2196F3] text-white' : 'bg-[#E0E0E0] text-gray-500'}`}
          >
            Mahasiswa
          </button>
          <button 
            onClick={() => setActiveTab('admin')}
            className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'admin' ? 'bg-[#2196F3] text-white' : 'bg-[#E0E0E0] text-gray-500'}`}
          >
            Staff Admin
          </button>
        </div>

        <h2 className="text-xl md:text-2xl font-normal text-gray-800 mb-8 text-center px-4">
          Sistem Aktivitas Dan Prestasi Mahasiswa
        </h2>

        <div className="w-full space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded text-red-600 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="relative">
              <input 
                type="text"
                placeholder={activeTab === 'student' ? "NIM / Username" : "Email / Username Staff"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-4 bg-[#E3F2FD] border-t border-gray-200 rounded text-gray-900 focus:outline-none placeholder-gray-500"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Mail className="w-4 h-4 text-black opacity-80" />
              </div>
            </div>

            <div className="relative">
              <input 
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-4 bg-[#E3F2FD] border-t border-gray-200 rounded text-gray-900 focus:outline-none placeholder-gray-500"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Lock className="w-4 h-4 text-black opacity-80" />
              </div>
            </div>
          </div>

          {/* Fake Recaptcha */}
          <div className="flex justify-center py-2">
            <div className="bg-[#F9F9F9] border border-[#D3D3D3] p-4 flex items-center gap-4 cursor-pointer hover:bg-[#F1F1F1] transition-colors rounded">
              <div className="w-6 h-6 border-2 border-gray-300 bg-white rounded"></div>
              <span className="text-sm text-gray-700">I'm not a robot</span>
              <div className="flex flex-col items-center ml-4">
                 <img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" alt="recaptcha" className="w-6 h-6 opacity-80" />
                 <span className="text-[8px] text-gray-500">reCAPTCHA</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <button 
              onClick={handleEmailLogin}
              disabled={loading}
              className="w-full py-4 bg-[#2196F3] text-white font-bold rounded hover:bg-[#1E88E5] transition-all disabled:opacity-50 uppercase tracking-widest flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'LOGIN'}
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => {
                  const c = connectors.find(x => x.name.toLowerCase().includes('metamask'));
                  handleWalletLogin(c || connectors[0]);
                }}
                disabled={loading}
                className="py-3 bg-white border border-[#F6851B] text-[#F6851B] font-bold rounded-lg hover:bg-orange-50 transition-all flex flex-col items-center justify-center gap-1 uppercase text-[10px]"
              >
                <div className="w-6 h-6 flex items-center justify-center">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" className="w-5 h-5" />
                </div>
                MetaMask
              </button>

              <button 
                onClick={() => {
                  const c = connectors.find(x => x.name.toLowerCase().includes('okx'));
                  handleWalletLogin(c || connectors[0]);
                }}
                disabled={loading}
                className="py-3 bg-white border border-black text-black font-bold rounded-lg hover:bg-gray-50 transition-all flex flex-col items-center justify-center gap-1 uppercase text-[10px]"
              >
                <div className="w-6 h-6 flex items-center justify-center">
                  <img src="https://static.okx.com/cdn/assets/imgs/221/9E4E2C2D0C1A6E1E.png" alt="OKX" className="w-5 h-5" />
                </div>
                OKX Wallet
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-4">
              
              <a href="/forgot-password" className="text-sm text-blue-500 hover:text-blue-800 self-center mt-4 align-items-center flex gap-1 justify-center text-align-center">
                Lupa Password
              </a>
          </div>
        </div>
        
        <p className="mt-12 text-[10px] text-gray-400 text-center uppercase tracking-widest opacity-60">
          Ijazah Digital ID &bull;
        </p>
      </motion.div>
    </div>
  );
}
