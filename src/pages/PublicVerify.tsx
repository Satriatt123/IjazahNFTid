import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { Certificate } from '../types';
import { 
  ShieldCheck, Award, Calendar, CheckCircle2, QrCode, 
  ArrowLeft, Loader2, Globe, ExternalLink, Info, AlertTriangle 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PublicVerifyProps {
  onBack: () => void;
}

export default function PublicVerify({ onBack }: PublicVerifyProps) {
  const [cert, setCert] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchId, setSearchId] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const certId = params.get('certId');
    if (certId && certId !== 'manual') {
      loadCertificate(certId);
    } else {
      setLoading(false);
    }
  }, []);

  async function loadCertificate(id: string) {
    const cleanId = id.trim();
    if (!cleanId) return;

    setLoading(true);
    setError(null);

    try {
      if (cleanId.length >= 20) {
        const docRef = doc(db, 'certificates', cleanId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setCert({ id: docSnap.id, ...docSnap.data() } as Certificate);
          return;
        }
      }

      const qToken = query(collection(db, 'certificates'), 
        where('tokenId', '==', cleanId), limit(1));
      const tokenSnap = await getDocs(qToken);
      if (!tokenSnap.empty) {
        const d = tokenSnap.docs[0];
        setCert({ id: d.id, ...d.data() } as Certificate);
        return;
      }

      const qNum = query(collection(db, 'certificates'), 
        where('certificateNumber', '==', cleanId), limit(1));
      const numSnap = await getDocs(qNum);
      if (!numSnap.empty) {
        const d = numSnap.docs[0];
        setCert({ id: d.id, ...d.data() } as Certificate);
        return;
      }

      setError('Sertifikat tidak ditemukan. Periksa kembali ID atau Nomor Ijazah.');
    } catch (err) {
      console.error('Lookup error:', err);
      setError('Terjadi kesalahan sistem saat verifikasi.');
    } finally {
      setLoading(false);
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchId.trim()) loadCertificate(searchId.trim());
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-stone-50">
        <Loader2 className="w-12 h-12 text-stone-300 animate-spin mb-6" />
        <h2 className="text-2xl font-serif italic text-stone-900">Validating Record</h2>
        <p className="text-stone-500 mt-2 text-sm tracking-widest uppercase font-bold opacity-40">VeriCert Protocol Oracle</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 py-12 animate-in fade-in duration-700">
      <div className="mb-12 flex justify-between items-center bg-white p-6 rounded-[2rem] border border-stone-200 shadow-sm">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-stone-400 hover:text-stone-900 transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Portal
        </button>
        <div className="flex items-center gap-2 text-stone-900">
           <ShieldCheck className="w-5 h-5" />
           <span className="font-serif italic text-lg tracking-tight">VeriCert Protocol</span>
        </div>
      </div>

      {!cert ? (
        <div className="max-w-xl mx-auto space-y-10 py-10">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-stone-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <QrCode className="w-10 h-10 text-stone-900" />
            </div>
            <h1 className="text-4xl font-serif font-medium text-stone-900">Verification Center</h1>
            <p className="text-stone-500 text-sm leading-relaxed px-10">
              Masukkan ID Ijazah atau Nomor Registrasi untuk memvalidasi keaslian dokumen akademik.
            </p>
          </div>
          
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="relative group">
              <input 
                type="text" 
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="Certificate ID / No. Ijazah"
                className="w-full px-8 py-5 rounded-2xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all bg-stone-50/50"
              />
              <button className="absolute right-3 top-3 bottom-3 px-6 bg-stone-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-black transition-all">
                Verify
              </button>
            </div>
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-center gap-2 text-red-600 bg-red-50 p-4 rounded-xl">
                  <AlertTriangle className="w-4 h-4" />
                  <p className="text-xs font-bold uppercase tracking-tight">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          <div className="relative bg-white rounded-[2.5rem] border border-stone-200 shadow-2xl overflow-hidden">
             
             <div className={`${cert.txHash ? 'bg-green-600' : 'bg-amber-600'} text-white px-10 py-5 flex flex-col md:flex-row items-center justify-between gap-4`}>
                <div className="flex items-center gap-3">
                   <CheckCircle2 className="w-4 h-4" />
                   <span className="text-xs font-bold uppercase tracking-[0.15em]">
                     {cert.txHash ? 'Verifikasi Kriptografis Blockchain Berhasil' : 'Dokumen Digital Terverifikasi'}
                   </span>
                </div>
                <div className="font-mono text-[10px] tracking-wider opacity-80 bg-black/10 px-4 py-1.5 rounded-full">
                  {cert.txHash ? `TX: ${cert.txHash.substring(0, 18)}...` : 'ID: ' + cert.id.substring(0, 12)}
                </div>
             </div>

             <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-stone-100">
                <div className="md:w-[40%] p-10 sm:p-14 bg-stone-50/40">
                   <div className="relative mb-10">
                      <img src={cert.imageUrl} className="w-full aspect-[3/4] object-cover rounded-3xl shadow-2xl border border-white" alt="Diploma Preview" />
                   </div>
                   
                   <div className="space-y-8">
                      <div>
                        <h4 className="tech-label">Blockchain Token ID</h4>
                        <p className="tech-value">{cert.tokenId || 'Unminted Record'}</p>
                      </div>

                      <div>
                        <h4 className="tech-label">On-Chain Proof (Sepolia)</h4>
                        {cert.txHash ? (
                          <a 
                            href={`https://sepolia.etherscan.io/tx/${cert.txHash}`}
                            target="_blank" rel="noreferrer"
                            className="flex items-center gap-2 text-[10px] font-mono text-stone-500 hover:text-stone-900 underline underline-offset-4"
                          >
                            {cert.txHash.substring(0, 24)}... <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : (
                          <p className="text-[10px] text-stone-400 italic">Data belum tercatat di blockchain</p>
                        )}
                      </div>

                      <div className="pt-6 border-t border-stone-100">
                        <p className="text-[10px] font-bold text-stone-900 mb-1">Lembaga Penerbit</p>
                        <p className="text-[10px] text-stone-500">Universitas Pembangunan Nasional "Veteran" Yogyakarta</p>
                      </div>
                   </div>
                </div>

                <div className="flex-1 p-10 sm:p-14 space-y-12 bg-white">
                   <div className="space-y-2">
                      <h2 className="text-5xl font-serif italic text-stone-900 leading-tight">Ijazah Universitas</h2>
                      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-400">Arsip Digital Resmi</p>
                   </div>

                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-10 gap-x-12">
                      <div className="space-y-1">
                        <h4 className="content-label">Nama Lulusan</h4>
                        <p className="text-2xl font-serif text-stone-900">{cert.studentName}</p>
                      </div>
                      <div className="space-y-1">
                        <h4 className="content-label">Status Validasi</h4>
                        <div className="flex items-center gap-2 pt-1">
                          <div className={`w-2 h-2 rounded-full animate-pulse ${cert.txHash ? 'bg-green-500' : 'bg-amber-500'}`} />
                          <span className="text-[11px] font-bold text-stone-900 uppercase tracking-tighter">
                            {cert.txHash ? 'Tercatat Permanen' : 'Verifikasi Internal'}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h4 className="content-label">Nomor Ijazah</h4>
                        <p className="text-sm font-bold text-stone-900 font-mono">{cert.certificateNumber}</p>
                      </div>
                      <div className="space-y-1">
                        <h4 className="content-label">Tanggal Kelulusan</h4>
                        <div className="flex items-center gap-2 text-stone-900 font-medium">
                           <Calendar className="w-3.5 h-3.5 text-stone-300" />
                           <span className="text-sm">
                             {new Date(cert.issueDate).toLocaleDateString('id-ID', { 
                               day: 'numeric', month: 'long', year: 'numeric' 
                             })}
                           </span>
                        </div>
                      </div>
                   </div>

                   <div className="p-8 bg-stone-50 rounded-[2rem] border border-stone-100 space-y-4">
                      <div className="flex items-center gap-3">
                         <ShieldCheck className="w-5 h-5 text-stone-900" />
                         <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-900">Laporan Keaslian</h4>
                      </div>
                      <p className="text-[11px] text-stone-500 leading-relaxed italic">
                        Ijazah digital ini dilindungi oleh Protokol SADEWA. Keaslian data dijamin melalui 
                        sinkronisasi database universitas dan teknologi Ledger Blockchain.
                      </p>
                   </div>
                </div>
             </div>
          </div>
          
          <div className="text-center">
             <button onClick={() => setCert(null)} className="text-stone-300 hover:text-stone-900 font-bold uppercase tracking-[0.3em] text-[9px] p-4">
               Verifikasi Ijazah Lain
             </button>
          </div>
        </motion.div>
      )}

      <style>{`
        .tech-label { @apply text-[9px] font-bold uppercase tracking-widest text-stone-400 mb-1.5; }
        .tech-value { @apply font-mono text-[10px] text-stone-900 break-all leading-relaxed; }
        .content-label { @apply text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1; }
      `}</style>
    </div>
  );
}