import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { collection, query, where, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { Certificate } from '../types';
import { Award, QrCode, ExternalLink, Calendar, ShieldCheck, Download, Loader2, Settings, Gem, Clock, AlertCircle, User } from 'lucide-react';
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
  
  // Minting state
  const [mintingLoading, setMintingLoading] = useState(false);
  const [mintingStatus, setMintingStatus] = useState<string | null>(null);
  const [mintingError, setMintingError] = useState<string | null>(null);

  const fetchCertificates = async () => {
    if (!user?.email) return;

    setLoading(true);
    const path = 'certificates';
    
    try {
      const currentUserEmail = user.email.toLowerCase().trim();
      
      // PERBAIKAN 2: Hapus 'orderBy' dari Query Firestore sementara 
      // Untuk menghindari error "Missing Index". Kita akan sort manual di JavaScript.
      const emailQuery = query(
        collection(db, 'certificates'), 
        where('studentEmail', '==', currentUserEmail)
      );
      
      const emailSnapshot = await getDocs(emailQuery);
      let fetchedData: Certificate[] = emailSnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as Certificate));

      // PERBAIKAN 3: Cek Alamat Wallet secara dinamis
      const walletAddressFromEmail = user.email.startsWith('wallet_') 
        ? user.email.split('_')[1].split('@')[0]
        : null;
      
      const effectiveWallet = walletAddressFromEmail || profile?.walletAddress;

      if (effectiveWallet) {
        const walletQuery = query(
          collection(db, 'certificates'),
          where('studentWalletAddress', '==', effectiveWallet.toLowerCase().trim())
        );
        
        const walletSnapshot = await getDocs(walletQuery);
        const walletCerts = walletSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        } as Certificate));
        
        // Merge dan hapus duplikat berdasarkan ID
        walletCerts.forEach(wc => {
          if (!fetchedData.find(fc => fc.id === wc.id)) {
            fetchedData.push(wc);
          }
        });
      }

      // PERBAIKAN 4: Sorting Manual di Client Side (Bypass Index requirement)
      fetchedData.sort((a, b) => {
        const dateA = a.mintedAt?.seconds || new Date(a.issueDate).getTime() / 1000 || 0;
        const dateB = b.mintedAt?.seconds || new Date(b.issueDate).getTime() / 1000 || 0;
        return dateB - dateA;
      });

      setCertificates(fetchedData);
    } catch (err) {
      console.error("Fetch Error:", err);
      // Jika muncul error index, ini akan membantu debug
      handleFirestoreError(err, OperationType.GET, path);
    } finally {
      setLoading(false);
    }
  }

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
    setMintingStatus('Menyiapkan Akses Blockchain...');

    try {
      const provider = getProvider();
      const adminWallet = getAdminWallet(provider);
      
      if (!adminWallet) {
        throw new Error('Sistem belum dikonfigurasi (VITE_PRIVATE_KEY missing).');
      }

      const contract = getContract(adminWallet);
      const numericTokenId = Math.floor(Date.now() / 1000);
      const tokenURI = cert.ipfsHash ? `ipfs://${cert.ipfsHash}` : ''; 

      setMintingStatus('Proses Minting di Sepolia...');
      const tx = await contract.mintIjazah(profile.walletAddress, numericTokenId, tokenURI);
      
      setMintingStatus(`Menunggu Konfirmasi (Hash: ${tx.hash.slice(0, 10)}...)`);
      await tx.wait();

      setMintingStatus('Sinkronisasi Database...');
      const certRef = doc(db, 'certificates', cert.id);
      
      // Update Firestore
      await updateDoc(certRef, {
        tokenId: numericTokenId.toString(),
        txHash: tx.hash,
        isDigitalOnly: false,
        studentWalletAddress: profile.walletAddress.toLowerCase()
      });

      setMintingStatus('Berhasil! NFT Terbit.');
      await fetchCertificates();
      
      // Update tampilan modal jika masih terbuka
      setSelectedCert(prev => prev ? { 
        ...prev, 
        txHash: tx.hash, 
        tokenId: numericTokenId.toString(),
        isDigitalOnly: false 
      } : null);
      
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
        <p className="text-sm font-medium italic">Memvalidasi sertifikat Anda...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-serif font-medium text-stone-900 italic">Personal Dashboard</h2>
          <p className="text-stone-500 text-sm mt-2 flex items-center gap-2">
            <User className="w-4 h-4" /> Logged in as: <span className="font-bold text-stone-700">{user?.email}</span>
          </p>
        </div>
        
        <div className="flex items-center gap-2 bg-stone-100 p-1.5 rounded-2xl border border-stone-200 self-start shadow-sm">
           <button 
             onClick={() => setActiveTab('certificates')}
             className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'certificates' ? 'bg-white text-stone-900 shadow-md' : 'text-stone-400 hover:text-stone-600'}`}
           >
             <Award className="w-4 h-4" /> Sertifikat
           </button>
           <button 
             onClick={() => setActiveTab('settings')}
             className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'settings' ? 'bg-white text-stone-900 shadow-md' : 'text-stone-400 hover:text-stone-600'}`}
           >
             <Settings className="w-4 h-4" /> Akun
           </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'certificates' ? (
          <motion.div
            key="certs"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {certificates.length === 0 ? (
              <div className="text-center py-32 bg-white rounded-[2.5rem] border border-stone-200 shadow-sm">
                <div className="w-20 h-20 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-6">
                   <Award className="w-10 h-10 text-stone-200" />
                </div>
                <h3 className="text-2xl font-serif text-stone-900 mb-2">Belum ada ijazah</h3>
                <p className="text-stone-400 text-sm max-w-xs mx-auto">Sertifikat digital Anda akan muncul di sini setelah diterbitkan oleh admin.</p>
                <button onClick={fetchCertificates} className="mt-8 text-stone-900 text-xs font-bold underline underline-offset-4 hover:opacity-70 transition-opacity">
                  REFRESH DATA
                </button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {certificates.map((cert) => (
                  <motion.div 
                    key={cert.id}
                    layoutId={cert.id}
                    onClick={() => setSelectedCert(cert)}
                    className="group cursor-pointer bg-white rounded-[2rem] border border-stone-200 overflow-hidden hover:shadow-2xl hover:shadow-stone-200/50 transition-all duration-500 transform hover:-translate-y-2"
                  >
                    <div className="aspect-[16/10] bg-stone-100 relative overflow-hidden">
                      <img 
                        src={cert.imageUrl} 
                        alt={cert.courseName} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      />
                      <div className="absolute inset-0 bg-stone-900/0 group-hover:bg-stone-900/40 transition-all duration-500 flex items-center justify-center">
                         <div className="opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-500 bg-white text-stone-900 px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl">
                            LIHAT DETAIL
                         </div>
                      </div>
                      <div className="absolute top-4 right-4">
                         <span className={`text-[9px] font-black px-3 py-1.5 rounded-full tracking-widest shadow-sm ${cert.txHash ? 'bg-green-500 text-white' : 'bg-white/90 backdrop-blur text-stone-900'}`}>
                           {cert.txHash ? 'NFT' : 'DIGITAL'}
                         </span>
                      </div>
                    </div>
                    <div className="p-8">
                      <h4 className="font-serif italic text-xl text-stone-900 mb-4 line-clamp-1">{cert.courseName}</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-stone-400">
                          <Calendar className="w-4 h-4" />
                          <span className="text-xs font-medium">Issued: {new Date(cert.issueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <ShieldCheck className={`w-4 h-4 ${cert.txHash ? 'text-green-600' : 'text-stone-300'}`} />
                          <span className="text-[10px] font-bold tracking-widest text-stone-500 uppercase">
                            {cert.txHash ? `TOKEN ID: ${cert.tokenId}` : 'DATABASE VERIFIED'}
                          </span>
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
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="max-w-4xl mx-auto"
          >
            <AccountSettings />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedCert && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCert(null)}
              className="fixed inset-0 bg-stone-900/60 backdrop-blur-md z-[60]"
            />
            <motion.div 
              layoutId={selectedCert.id}
              className="fixed inset-x-4 top-[5%] bottom-[5%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-5xl bg-white rounded-[3rem] shadow-2xl z-[70] overflow-hidden flex flex-col md:flex-row border border-white/20"
            >
              {/* Image Section */}
              <div className="md:w-[55%] h-64 md:h-full bg-stone-100 relative group">
                 <img src={selectedCert.imageUrl} className="w-full h-full object-cover" />
                 <div className="absolute inset-0 bg-gradient-to-t from-stone-900/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                 <div className="absolute bottom-8 left-8 text-white opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0">
                    <p className="text-[10px] font-black tracking-[0.3em] uppercase">Credential Image Asset</p>
                 </div>
              </div>
              
              {/* Info Section */}
              <div className="flex-1 p-8 md:p-14 overflow-y-auto bg-stone-50/30 flex flex-col">
                 <div className="flex items-start justify-between mb-12">
                    <div>
                      <span className="text-[10px] font-black text-[#2196F3] tracking-[0.3em] uppercase mb-4 block">Official Certificate</span>
                      <h3 className="text-4xl font-serif font-medium text-stone-900 mb-2 italic leading-tight">{selectedCert.courseName}</h3>
                    </div>
                    <button onClick={() => setSelectedCert(null)} className="p-3 hover:bg-stone-200 rounded-full transition-all">
                      <ExternalLink className="w-6 h-6 text-stone-400 rotate-45" />
                    </button>
                 </div>

                 <div className="grid grid-cols-2 gap-y-10 gap-x-8 mb-12">
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400">Nama Mahasiswa</p>
                      <p className="font-bold text-stone-900">{selectedCert.studentName}</p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400">No. Sertifikat</p>
                      <p className="font-bold text-stone-900">{selectedCert.certificateNumber}</p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400">Tanggal Terbit</p>
                      <p className="font-bold text-stone-900">{new Date(selectedCert.issueDate).toLocaleDateString('id-ID', { dateStyle: 'long' })}</p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400">Blockchain ID</p>
                      <p className="font-mono text-[11px] font-bold text-stone-900 truncate">{selectedCert.tokenId || 'Unminted'}</p>
                    </div>
                 </div>

                 <div className="mt-auto space-y-6">
                    {/* Status & Claim Section */}
                    {selectedCert.txHash ? (
                      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-green-600">Verified On-Chain</p>
                          <a 
                            href={`https://sepolia.etherscan.io/tx/${selectedCert.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[10px] text-stone-500 hover:text-stone-900 flex items-center gap-2 group"
                          >
                            TX: {selectedCert.txHash.slice(0, 24)}...
                            <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                          </a>
                        </div>
                        <ShieldCheck className="w-8 h-8 text-green-500" />
                      </div>
                    ) : (
                      <div className="bg-[#1a1a1a] p-8 rounded-[2rem] text-white space-y-5">
                        <div className="flex items-center gap-3">
                          <Gem className="w-5 h-5 text-amber-400" />
                          <p className="text-xs font-bold tracking-wider uppercase">Upgrade to NFT</p>
                        </div>
                        <p className="text-xs text-stone-400 leading-relaxed">
                          Sertifikat ini terverifikasi di database. Anda dapat mengabadikannya ke blockchain Sepolia sebagai NFT permanen.
                        </p>
                        
                        {profile?.walletAddress ? (
                          <div className="space-y-4">
                            <button
                              onClick={() => handleClaimNFT(selectedCert)}
                              disabled={mintingLoading}
                              className="w-full bg-white text-stone-900 py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                            >
                              {mintingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'KLAIM SEKARANG'}
                            </button>
                            {mintingStatus && (
                              <div className="flex items-center justify-center gap-3 text-[10px] font-bold text-amber-400 animate-pulse">
                                <Clock className="w-3 h-3" /> {mintingStatus}
                              </div>
                            )}
                            {mintingError && (
                              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
                                <AlertCircle className="w-4 h-4 text-red-400" />
                                <p className="text-[10px] text-red-200">{mintingError}</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-[10px] text-amber-200/70 italic bg-amber-500/10 p-4 rounded-xl border border-amber-500/20">
                            * Tambahkan alamat wallet di menu <b>Akun</b> untuk melakukan klaim NFT.
                          </p>
                        )}
                      </div>
                    )}

                    {/* QR Code Section */}
                    <div className="bg-stone-100 p-8 rounded-[2rem] flex items-center justify-between gap-6">
                       <div className="space-y-2">
                          <h4 className="font-serif italic text-lg">Verification QR</h4>
                          <p className="text-[10px] text-stone-500 max-w-[160px] leading-relaxed">Pindai untuk memverifikasi keaslian dokumen ini melalui portal resmi.</p>
                       </div>
                       <div className="p-3 bg-white rounded-2xl shadow-inner border border-stone-200">
                          <QRCodeSVG 
                            value={`${window.location.origin}/?certId=${selectedCert.id}`}
                            size={90}
                            level="H"
                          />
                       </div>
                    </div>

                    <a 
                      href={`/?certId=${selectedCert.id}`}
                      target="_blank"
                      className="w-full py-5 border-2 border-stone-200 rounded-[1.5rem] flex items-center justify-center gap-3 text-stone-900 font-black text-[10px] uppercase tracking-widest hover:bg-stone-50 transition-all"
                    >
                      <QrCode className="w-4 h-4" /> Buka Halaman Verifikasi Publik
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