/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import Header from './components/Header';
import Landing from './pages/Landing';
import AdminDashboard from './pages/AdminDashboard';
import StudentDashboard from './pages/StudentDashboard';
import PublicVerify from './pages/PublicVerify';
import { Loader2 } from 'lucide-react';

export default function App() {
  const { user, profile, loading } = useAuth();
  const [view, setView] = useState<'home' | 'verify'>('home');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('certId')) {
      setView('verify');
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  // Safety guard for profile access
  const isAdmin = profile?.role === 'admin';

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <Header setView={setView} />
      <main className="flex-1">
        {view === 'verify' ? (
          <PublicVerify onBack={() => setView('home')} />
        ) : !user ? (
          <Landing />
        ) : (
          <div className="container mx-auto px-4 py-8 max-w-6xl">
            {isAdmin ? (
              <AdminDashboard />
            ) : (
              <StudentDashboard />
            )}
          </div>
        )}
      </main>
      <footer className="py-8 border-t border-stone-200 bg-white">
        <div className="container mx-auto px-4 text-center text-sm text-stone-500">
          © {new Date().getFullYear()} Ijazah Digital ID. Digital Certificate Protocol.
        </div>
      </footer>
    </div>
  );
}
