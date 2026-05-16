import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
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
  const [debugInfo, setDebugInfo] = useState('');

  const [mintingLoading, setMintingLoading] = useState(false);
  const [mintingStatus, setMintingStatus] = useState<string | null>(null);
  const [mintingError, setMintingError] = useState<string | null>(null);

  const fetchCertificates = async () => {
    if (!user?.email) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const emailLower = user.email.toLowerCase().trim();
      console.log('=== FETCH CERTIFICATES ===');
      console.log('User email:', emailLower);
      console.log('Profile wallet:', profile?.walletAddress);

      const certsCollection = collection(db, 'certificates');
      
      // 1. Query berdasarkan email (tanpa orderBy)
      const emailQuery = query(certsCollection, where('studentEmail', '==', emailLower));
      const emailSnapshot = await getDocs(emailQuery);
      let fetchedData = emailSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Certificate));
      console.log(`Found by email: ${fetchedData.length}`);

      let walletAddress: string | null = null;
      if (user.email.startsWith('wallet_')) {
        const extracted = user.email.split('_')[1]?.split('@')[0];
        if (extracted && ethers.isAddress(extracted)) {
          walletAddress = extracted.toLowerCase();
        }
      } else if (profile?.walletAddress) {
        walletAddress = profile.walletAddress.toLowerCase();
      }

      if (walletAddress) {
        const walletQuery = query(certsCollection, where('studentWalletAddress', '==', walletAddress));
        const walletSnapshot = await getDocs(walletQuery);
        const walletCerts = walletSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Certificate));
        console.log(`Found by wallet: ${walletCerts.length}`);
        
        walletCerts.forEach(wc => {
          if (!fetchedData.find(fc => fc.id === wc.id)) {
            fetchedData.push(wc);
          }
        });
      }

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
    // ... (sama seperti kode sebelumnya, tidak diubah)
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
      if (!adminWallet) throw new Error('Sistem belum dikonfigurasi untuk minting mandiri.');
      const contract = getContract(adminWallet);
      const numericTokenId = Math.floor(Date.now() / 1000);
      const tokenURI = cert.ipfsHash ? `ipfs://${cert.ipfsHash}` : '';
      setMintingStatus('Cetak Token di Blockchain Sepolia...');
      const tx = await contract.mintIjazah(profile.walletAddress, numericTokenId, tokenURI);
      setMintingStatus(`Menunggu Konfirmasi...`);
      await tx.wait();
      setMintingStatus('Memperbarui Database...');
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
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-serif font-medium text-stone-900 italic">Dashboard Mahasiswa</h2>
          <p className="text-stone-500 text-sm mt-1">Kelola dan bagikan pencapaian digital Anda</p>
          {debugInfo && <p className="text-xs text-stone-400 mt-2 font-mono">{debugInfo}</p>}
        </div>
        <div className="flex gap-2 bg-stone-100 p-1 rounded-xl">
          <button onClick={() => setActiveTab('certificates')} className={`px-4 py-2 rounded-lg text-xs font-bold ${activeTab === 'certificates' ? 'bg-white shadow-sm' : 'text-stone-400'}`}>Sertifikat</button>
          <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 rounded-lg text-xs font-bold ${activeTab === 'settings' ? 'bg-white shadow-sm' : 'text-stone-400'}`}>Akun</button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'certificates' ? (
          <motion.div key="certs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {certificates.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border border-stone-200">
                <Award className="w-16 h-16 text-stone-200 mx-auto mb-4" />
                <h3 className="text-xl font-serif text-stone-900 mb-2">Belum ada sertifikat</h3>
                <p className="text-stone-500 text-sm max-w-xs mx-auto">Sertifikat digital Anda akan muncul di sini setelah diterbitkan oleh institusi.</p>
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
                  <motion.div key={cert.id} layoutId={cert.id} onClick={() => setSelectedCert(cert)} className="group cursor-pointer bg-white rounded-2xl border border-stone-200 overflow-hidden hover:shadow-xl transition-all">
                    <div className="aspect-[4/3] bg-stone-100 relative overflow-hidden">
                      <img src={cert.imageUrl} alt={cert.studentName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-stone-900/0 group-hover:bg-stone-900/40 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 bg-white text-stone-900 px-4 py-2 rounded-full text-xs font-bold">Lihat Detail</div>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-serif italic text-lg text-stone-900">Ijazah Universitas</h4>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded ${cert.txHash ? 'bg-stone-900 text-white' : 'bg-amber-100 text-amber-700'}`}>
                          {cert.txHash ? 'NFT' : 'DIGITAL'}
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-stone-500">
                        <div className="flex items-center gap-2"><Calendar className="w-3 h-3" /> Diterbitkan {new Date(cert.issueDate).toLocaleDateString('id-ID')}</div>
                        <div className="flex items-center gap-2"><ShieldCheck className="w-3 h-3" /> {cert.txHash ? `ID: ${cert.tokenId}` : 'Terverifikasi Database'}</div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-4xl">
            <AccountSettings />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedCert && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedCert(null)} className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-40" />
            <motion.div layoutId={selectedCert.id} className="fixed inset-x-4 top-[10%] bottom-[10%] mx-auto max-w-4xl bg-white rounded-3xl shadow-2xl z-50 overflow-hidden flex flex-col md:flex-row">
              <div className="md:w-1/2 h-64 md:h-full bg-stone-100 relative">
                <img src={selectedCert.imageUrl} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 p-8 md:p-12 overflow-y-auto">
                <div className="text-center">
                  <button onClick={() => setSelectedCert(null)} className="text-stone-400 text-sm">Tutup</button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}