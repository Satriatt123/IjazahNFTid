import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { uploadToIPFS, uploadJSONToIPFS } from '../lib/pinata';
import { Upload, FileUp, Database, CheckCircle2, Loader2, AlertCircle, X, Shield } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions'; // Import baru
import JSZip from 'jszip';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'motion/react';
import { ethers } from 'ethers';
import AccountSettings from '../components/AccountSettings';

interface BatchItem {
  studentEmail: string;
  studentName: string;
  certificateNumber: string;
  courseName: string;
  imageFileName: string;
  studentWalletAddress: string;
}

// Inisialisasi Firebase Functions
const functions = getFunctions();
const mintIjazahCloud = httpsCallable(functions, 'mintIjazah');

export default function AdminDashboard() {
  const { user } = useAuth();
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<BatchItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');

  const [activeMode, setActiveMode] = useState<'single' | 'batch' | 'settings'>('single');
  const [singleData, setSingleData] = useState<BatchItem>({
    studentEmail: '',
    studentName: '',
    certificateNumber: '',
    courseName: '',
    imageFileName: '',
    studentWalletAddress: ''
  });
  const [singleImage, setSingleImage] = useState<File | null>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  // --- HANDLER: SINGLE UPLOAD ---
  const handleSingleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleImage || !user) return;

    setIsProcessing(true);
    setStatus('processing');
    setProgress(0);
    setLogs([]);
    addLog('Memulai penerbitan sertifikat tunggal...');

    try {
      // 1. Upload ke IPFS via Pinata
      addLog('Mengunggah gambar ke IPFS...');
      const pinataResult = await uploadToIPFS(singleImage, singleImage.name);
      const imageUrl = `https://gateway.pinata.cloud/ipfs/${pinataResult.IpfsHash}`;
      
      // 2. Upload Metadata ke IPFS
      addLog('Mengunggah metadata JSON...');
      const metadata = {
        name: `${singleData.courseName} - ${singleData.studentName}`,
        description: `Sertifikat Digital SADEWA untuk ${singleData.studentName}`,
        image: imageUrl,
        attributes: [
          { trait_type: "Student", value: singleData.studentName },
          { trait_type: "Certificate Number", value: singleData.certificateNumber },
          { trait_type: "Course", value: singleData.courseName }
        ]
      };
      const metaResult = await uploadJSONToIPFS(metadata);
      const tokenURI = `ipfs://${metaResult.IpfsHash}`;

      // 3. Minting via Firebase Cloud Function (Secure)
      let txHash = '';
      const walletAddress = singleData.studentWalletAddress.trim();
      const isValidRecipient = walletAddress && ethers.isAddress(walletAddress);

      if (isValidRecipient) {
        addLog('Meminta backend untuk minting NFT (Aman)...');
        try {
          const result = await mintIjazahCloud({
            recipientAddress: walletAddress,
            ipfsUri: tokenURI
          });
          
          const response = result.data as { success: boolean; hash: string };
          txHash = response.hash;
          addLog(`Minting Berhasil! Hash: ${txHash}`);
        } catch (mintErr: any) {
          addLog(`Minting Gagal: ${mintErr.message}`);
        }
      } else {
        addLog('Alamat Wallet tidak valid. Melewati proses blockchain.');
      }

      // 4. Simpan ke Firestore
      await addDoc(collection(db, 'certificates'), {
        ...singleData,
        issueDate: new Date().toISOString(),
        imageUrl,
        ipfsHash: pinataResult.IpfsHash,
        txHash: txHash || null,
        createdBy: user.uid,
        mintedAt: serverTimestamp(),
        isDigitalOnly: !txHash
      });

      setStatus('done');
      setProgress(100);
      addLog('Sertifikat berhasil diterbitkan!');
    } catch (err: any) {
      addLog(`Error: ${err.message}`);
      setStatus('error');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- HANDLER: BATCH MINTING ---
  const startBatchMinting = async () => {
    if (!zipFile || csvData.length === 0 || !user) return;

    setIsProcessing(true);
    setStatus('processing');
    setProgress(0);
    setLogs([]);
    addLog('Memulai Batch Processing (IPFS + Blockchain)...');

    try {
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(zipFile);
      let completedCount = 0;

      for (const item of csvData) {
        try {
          addLog(`Memproses: ${item.studentName}...`);
        
          const imageFile = zipContent.file(item.imageFileName.trim());
          if (!imageFile) {
            addLog(`Gagal: Gambar ${item.imageFileName} tidak ada di ZIP.`);
            continue;
          }

          const imageBlob = await imageFile.async('blob');
          const pinataResult = await uploadToIPFS(imageBlob, item.imageFileName);
          const imageUrl = `https://gateway.pinata.cloud/ipfs/${pinataResult.IpfsHash}`;

          const metadata = {
            name: `${item.courseName} - ${item.studentName}`,
            image: imageUrl,
            attributes: [
              { trait_type: "Student", value: item.studentName },
              { trait_type: "Number", value: item.certificateNumber }
            ]
          };

          const metaResult = await uploadJSONToIPFS(metadata);
          const tokenURI = `ipfs://${metaResult.IpfsHash}`;

          // Minting via Backend
          let txHash = '';
          const rawRecipient = item.studentWalletAddress.trim();
          if (rawRecipient && ethers.isAddress(rawRecipient)) {
            addLog(`Minting NFT untuk ${item.studentName}...`);
            const result = await mintIjazahCloud({
              recipientAddress: rawRecipient,
              ipfsUri: tokenURI
            });
            const response = result.data as { success: boolean; hash: string };
            txHash = response.hash;
          }

          // Simpan Firestore
          await addDoc(collection(db, 'certificates'), {
            ...item,
            issueDate: new Date().toISOString(),
            imageUrl,
            txHash: txHash || null,
            createdBy: user.uid,
            mintedAt: serverTimestamp(),
            isDigitalOnly: !txHash
          });

          completedCount++;
          setProgress(Math.round((completedCount / csvData.length) * 100));
        } catch (itemErr: any) {
          addLog(`Error pada ${item.studentName}: ${itemErr.message}`);
        }
      }

      addLog(`Proses Selesai. ${completedCount} sertifikat diterbitkan.`);
      setStatus('done');
    } catch (err: any) {
      addLog(`Kritis: ${err.message}`);
      setStatus('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const normalized = results.data.map((row: any) => ({
          studentEmail: row.studentEmail || '',
          studentName: row.studentName || '',
          certificateNumber: row.certificateNumber || '',
          courseName: row.courseName || '',
          imageFileName: row.imageFileName || '',
          studentWalletAddress: row.studentWalletAddress || row.wallet || ''
        }));
        setCsvData(normalized as BatchItem[]);
        addLog(`${results.data.length} data mahasiswa dimuat dari CSV.`);
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-serif font-medium text-stone-900 italic">Admin Dashboard</h2>
          <p className="text-stone-500 text-sm mt-1">Sistem Penerbitan Ijazah Digital Aman</p>
        </div>
        <div className="flex items-center gap-2 bg-stone-100 p-1 rounded-xl border border-stone-200">
           <button onClick={() => setActiveMode('single')} className={`px-4 py-2 rounded-lg text-xs font-bold ${activeMode === 'single' ? 'bg-white shadow-sm' : 'text-stone-400'}`}>Single</button>
           <button onClick={() => setActiveMode('batch')} className={`px-4 py-2 rounded-lg text-xs font-bold ${activeMode === 'batch' ? 'bg-white shadow-sm' : 'text-stone-400'}`}>Batch</button>
           <button onClick={() => setActiveMode('settings')} className={`px-4 py-2 rounded-lg text-xs font-bold ${activeMode === 'settings' ? 'bg-white shadow-sm' : 'text-stone-400'}`}>Account</button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeMode === 'settings' ? (
          <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AccountSettings />
          </motion.div>
        ) : (
          <motion.div key="minting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {activeMode === 'single' ? (
                <div className="p-8 bg-white rounded-3xl border border-stone-200 shadow-sm">
                  <form onSubmit={handleSingleUpload} className="grid gap-4">
                    <input type="text" placeholder="Nama Mahasiswa" className="input-style" value={singleData.studentName} onChange={e => setSingleData({...singleData, studentName: e.target.value})} required />
                    <input type="email" placeholder="Email" className="input-style" value={singleData.studentEmail} onChange={e => setSingleData({...singleData, studentEmail: e.target.value})} required />
                    <input type="text" placeholder="Wallet Address (0x...)" className="input-style font-mono" value={singleData.studentWalletAddress} onChange={e => setSingleData({...singleData, studentWalletAddress: e.target.value})} />
                    <div className="p-6 border-2 border-dashed rounded-2xl flex flex-col items-center bg-stone-50">
                      <input type="file" onChange={e => setSingleImage(e.target.files?.[0] || null)} className="hidden" id="file-up" />
                      <label htmlFor="file-up" className="cursor-pointer text-xs font-bold text-stone-600">
                        {singleImage ? singleImage.name : 'Pilih File Gambar Sertifikat'}
                      </label>
                    </div>
                    <button type="submit" disabled={isProcessing} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex justify-center items-center gap-2">
                      {isProcessing ? <Loader2 className="animate-spin" /> : 'TERBITKAN SEKARANG'}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-6 bg-white rounded-2xl border border-stone-200">
                    <input type="file" accept=".csv" onChange={handleCsvUpload} className="mb-4 text-xs" />
                    <input type="file" accept=".zip" onChange={e => setZipFile(e.target.files?.[0] || null)} className="text-xs" />
                    <button onClick={startBatchMinting} disabled={isProcessing || !zipFile} className="w-full mt-6 py-4 bg-stone-900 text-white rounded-xl font-bold">
                      {isProcessing ? 'Memproses...' : `Terbitkan ${csvData.length} Sertifikat`}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-6">
              {status !== 'idle' && (
                <div className={`p-6 rounded-2xl border ${status === 'processing' ? 'bg-blue-900 text-white' : status === 'done' ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold uppercase">{status}</span>
                    <X className="w-4 h-4 cursor-pointer" onClick={() => setStatus('idle')} />
                  </div>
                  {status === 'processing' && <div className="w-full bg-white/20 h-1.5 rounded-full"><div className="bg-white h-full transition-all" style={{ width: `${progress}%` }} /></div>}
                </div>
              )}
              <div className="bg-stone-900 text-stone-400 p-6 rounded-3xl font-mono text-[10px] h-[400px] overflow-y-auto">
                <p className="text-stone-600 border-b border-stone-800 pb-2 mb-4">SYSTEM LOGS</p>
                {logs.map((log, i) => <div key={i} className="mb-1">[{i+1}] {log}</div>)}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .input-style {
          @apply w-full px-4 py-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all;
        }
      `}</style>
    </div>
  );
}