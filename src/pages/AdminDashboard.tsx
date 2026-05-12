import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { uploadToIPFS, uploadJSONToIPFS } from '../lib/pinata';
import { getFunctions, httpsCallable } from 'firebase/functions'; // Import Functions SDK
import { 
  Upload, FileUp, Database, CheckCircle2, 
  Loader2, AlertCircle, X, Shield, Settings 
} from 'lucide-react';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'motion/react';
import { ethers } from 'ethers';
import AccountSettings from '../components/AccountSettings';

interface BatchItem {
  studentEmail: string;
  studentName: string;
  certificateNumber: string;
  imageFileName: string;
  studentWalletAddress: string;
}

// Inisialisasi Cloud Function
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
    addLog('Memulai penerbitan ijazah tunggal...');

    try {
      // 1. Upload Gambar ke IPFS
      addLog('Mengunggah ijazah ke IPFS...');
      const pinataResult = await uploadToIPFS(singleImage, singleImage.name);
      const imageUrl = `https://gateway.pinata.cloud/ipfs/${pinataResult.IpfsHash}`;
      
      // 2. Buat Metadata Ijazah Universitas
      addLog('Menyusun metadata universitas...');
      const metadata = {
        name: `Ijazah Universitas - ${singleData.studentName}`,
        description: `Dokumen Ijazah Digital Resmi yang diamankan dengan Protokol Blockchain`,
        image: imageUrl,
        attributes: [
          { trait_type: "Nama Mahasiswa", value: singleData.studentName },
          { trait_type: "Nomor Ijazah", value: singleData.certificateNumber },
          { trait_type: "Lembaga Penerbit", value: "UPN 'Veteran' Yogyakarta" }
        ]
      };
      const metaResult = await uploadJSONToIPFS(metadata);
      const tokenURI = `ipfs://${metaResult.IpfsHash}`;

      // 3. Minting via Backend (Aman)
      let txHash = '';
      const walletAddress = singleData.studentWalletAddress.trim();
      const isValidRecipient = walletAddress && ethers.isAddress(walletAddress);

      if (isValidRecipient) {
        addLog('Meminta Backend (Cloud Function) untuk minting NFT...');
        try {
          const result = await mintIjazahCloud({
            recipientAddress: walletAddress,
            ipfsUri: tokenURI
          });
          
          const response = result.data as { success: boolean; hash: string };
          txHash = response.hash;
          addLog(`Minting Berhasil! Hash: ${txHash}`);
        } catch (mintErr: any) {
          addLog(`Blockchain Fail (Fungsi Berjalan di DB): ${mintErr.message}`);
        }
      } else {
        addLog('Alamat Wallet tidak valid atau kosong. Melewati minting (Mode Database).');
      }

      // 4. Catat di Firestore
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

      addLog('Ijazah berhasil dicatat di sistem.');
      setStatus('done');
      setProgress(100);
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
    addLog('Memulai pemrosesan batch ijazah...');

    try {
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(zipFile);
      let completedCount = 0;

      for (const item of csvData) {
        try {
          addLog(`Memproses: ${item.studentName}...`);
        
          const imageFile = zipContent.file(item.imageFileName.trim());
          if (!imageFile) {
            addLog(`Gagal: File ${item.imageFileName} tidak ditemukan di ZIP.`);
            continue;
          }

          const imageBlob = await imageFile.async('blob');
          const pinataResult = await uploadToIPFS(imageBlob, item.imageFileName);
          const imageUrl = `https://gateway.pinata.cloud/ipfs/${pinataResult.IpfsHash}`;

          const metadata = {
            name: `Ijazah - ${item.studentName}`,
            image: imageUrl,
            attributes: [
              { trait_type: "Nama", value: item.studentName },
              { trait_type: "Nomor", value: item.certificateNumber }
            ]
          };

          const metaResult = await uploadJSONToIPFS(metadata);
          const tokenURI = `ipfs://${metaResult.IpfsHash}`;

          let txHash = '';
          const rawRecipient = (item.studentWalletAddress || '').trim();
          
          if (rawRecipient && ethers.isAddress(rawRecipient)) {
            const result = await mintIjazahCloud({
              recipientAddress: rawRecipient,
              ipfsUri: tokenURI
            });
            txHash = (result.data as any).hash;
          }

          await addDoc(collection(db, 'certificates'), {
            studentEmail: item.studentEmail.toLowerCase().trim(),
            studentName: item.studentName,
            certificateNumber: item.certificateNumber,
            issueDate: new Date().toISOString(),
            imageUrl: imageUrl,
            txHash: txHash || null,
            createdBy: user.uid,
            mintedAt: serverTimestamp(),
            isDigitalOnly: !txHash
          });

          completedCount++;
          setProgress(Math.round((completedCount / csvData.length) * 100));
        } catch (itemErr: any) {
          addLog(`Gagal memproses ${item.studentName}: ${itemErr.message}`);
        }
      }

      setStatus('done');
      addLog('Pemrosesan batch selesai.');
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
        const normalizedData = results.data.map((row: any) => ({
          studentEmail: row.studentEmail || row.email || '',
          studentName: row.studentName || row.name || '',
          certificateNumber: row.certificateNumber || row.number || '',
          imageFileName: row.imageFileName || row.image || '',
          studentWalletAddress: row.studentWalletAddress || row.wallet || ''
        }));
        setCsvData(normalizedData as BatchItem[]);
        addLog(`${results.data.length} data mahasiswa dimuat.`);
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-serif font-medium text-stone-900 italic">Management Dashboard</h2>
          <p className="text-stone-500 text-sm mt-1">Sistem Penerbitan Ijazah Digital Universitas</p>
        </div>
        <div className="flex items-center gap-2 bg-stone-100 p-1 rounded-xl border border-stone-200">
           <button onClick={() => setActiveMode('single')} className={`px-4 py-2 rounded-lg text-xs font-bold ${activeMode === 'single' ? 'bg-white shadow-sm' : 'text-stone-400'}`}>Single</button>
           <button onClick={() => setActiveMode('batch')} className={`px-4 py-2 rounded-lg text-xs font-bold ${activeMode === 'batch' ? 'bg-white shadow-sm' : 'text-stone-400'}`}>Batch</button>
           <button onClick={() => setActiveMode('settings')} className={`px-4 py-2 rounded-lg text-xs font-bold ${activeMode === 'settings' ? 'bg-white shadow-sm' : 'text-stone-400'}`}>Account</button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeMode === 'settings' ? (
          <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <AccountSettings />
          </motion.div>
        ) : (
          <motion.div key="minting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {activeMode === 'single' ? (
                <div className="p-8 bg-white rounded-3xl border border-stone-200 shadow-sm">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-stone-900 flex items-center justify-center text-white"><FileUp /></div>
                    <div>
                      <h3 className="font-bold text-stone-900">Input Data Ijazah</h3>
                      <p className="text-xs text-stone-400">Penerbitan ijazah per mahasiswa</p>
                    </div>
                  </div>

                  <form onSubmit={handleSingleUpload} className="grid md:grid-cols-2 gap-4">
                    <input type="text" placeholder="Nama Lengkap Mahasiswa" className="input-style" value={singleData.studentName} onChange={e => setSingleData({...singleData, studentName: e.target.value})} required />
                    <input type="email" placeholder="Email Student" className="input-style" value={singleData.studentEmail} onChange={e => setSingleData({...singleData, studentEmail: e.target.value})} required />
                    <input type="text" placeholder="Nomor Ijazah" className="input-style md:col-span-2" value={singleData.certificateNumber} onChange={e => setSingleData({...singleData, certificateNumber: e.target.value})} required />
                    <input type="text" placeholder="Wallet Address (0x...)" className="input-style md:col-span-2 font-mono text-xs" value={singleData.studentWalletAddress} onChange={e => setSingleData({...singleData, studentWalletAddress: e.target.value})} />
                    
                    <div className="md:col-span-2 p-6 border-2 border-dashed rounded-2xl flex flex-col items-center bg-stone-50">
                      <input type="file" onChange={e => setSingleImage(e.target.files?.[0] || null)} className="hidden" id="file-up" />
                      <label htmlFor="file-up" className="cursor-pointer text-xs font-bold text-stone-600">
                        {singleImage ? singleImage.name : 'Pilih Gambar Ijazah (Scanned)'}
                      </label>
                    </div>
                    <button type="submit" disabled={isProcessing} className="md:col-span-2 py-4 bg-stone-900 text-white rounded-2xl font-bold flex justify-center items-center gap-2">
                      {isProcessing ? <Loader2 className="animate-spin" /> : 'TERBITKAN IJAZAH'}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-8 bg-white rounded-3xl border border-stone-200 shadow-sm">
                    <input type="file" accept=".csv" onChange={handleCsvUpload} className="block w-full text-sm text-stone-500 mb-4" />
                    <input type="file" accept=".zip" onChange={e => setZipFile(e.target.files?.[0] || null)} className="block w-full text-sm text-stone-500" />
                    <button onClick={startBatchMinting} disabled={isProcessing || !zipFile} className="w-full mt-6 py-4 bg-stone-900 text-white rounded-xl font-bold">
                      {isProcessing ? 'SEDANG MEMPROSES BATCH...' : `START BATCH MINTING (${csvData.length})`}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-6">
              <div className="bg-[#121212] text-stone-400 p-6 rounded-3xl font-mono text-[10px] h-[450px] overflow-y-auto border border-stone-800 shadow-2xl">
                <p className="text-stone-600 border-b border-stone-800 pb-2 mb-4 uppercase tracking-widest">System Engine Logs</p>
                {logs.map((log, i) => <div key={i} className="mb-1">[{i+1}] {log}</div>)}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .input-style {
          @apply w-full px-4 py-3 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all;
        }
      `}</style>
    </div>
  );
}