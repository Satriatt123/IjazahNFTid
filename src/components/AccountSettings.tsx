import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { User, Mail, CheckCircle2, Loader2, AlertCircle, Wallet } from 'lucide-react';
import { ethers } from 'ethers';

export default function AccountSettings() {
  const { user, profile, updateAccount } = useAuth();
  const [name, setName] = useState(profile?.name || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [wallet, setWallet] = useState(profile?.walletAddress || '');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isWalletUser = user?.email?.startsWith('wallet_');

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      if (wallet && !ethers.isAddress(wallet)) {
        throw new Error('Format alamat wallet tidak valid.');
      }

      // PERBAIKAN: Tambahkan 'undefined' di parameter kedua (password) 
      // agar 'name' dan 'wallet' masuk ke urutan yang benar sesuai useAuth.tsx
      await updateAccount(
        email !== profile?.email ? email : undefined, 
        undefined, // newPassword dikosongkan
        name !== profile?.name ? name : undefined,
        wallet !== profile?.walletAddress ? wallet : undefined
      );

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Gagal memperbarui akun.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
      <div className="p-8 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center text-white">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-stone-900">Pengaturan Akun</h3>
            <p className="text-xs text-stone-400">Kelola informasi profil dan keamanan Anda</p>
          </div>
        </div>
      </div>

      <div className="p-8">
        <form onSubmit={handleUpdate} className="grid md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">Nama Lengkap</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" />
              <input 
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nama Anda"
                className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all font-medium"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">
              Email {isWalletUser && <span className="text-blue-500 font-bold ml-1">(Bisa Disesuaikan)</span>}
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" />
              <input 
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@universitas.ac.id"
                className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all font-medium"
              />
            </div>
          </div>

          <div className="md:col-span-2 space-y-1.5">
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">Alamat Wallet (Ethereum/EVM)</label>
            <div className="relative">
              <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" />
              <input 
                type="text"
                value={wallet}
                onChange={e => setWallet(e.target.value)}
                placeholder="0x..."
                className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all font-medium font-mono text-sm"
              />
            </div>
          </div>

          <div className="md:col-span-2 space-y-4 pt-2">
            {isWalletUser && (
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-800 leading-relaxed">
                  <p className="font-bold mb-1 italic">Akun Terkoneksi Wallet</p>
                  Anda dapat menambahkan akun google. Setelah diperbarui, Anda tetap bisa login menggunakan wallet, atau menggunakan akun google tersebut secara langsung.
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> {error}
              </div>
            )}

            {success && (
              <div className="p-4 bg-green-50 border border-green-100 text-green-700 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Akun berhasil diperbarui.
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 disabled:opacity-50 transition-all shadow-lg flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'SIMPAN PERUBAHAN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}