import { useState } from 'react';
import { ShieldCheck, LogIn } from 'lucide-react';
import { motion } from 'framer-motion'; // Pastikan library ini sesuai dengan yang terinstall
import AuthModal from '../components/AuthModal';

export default function Landing() {
  const [showLogin, setShowLogin] = useState(false);

  return (
    <div className="min-h-screen bg-[#003366] text-white flex flex-col relative overflow-hidden font-sans">
      {/* Top Bar Decoration */}
      <div className="absolute top-0 left-0 w-full h-[60px] bg-[#0c2a47] z-0" />
      
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-4 mb-[60px]">
        {/* Decorative Elements */}
        <div className="absolute top-1/4 left-10 opacity-20 pointer-events-none select-none">
          <div className="text-6xl font-light">+</div>
        </div>
        <div className="absolute bottom-1/4 right-10 opacity-20 pointer-events-none select-none">
          <div className="text-6xl font-light">+</div>
        </div>
        
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center w-full max-w-6xl flex flex-col items-center"
        >
          <div className="relative w-full max-w-4xl min-h-[300px] mb-8 flex items-center justify-center">
             <div className="relative z-10 text-center">
                <h1 className="text-4xl md:text-7xl lg:text-8xl font-bold tracking-[0.2em] md:tracking-[0.3em] mb-4 drop-shadow-2xl">
                  Ijazah Digital ID
                </h1>
                <div className="w-32 md:w-48 h-[1px] bg-white/40 mx-auto mb-6" />
                <h2 className="text-lg md:text-2xl font-light tracking-wide text-white/90 max-w-2xl mx-auto leading-relaxed">
                  Solusi Ijazah Digital Terpercaya untuk Masa Depan Pendidikan Indonesia
                </h2>
             </div>
          </div>

          <div className="flex flex-col items-center gap-6 mt-4">
            <button 
              onClick={() => setShowLogin(true)}
              className="group px-10 py-4 bg-white text-[#003366] rounded-full font-bold text-lg md:text-xl hover:bg-yellow-400 hover:text-[#003366] transition-all transform hover:scale-105 shadow-xl flex items-center gap-3 animate-bounce hover:animate-none"
            >
              LOGIN KE DASHBOARD <LogIn className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </button>
            
            <button 
              onClick={() => window.location.search = '?certId=manual'}
              className="px-8 py-3 bg-[#0c2a47] border border-white/20 text-white rounded-full font-bold text-sm hover:bg-white/10 transition-all flex items-center gap-2"
            >
              <ShieldCheck className="w-5 h-5 text-yellow-400" />
              VERIFIKASI IJAZAH PUBLIK
            </button>
          </div>
        </motion.div>
      </div>

      {/* Footer Info */}
      <div className="absolute bottom-6 w-full text-center z-10">
        <p className="text-[10px] text-white/40 uppercase tracking-[0.3em]">
          Powered by Sadewa Protocol &bull; UPN "Veteran" Yogyakarta
        </p>
      </div>

      <AuthModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}