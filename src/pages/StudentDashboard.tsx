import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { collection, query, where, getDocs, orderBy, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { Certificate } from '../types';
import { Award, QrCode, ExternalLink, Calendar, ShieldCheck, Download, Loader2, Settings, Gem, Clock, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { ethers } from 'ethers';
import { getProvider, getContract, getAdminWallet } from '../lib/blockchain';
import AccountSettings from '../components/AccountSettings';

export default function StudentDashboard() {
  const { user, profile } = useAuth();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
  const [activeTab, setActiveTab] = useState<'certificates' | 'settings'>('certificates');
  const [debugInfo, setDebugInfo] = useState<string>('');

  // Minting state
  const [mintingLoading, setMintingLoading] = useState(false);
  const [mintingStatus, setMintingStatus] = useState<string | null>(null);
  const [mintingError, setMintingError] = useState<string | null>(null);

  const fetchCertificates = async () => {
    if (!user?.email) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setDebugInfo('Memuat data...');

    try {
      const emailLower = user.email.toLowerCase().trim();
      console.log('=== FETCH CERTIFICATES ===');
      console.log('User email:', emailLower);
      console.log('Profile wallet:', profile?.walletAddress);

      // Query berdasarkan email (tanpa orderBy dulu untuk menghindari error)
      const certsCollection = collection(db, 'certificates');
      let emailQuery = query(certsCollection, where('studentEmail', '==', emailLower));
      
      let fetchedData: Certificate[] = [];
      const emailSnapshot = await getDocs(emailQuery);
      fetchedData = emailSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Certificate));
      console.log(`Found by email: ${fetchedData.length}`);

      // Jika ada wallet address (dari profile atau dari email wallet sintetis)
      let walletAddress: string | null = null;
      if (user.email.startsWith('wallet_')) {
        const extracted = user.email.split('_')[1]?.split('@')[0];
        if (extracted && ethers.isAddress(extracted)) {
          walletAddress = extracted.toLowerCase();
          console.log('Extracted wallet from email:', walletAddress);
        }
      } else if (profile?.walletAddress) {
        walletAddress = profile.walletAddress.toLowerCase();
        console.log('Profile wallet address:', walletAddress);
      }

      if (walletAddress) {
        const walletQuery = query(certsCollection, where('studentWalletAddress', '==', walletAddress));
        const walletSnapshot = await getDocs(walletQuery);
        const walletCerts = walletSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Certificate));
        console.log(`Found by wallet: ${walletCerts.length}`);
        
        // Merge tanpa duplikasi
        walletCerts.forEach(wc => {
          if (!fetchedData.find(fc => fc.id === wc.id)) {
            fetchedData.push(wc);
          }
        });
      }

      // Sorting manual berdasarkan mintedAt (descending)
      fetchedData.sort((a, b) => {
        const getTime = (cert: Certificate) => {
          if (cert.mintedAt?.seconds) return cert.mintedAt.seconds;
          if (cert.mintedAt instanceof Date) return cert.mintedAt.getTime() / 1000;
          if (typeof cert.mintedAt === 'number') return cert.mintedAt;
          return 0;
        };
        return getTime(b) - getTime(a);
      });

      console.log(`Total certificates: ${fetchedData.length}`);
      setCertificates(fetchedData);
      setDebugInfo(`Ditemukan ${fetchedData.length} sertifikat. Email: ${emailLower} | Wallet: ${walletAddress || 'tidak ada'}`);
    } catch (err: any) {
      console.error('Error fetching certificates:', err);
      setDebugInfo(`Error: ${err.message}`);
      handleFirestoreError(err, OperationType.GET, 'certificates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCertificates();
  }, [user, profile]);

  const handleClaimNFT = async (cert: Certificate) => {
    setMintingError(null);
    if (!profile?.walletAddress) {
      setMintingError('Tolong tambahkan alamat wallet di pengaturan akun Anda terlebih dahulu.');
      return;
    }

    if (!ethers.isAddress(profile.walletAddress)) {
      setMintingError('Alamat wallet di profil Anda tidak valid.');
      return;
    }

    setMintingLoading(true);
    setMintingStatus('Initializing Blockchain Access...');

    try {
      const provider = getProvider();
      const adminWallet = getAdminWallet(provider);
      
      if (!adminWallet) {
        throw new Error('Sistem belum dikonfigurasi untuk minting mandiri (VITE_PRIVATE_KEY missing). Silakan hubungi admin.');
      }

      const contract = getContract(adminWallet);
      const numericTokenId = Math.floor(Date.now() / 1000);
      const tokenURI = cert.ipfsHash ? `ipfs://${cert.ipfsHash}` : ''; 

      setMintingStatus('Cetak Token di Blockchain Sepolia...');
      const tx = await contract.mintIjazah(profile.walletAddress, numericTokenId, tokenURI);
      
      setMintingStatus(`Menunggu Konfirmasi Blockchain... (Hash: ${tx.hash.slice(0, 10)}...)`);
      await tx.wait();

      setMintingStatus('Memperbarui Database Sertifikat...');
      const certRef = doc(db, 'certificates', cert.id);
      await setDoc(certRef, {
        tokenId: numericTokenId.toString(),
        txHash: tx.hash,
        isDigitalOnly: false,
        studentWalletAddress: profile.walletAddress.toLowerCase()
      }, { merge: true });

      setMintingStatus('Berhasil! NFT telah diterbitkan.');
      await fetchCertificates();
      setSelectedCert(prev => prev ? { ...prev, txHash: tx.hash, tokenId: numericTokenId.toString() } : null);
      setTimeout(() => setMintingStatus(null), 5000);
    } catch (error: any) {
      console.error('Minting error:', error);
      setMintingError(`Gagal: ${error.message}`);
    } finally {
      setMintingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-4 text-stone-400">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm font-medium">Memuat data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-serif font-medium text-stone-900 italic">Dashboard Mahasiswa</h2>
          <p className="text-stone-500 text-sm mt-1">Kelola dan bagikan pencapaian digital Anda</p>
          {debugInfo && (
            <p className="text-xs text-stone-400 mt-2 font-mono">{debugInfo}</p>
          )}
        </div>
        
        <div className="flex items-center gap-2 bg-stone-100 p-1 rounded-xl border border-stone-200 self-start">
           <button 
             onClick={() => setActiveTab('certificates')}
             className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'certificates' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
           >
             <Award className="w-3.5 h-3.5" /> Sertifikat
           </button>
           <button 
             onClick={() => setActiveTab('settings')}
             className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'settings' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
           >
             <Settings className="w-3.5 h-3.5" /> Akun
           </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'certificates' ? (
          <motion.div
            key="certs"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {certificates.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border border-stone-200">
                <Award className="w-16 h-16 text-stone-200 mx-auto mb-4" />
                <h3 className="text-xl font-serif text-stone-900 mb-2">Belum ada sertifikat</h3>
                <p className="text-stone-500 text-sm max-w-xs mx-auto">
                  Sertifikat digital Anda akan muncul di sini setelah diterbitkan oleh institusi.
                </p>
                <div className="mt-6 p-4 bg-stone-50 rounded-xl max-w-md mx-auto text-left text-xs text-stone-600">
                  <p><strong>Info akun saat ini:</strong></p>
                  <p>Email: {user?.email}</p>
                  <p>Wallet terdaftar: {profile?.walletAddress || 'Belum diisi'}</p>
                  <p className="mt-2 text-stone-500">Pastikan email atau wallet address Anda cocok dengan data sertifikat.</p>
                </div>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {certificates.map((cert) => (
                  <motion.div 
                    key={cert.id}
                    layoutId={cert.id}
                    onClick={() => setSelectedCert(cert)}
                    className="group cursor-pointer bg-white rounded-2xl border border-stone-200 overflow-hidden hover:shadow-xl hover:shadow-stone-200 transition-all duration-300 transform hover:-translate-y-1"
                  >
                    <div className="aspect-[4/3] bg-stone-100 relative overflow-hidden">
                      <img 
                        src={cert.imageUrl} 
                        alt={cert.studentName} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-stone-900/0 lg:group-hover:bg-stone-900/40 transition-colors flex items-center justify-center">
                         <div className="opacity-0 lg:group-hover:opacity-100 transition-opacity bg-white text-stone-900 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest shadow-xl">
                            Lihat Detail
                         </div>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-2">
                         <h4 className="font-serif italic text-lg text-stone-900">Ijazah Universitas</h4>
                         <span className={`text-[10px] font-bold px-2 py-1 rounded tracking-widest ${cert.txHash ? 'bg-stone-900 text-white' : 'bg-amber-100 text-amber-700'}`}>
                           {cert.txHash ? 'NFT' : 'DIGITAL'}
                         </span>
                      </div>
                      <div className="space-y-1 text-xs text-stone-500">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3 h-3" />
                          Diterbitkan {new Date(cert.issueDate).toLocaleDateString('id-ID')}
                        </div>
                        <div className="flex items-center gap-2">
                          <ShieldCheck className={`w-3 h-3 ${cert.txHash ? 'text-green-600' : 'text-stone-400'}`} />
                          {cert.txHash ? `ID: ${cert.tokenId}` : 'Terverifikasi Database'}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-4xl"
          >
            <AccountSettings />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail Modal - sama seperti sebelumnya */}
      <AnimatePresence>
        {selectedCert && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCert(null)}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-40"
            />
            <motion.div 
              layoutId={selectedCert.id}
              className="fixed inset-x-4 top-[10%] bottom-[10%] mx-auto max-w-4xl bg-white rounded-3xl shadow-2xl z-50 overflow-hidden flex flex-col md:flex-row border border-white/20"
            >
              <div className="md:w-1/2 h-64 md:h-full bg-stone-100 relative">
                 <img src={selectedCert.imageUrl} className="w-full h-full object-cover" />
                 <div className="absolute top-4 left-4 bg-white/80 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm">
                   Dokumen Ijazah
                 </div>
              </div>
              
              <div className="flex-1 p-8 md:p-12 overflow-y-auto bg-stone-50/50">
                 <div className="flex items-start justify-between mb-8">
                    <div>
                      <h3 className="text-3xl font-serif font-medium text-stone-900 mb-2 italic underline underline-offset-8 decoration-stone-200">Ijazah Digital</h3>
                      <p className="text-stone-500 font-medium">Bukti Kelulusan Resmi</p>
                    </div>
                    <button onClick={() => setSelectedCert(null)} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
                      <ExternalLink className="w-5 h-5 text-stone-400 rotate-45" />
                    </button>
                 </div>

                 <div className="grid grid-cols-2 gap-8 mb-12">
                   <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1">Nama Lulusan</p>
                        <p className="font-semibold text-stone-900">{selectedCert.studentName}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1">Nomor Ijazah</p>
                        <p className="font-semibold text-stone-900">{selectedCert.certificateNumber}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1">Tanggal Kelulusan</p>
                        <p className="font-semibold text-stone-900">{new Date(selectedCert.issueDate).toLocaleDateString('id-ID')}</p>
                      </div>
                   </div>
                   <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1">ID Blockchain</p>
                        <p className="font-mono text-xs text-stone-900 break-all">{selectedCert.tokenId || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1">Status</p>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${selectedCert.txHash ? 'bg-green-500' : 'bg-amber-500'}`} />
                          <p className="font-semibold text-stone-900 text-xs uppercase tracking-wider">{selectedCert.txHash ? 'Tercatat di Blockchain' : 'Tersimpan di Database'}</p>
                        </div>
                      </div>
                      {selectedCert.txHash ? (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1">TX Hash</p>
                          <a 
                            href={`https://sepolia.etherscan.io/tx/${selectedCert.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[10px] text-stone-500 break-all leading-tight hover:text-stone-900 underline flex items-center gap-1"
                          >
                            {selectedCert.txHash.substring(0, 20)}...
                            <ExternalLink className="w-2 h-2" />
                          </a>
                        </div>
                      ) : (
                        <div className="bg-stone-100 p-4 rounded-xl border border-stone-200">
                          {profile?.walletAddress ? (
                            <div className="space-y-3">
                              <p className="text-[10px] text-stone-500 leading-normal font-medium">
                                Sertifikat ini dapat diubah menjadi NFT permanen di blockchain.
                              </p>
                              <button
                                onClick={() => handleClaimNFT(selectedCert)}
                                disabled={mintingLoading}
                                className="w-full bg-stone-900 text-white p-3 rounded-lg text-xs font-bold hover:bg-stone-800 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                              >
                                {mintingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gem className="w-3.5 h-3.5" />}
                                CLAIM AS NFT
                              </button>
                              {mintingError && (
                                <div className="p-2 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2">
                                  <AlertCircle className="w-3 h-3 text-red-500" />
                                  <p className="text-[9px] text-red-600 font-medium">{mintingError}</p>
                                </div>
                              )}
                              {mintingStatus && (
                                <div className="flex items-center gap-2 text-[9px] text-stone-900 font-bold animate-pulse bg-stone-50 p-2 rounded-lg">
                                  <Clock className="w-2.5 h-2.5" /> {mintingStatus}
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-[10px] text-stone-500 leading-normal">
                              Untuk meningkatkan sertifikat ini menjadi NFT, tambahkan alamat wallet Anda di menu <b>Akun</b>.
                            </p>
                          )}
                        </div>
                      )}
                      {selectedCert.ipfsHash && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1">Penyimpanan IPFS</p>
                          <a 
                            href={`https://gateway.pinata.cloud/ipfs/${selectedCert.ipfsHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] font-medium text-stone-500 hover:text-stone-900 flex items-center gap-1 underline"
                          >
                            Lihat di IPFS <ExternalLink className="w-2 h-2" />
                          </a>
                        </div>
                      )}
                   </div>
                 </div>

                 <div className="bg-white p-8 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between">
                    <div>
                      <h4 className="font-serif italic text-xl mb-1">QR Verifikasi</h4>
                      <p className="text-xs text-stone-500 leading-relaxed max-w-[200px]">Scan untuk melihat halaman verifikasi keaslian.</p>
                      <div className="mt-4 flex gap-3">
                         <button className="text-[10px] uppercase font-bold flex items-center gap-1 text-stone-900 hover:opacity-70 transition-opacity">
                           <Download className="w-3 h-3" /> Simpan QR
                         </button>
                      </div>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-stone-100 shadow-inner">
                      <QRCodeSVG 
                        value={`${window.location.origin}/?certId=${selectedCert.id}`}
                        size={100}
                        level="H"
                        includeMargin={false}
                      />
                    </div>
                 </div>

                 <div className="mt-8 flex gap-4">
                    <a 
                      href={`/?certId=${selectedCert.id}`}
                      target="_blank"
                      className="flex-1 bg-stone-900 text-white py-4 rounded-xl text-center font-bold text-sm hover:bg-stone-800 transition-colors flex items-center justify-center gap-2"
                    >
                      <QrCode className="w-4 h-4" /> Buka Halaman Verifikasi
                    </a>
                 </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}