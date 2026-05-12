import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ShieldCheck, LogIn, Award, MapPin, Globe, Menu, UserCircle } from 'lucide-react';
import { motion } from 'motion/react';
import AuthModal from '../components/AuthModal';

export default function Landing() {
  const [showLogin, setShowLogin] = useState(false);

  return (
    <div className="min-h-screen bg-[#003366] text-white flex flex-col relative overflow-hidden font-sans">
      <div className="absolute top-0 left-0 w-full h-[60px] bg-[#0c2a47] z-0" />
      
      <div className="flex-1 flex flex-col items-center justify-center relative z-15 px-4 margin-bottom-[60px]">
        <div className="absolute top-1/4 left-10 opacity-20 pointer-events-none">
          <div className="text-6xl font-light text-white">+</div>
        </div>
        <div className="absolute bottom-1/4 right-10 opacity-20 pointer-events-none">
          <div className="text-6xl font-light text-white">+</div>
        </div>
        <div className="absolute top-1/3 right-20 grid grid-cols-4 gap-4 opacity-10 pointer-events-none">
          {[...Array(12)].map((_, i) => <div key={i} className="w-2 h-2 bg-white rounded-full" />)}
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center w-full max-w-6xl flex flex-col items-center"
        >
          <div className="relative w-full max-w-4xl h-[400px] mb-8 flex items-center justify-center">
             <div className="absolute inset-0 flex items-center justify-center margin-top-[50px]">
             </div>
             
             <div className="relative z-10 text-center">
                <h1 className="text-5xl md:text-8xl font-bold tracking-[0.3em] mb-4 drop-shadow-2xl">
                  Ijazah Digital ID
                </h1>
                <div className="w-48 h-[1px] bg-white/40 mx-auto mb-6" />
                <h2 className="text-xl md:text-3xl font-light tracking-wide text-white/90">
                  Solusi Ijazah Digital Terpercaya untuk Masa Depan Pendidikan Indonesia
                </h2>
             </div>
          </div>

          <div className="flex flex-col items-center gap-6 mt-4">
            <button 
              onClick={() => setShowLogin(true)}
              className="px-16 py-4 bg-white text-[#003366] rounded-full font-bold text-xl hover:bg-yellow-400 hover:text-white transition-all transform hover:scale-110 shadow-[0_0_50px_rgba(255,255,255,0.1)] flex items-center gap-3 animate-bounce"
            >
              LOGIN KE IJAZAH DIGITAL ID <LogIn className="w-6 h-6" />
            </button>
            <button 
              onClick={() => window.location.search = '?certId=manual'}
              className="px-10 py-3 bg-[#0c2a47] border border-white/20 text-white rounded-full font-bold text-sm hover:bg-white/10 transition-all flex items-center gap-2"
            >
              <ShieldCheck className="w-5 h-5 text-yellow-400" />
              VERIFIKASI IJAZAH
            </button>
          </div>
        </motion.div>
      </div>

      <AuthModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}
