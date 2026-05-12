import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { collection, query, where, getDocs, orderBy, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { Certificate } from '../types';
import { 
  Award, QrCode, ExternalLink, Calendar, ShieldCheck, 
  Download, Loader2, Settings, Gem, Clock, AlertCircle, X 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { getFunctions, httpsCallable } from 'firebase/functions'; // Import Functions
import AccountSettings from '../components/AccountSettings';

// Inisialisasi Cloud Function untuk Minting Aman
const functions = getFunctions();
const mintIjazahCloud = httpsCallable(functions, 'mintIjazah');

export default function StudentDashboard() {
  const { user, profile } = useAuth();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
  const [activeTab, setActiveTab] = useState<'certificates' | 'settings'>('certificates');
  
  const [mintingLoading, setMintingLoading] = useState(false);
  const [mintingStatus, setMintingStatus] = useState<string | null>(null);
  const [mintingError, setMintingError] = useState<string | null>(null);

  const fetchCertificates = async () => {
    if (!user?.email) return;
    try {
      const q = query(
        collection(db, 'certificates'), 
        where('studentEmail', '==', user.email.toLowerCase().trim()),
        orderBy('mintedAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      setCertificates(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Certificate)));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'certificates');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCertificates(); }, [user, profile]);

  const handleClaimNFT = async (cert: Certificate) => {
    setMintingError(null);
    if (!profile?.walletAddress) {
      setMintingError('Tambahkan alamat wallet di pengaturan akun terlebih dahulu.');
      return;
    }

    setMintingLoading(true);
    setMintingStatus('Menghubungkan ke Secure Oracle...');

    try {
      // 1. Panggil Backend untuk Minting (Tanpa Private Key di Frontend)
      const result = await mintIjazahCloud({
        recipientAddress: profile.walletAddress,
        ipfsUri: cert.ipfsHash ? `ipfs://${cert.ipfsHash}` : ''
      });

      const data = result.data as { success: boolean; hash: string };
      setMintingStatus(`Menunggu Konfirmasi Blockchain... (Hash: ${data.hash.slice(0, 10)}...)`);

      // 2. Update Database Lokal (Firestore)
      const certRef = doc(db, 'certificates', cert.id);
      await setDoc(certRef, {
        txHash: data.hash,
        tokenId: "NFT-" + Math.floor(Date.now() / 1000), // ID Identitas Sementara
        isDigitalOnly: false,
        studentWalletAddress: profile.walletAddress.toLowerCase()
      }, { merge: true });

      setMintingStatus('Berhasil! NFT Ijazah telah diterbitkan.');
      await fetchCertificates();
      setSelectedCert(prev => prev ? { ...prev, txHash: data.hash } : null);
      
      setTimeout(() => setMintingStatus(null), 5000);
    } catch (error: any) {
      setMintingError(`Gagal: ${error.message}`);
    } finally {
      setMintingLoading(false);
    }
  };

  if (loading) return <div className="h-64 flex flex-col items-center justify-center text-stone-400"><Loader2 className="animate-spin" /><p>Memuat Ijazah...</p></div>;

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
      {/* Header Dashboard */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-serif font-medium text-stone-900 italic">Personal Dashboard</h2>
          <p className="text-stone-500 text-sm mt-1">Kelola dan bagikan pencapaian akademik Anda</p>
        </div>
        <div className="flex items-center gap-2 bg-stone-100 p-1 rounded-xl border border-stone-200">
           <button onClick={() => setActiveTab('certificates')} className={`px-4 py-2 rounded-lg text-xs font-bold ${activeTab === 'certificates' ? 'bg-white shadow-sm' : 'text-stone-400'}`}>Sertifikat</button>
           <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 rounded-lg text-xs font-bold ${activeTab === 'settings' ? 'bg-white shadow-sm' : 'text-stone-400'}`}>Akun</button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'certificates' ? (
          <motion.div key="certs" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {certificates.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border border-stone-200">
                <Award className="w-16 h-16 text-stone-200 mx-auto mb-4" />
                <h3 className="text-xl font-serif text-stone-900">Belum ada ijazah</h3>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {certificates.map((cert) => (
                  <div key={cert.id} onClick={() => setSelectedCert(cert)} className="cursor-pointer bg-white rounded-2xl border border-stone-200 overflow-hidden hover:shadow-xl transition-all p-4">
                    <img src={cert.imageUrl} className="w-full aspect-video object-cover rounded-xl mb-4" />
                    <div className="flex justify-between items-start">
                       <h4 className="font-serif italic text-lg">{cert.studentName}</h4>
                       <span className={`text-[10px] font-bold px-2 py-1 rounded ${cert.txHash ? 'bg-stone-900 text-white' : 'bg-amber-100 text-amber-700'}`}>
                         {cert.txHash ? 'NFT' : 'DIGITAL'}
                       </span>
                    </div>
                    <p className="text-[10px] text-stone-400 mt-2 uppercase tracking-widest">{cert.certificateNumber}</p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <AccountSettings />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Detail */}
      <AnimatePresence>
        {selectedCert && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedCert(null)} className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-40" />
            <motion.div layoutId={selectedCert.id} className="fixed inset-x-4 top-[10%] bottom-[10%] mx-auto max-w-4xl bg-white rounded-[2.5rem] shadow-2xl z-50 overflow-hidden flex flex-col md:flex-row border border-stone-200">
              <div className="md:w-1/2 bg-stone-100"><img src={selectedCert.imageUrl} className="w-full h-full object-cover" /></div>
              <div className="flex-1 p-10 overflow-y-auto space-y-8">
                <div className="flex justify-between items-start">
                  <h3 className="text-3xl font-serif italic text-stone-900">Detail Ijazah</h3>
                  <X className="cursor-pointer text-stone-300" onClick={() => setSelectedCert(null)} />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div><p className="label-style">Pemilik</p><p className="font-bold text-sm">{selectedCert.studentName}</p></div>
                  <div><p className="label-style">No. Ijazah</p><p className="font-bold text-sm">{selectedCert.certificateNumber}</p></div>
                </div>

                {selectedCert.txHash ? (
                  <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100">
                    <p className="label-style mb-2">Blockchain Proof</p>
                    <a href={`https://sepolia.etherscan.io/tx/${selectedCert.txHash}`} target="_blank" className="text-[10px] font-mono break-all text-blue-600 underline flex items-center gap-1">
                      {selectedCert.txHash} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ) : (
                  <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 space-y-4">
                    <p className="text-xs text-amber-800 font-medium">Sertifikat ini tersedia untuk diklaim sebagai NFT permanen.</p>
                    <button onClick={() => handleClaimNFT(selectedCert)} disabled={mintingLoading} className="w-full bg-stone-900 text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                      {mintingLoading ? <Loader2 className="animate-spin" /> : <Gem className="w-4 h-4" />} KLAIM SEBAGAI NFT
                    </button>
                    {mintingError && <p className="text-[10px] text-red-600 font-bold">{mintingError}</p>}
                    {mintingStatus && <p className="text-[10px] text-stone-900 font-bold animate-pulse">{mintingStatus}</p>}
                  </div>
                )}

                <div className="pt-6 border-t border-stone-100 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="label-style">Verifikasi QR</p>
                    <QRCodeSVG value={`${window.location.origin}/?certId=${selectedCert.id}`} size={80} />
                  </div>
                  <a href={`/?certId=${selectedCert.id}`} target="_blank" className="bg-stone-100 p-4 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-stone-200 transition-all">Lihat Halaman Verifikasi</a>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`
        .label-style { @apply text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1; }
      `}</style>
    </div>
  );
}