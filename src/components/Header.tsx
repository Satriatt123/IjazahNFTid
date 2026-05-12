import { useAuth } from '../hooks/useAuth';
import { LogOut, User as UserIcon, Globe, Menu, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import AuthModal from './AuthModal';

interface HeaderProps {
  setView: (view: 'home' | 'verify') => void;
}

export default function Header({ setView }: HeaderProps) {
  const { profile, logout, user } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  return (
    <header className="bg-[#0c2a47] text-white py-3 border-b border-white/10">
      <div className="container mx-auto px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 cursor-pointer">
            <span className="font-bold text-lg tracking-wider">Ijazah Digital ID</span>
          </div>
        </div>

        <nav className="flex items-center gap-4 md:gap-8">

          {!user ? (
            <div className="flex items-center gap-3 text-xs md:text-sm font-light text-white/90">
              <Globe className="w-4 h-4" />
              <span>ANDA BELUM MASUK. (</span>
              <button 
                onClick={() => setShowLogin(true)}
                className="text-sky-400 hover:underline font-normal"
              >
                MASUK
              </button>
              <span>)</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 md:gap-6 pl-4 border-l border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                  <UserIcon className="w-4 h-4" />
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs font-bold leading-none">{profile?.name || 'User'}</p>
                  <p className="text-[10px] text-white/50 uppercase tracking-widest mt-0.5">{profile?.role}</p>
                </div>
              </div>
              <button 
                onClick={logout}
                className="p-2 text-white/40 hover:text-red-400 transition-colors"
                title="Keluar"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </nav>
      </div>
      <AuthModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </header>
  );
}
