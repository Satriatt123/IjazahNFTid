import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { uploadToIPFS, uploadJSONToIPFS } from '../lib/pinata';
import { 
  Upload, FileUp, Database, CheckCircle2, Loader2, 
  AlertCircle, X, Shield, Settings, Terminal, Info 
} from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
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

// Inisialisasi Backend Functions
const functions = getFunctions();
const mintIjazahCloud = httpsCallable(functions, 'mintIjazah');

export default function AdminDashboard() {
  const { user } = useAuth();
  const [activeMode, setActiveMode] = useState<'single' | 'batch' | 'settings'>('single');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');

  // State untuk Single Mode
  const [singleData, setSingleData] = useState<BatchItem>({
    studentEmail: '', studentName: '', certificateNumber: '',
    courseName: '', imageFileName: '', studentWalletAddress: ''
  });
  const [singleImage, setSingleImage] = useState<File | null>(null);

  // State untuk Batch Mode
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<BatchItem[]>([]);

  const addLog = (msg: string) => {
    setLogs(prev => [`${new Date().toLocaleTimeString()}: ${msg}`, ...prev.slice(0, 49)]);
  };

  // --- HANDLER: SINGLE UPLOAD ---
  const handleSingleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleImage || !user) return;

    setIsProcessing(true);
    setStatus('processing');
    setProgress(0);
    setLogs([]);
    addLog('🚀 Menyiapkan penerbitan sertifikat tunggal...');

    try {
      addLog('📦 Mengunggah gambar ke IPFS...');
      const pinataResult = await uploadToIPFS(singleImage, singleImage.name);
      const imageUrl = `https://gateway.pinata.cloud/ipfs/${pinataResult.IpfsHash}`;
      
      addLog('📝 Menyusun metadata sertifikat...');
      const metadata = {
        name: `${singleData.courseName} - ${singleData.studentName}`,
        description: `Official Digital Certificate issued by SADEWA`,
        image: imageUrl,
        attributes: [
          { trait_type: "Student", value: singleData.studentName },
          { trait_type: "Certificate No", value: singleData.certificateNumber }
        ]
      };
      const metaResult = await uploadJSONToIPFS(metadata);
      const tokenURI = `ipfs://${metaResult.IpfsHash}`;

      let txHash = '';
      const walletAddr = singleData.studentWalletAddress.trim();
      
      if (walletAddr && ethers.isAddress(walletAddr)) {
        addLog('🔐 Memanggil Secure Cloud Function untuk minting...');
        const result = await mintIjazahCloud({ recipientAddress: walletAddr, ipfsUri: tokenURI });
        const response = result.data as { success: boolean; hash: string };
        txHash = response.hash;
        addLog(`✅ Blockchain Minted: ${txHash.substring(0, 15)}...`);
      } else {
        addLog('ℹ️ Wallet tidak valid/kosong. Melewati tahap Blockchain.');
      }

      await addDoc(collection(db, 'certificates'), {
        ...singleData,
        issueDate: new Date().toISOString(),
        imageUrl,
        ipfsHash: pinataResult.IpfsHash,
        txHash: txHash || null,
        createdBy: user.uid,
        mintedAt: serverTimestamp(),
      });

      setStatus('done');
      setProgress(100);
      addLog('✨ Seluruh proses berhasil diselesaikan.');
    } catch (err: any) {
      addLog(`❌ Error: ${err.message}`);
      setStatus('error');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- HANDLER: BATCH PROCESSING ---
  const startBatchMinting = async () => {
    if (!zipFile || csvData.length === 0 || !user) return;
    setIsProcessing(true);
    setStatus('processing');
    setLogs([]);
    addLog(`📦 Memulai pemrosesan batch (${csvData.length} data)...`);

    try {
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(zipFile);
      let count = 0;

      for (const item of csvData) {
        addLog(`逐 Memproses: ${item.studentName}`);
        const imgFile = zipContent.file(item.imageFileName.trim());
        
        if (!imgFile) {
          addLog(`⚠️ Gambar ${item.imageFileName} tidak ditemukan di ZIP. Skip.`);
          continue;
        }

        const imgBlob = await imgFile.async('blob');
        const pinRes = await uploadToIPFS(imgBlob, item.imageFileName);
        const metaRes = await uploadJSONToIPFS({
          name: item.studentName,
          image: `https://gateway.pinata.cloud/ipfs/${pinRes.IpfsHash}`
        });

        let txHash = '';
        if (ethers.isAddress(item.studentWalletAddress.trim())) {
          const result = await mintIjazahCloud({
            recipientAddress: item.studentWalletAddress.trim(),
            ipfsUri: `ipfs://${metaRes.IpfsHash}`
          });
          txHash = (result.data as any).hash;
        }

        await addDoc(collection(db, 'certificates'), {
          ...item,
          imageUrl: `https://gateway.pinata.cloud/ipfs/${pinRes.IpfsHash}`,
          txHash: txHash || null,
          createdBy: user.uid,
          mintedAt: serverTimestamp()
        });

        count++;
        setProgress(Math.round((count / csvData.length) * 100));
      }
      setStatus('done');
      addLog(`✅ Batch complete! ${count} ijazah berhasil diproses.`);
    } catch (err: any) {
      addLog(`❌ Critical: ${err.message}`);
      setStatus('error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-stone-200 pb-8">
        <div>
          <span className="text-[10px] font-bold tracking-[0.2em] text-stone-400 uppercase">Administrator Area</span>
          <h2 className="text-4xl font-serif font-medium text-stone-900 italic mt-1">Management Dashboard</h2>
          <p className="text-stone-500 text-sm mt-2 flex items-center gap-2">
            <Shield className="w-4 h-4 text-stone-400" /> Secure Cloud Backend Enabled
          </p>
        </div>
        
        <div className="flex bg-stone-100 p-1.5 rounded-2xl border border-stone-200">
          {[
            { id: 'single', icon: FileUp, label: 'Single' },
            { id: 'batch', icon: Database, label: 'Batch' },
            { id: 'settings', icon: Settings, label: 'Account' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveMode(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeMode === tab.id ? 'bg-white text-stone-900 shadow-sm ring-1 ring-stone-200' : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeMode === 'settings' ? (
          <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <AccountSettings />
          </motion.div>
        ) : (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid lg:grid-cols-12 gap-8">
            
            {/* Left Column: Forms */}
            <div className="lg:col-span-8 space-y-6">
              {activeMode === 'single' ? (
                <div className="bg-white rounded-[2rem] p-10 border border-stone-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                    <FileUp className="w-40 h-40" />
                  </div>
                  
                  <form onSubmit={handleSingleUpload} className="space-y-8">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="label-style">Nama Mahasiswa</label>
                        <input type="text" required className="input-style" value={singleData.studentName} onChange={e => setSingleData({...singleData, studentName: e.target.value})} placeholder="Full Name" />
                      </div>
                      <div className="space-y-2">
                        <label className="label-style">Email Institusi</label>
                        <input type="email" required className="input-style" value={singleData.studentEmail} onChange={e => setSingleData({...singleData, studentEmail: e.target.value})} placeholder="name@univ.ac.id" />
                      </div>
                      <div className="space-y-2">
                        <label className="label-style">Nomor Sertifikat</label>
                        <input type="text" required className="input-style" value={singleData.certificateNumber} onChange={e => setSingleData({...singleData, certificateNumber: e.target.value})} placeholder="REG/2026/001" />
                      </div>
                      <div className="space-y-2">
                        <label className="label-style">Nama Mata Kuliah / Event</label>
                        <input type="text" required className="input-style" value={singleData.courseName} onChange={e => setSingleData({...singleData, courseName: e.target.value})} placeholder="Course Name" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="label-style">Recipient Wallet Address (Polygon/Sepolia)</label>
                      <input type="text" className="input-style font-mono text-[11px]" value={singleData.studentWalletAddress} onChange={e => setSingleData({...singleData, studentWalletAddress: e.target.value})} placeholder="0x..." />
                      <p className="text-[10px] text-stone-400 flex items-center gap-1.5"><Info className="w-3 h-3" /> Jika kosong, hanya akan dicatat di database digital.</p>
                    </div>

                    <div className="group relative">
                      <input type="file" accept="image/*" required className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={e => setSingleImage(e.target.files?.[0] || null)} />
                      <div className={`border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-4 transition-all ${singleImage ? 'bg-stone-900 border-stone-900' : 'bg-stone-50 border-stone-200 group-hover:border-stone-400'}`}>
                        <Upload className={`w-8 h-8 ${singleImage ? 'text-white' : 'text-stone-300'}`} />
                        <span className={`text-xs font-bold ${singleImage ? 'text-white' : 'text-stone-500'}`}>{singleImage ? singleImage.name : 'Click or Drop Certificate Image'}</span>
                      </div>
                    </div>

                    <button type="submit" disabled={isProcessing} className="w-full py-5 bg-stone-900 text-white rounded-2xl font-bold tracking-widest text-xs hover:bg-black disabled:opacity-50 transition-all flex items-center justify-center gap-3 shadow-xl shadow-stone-200">
                      {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'GENERATE & MINT CERTIFICATE'}
                    </button>
                  </form>
                </div>
              ) : (
                /* Batch Minting UI */
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white p-8 rounded-[2rem] border border-stone-200 shadow-sm space-y-6">
                    <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center text-stone-900"><Database className="w-6 h-6" /></div>
                    <h3 className="font-bold text-stone-900 tracking-tight">Records Configuration</h3>
                    <p className="text-xs text-stone-500 leading-relaxed">Unggah file CSV dengan kolom: studentName, studentEmail, certificateNumber, courseName, imageFileName, wallet.</p>
                    <input type="file" accept=".csv" onChange={(e) => {
                       const file = e.target.files?.[0];
                       if (file) Papa.parse(file, { header: true, complete: (res) => { setCsvData(res.data as any); addLog('CSV Loaded Successfully'); }});
                    }} className="text-[10px] font-mono block w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-bold file:bg-stone-900 file:text-white" />
                  </div>

                  <div className="bg-white p-8 rounded-[2rem] border border-stone-200 shadow-sm space-y-6">
                    <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center text-stone-900"><Upload className="w-6 h-6" /></div>
                    <h3 className="font-bold text-stone-900 tracking-tight">Assets Archive</h3>
                    <p className="text-xs text-stone-500 leading-relaxed">Unggah file ZIP berisi semua gambar sertifikat sesuai dengan nama file yang terdaftar di dalam CSV.</p>
                    <input type="file" accept=".zip" onChange={e => setZipFile(e.target.files?.[0] || null)} className="text-[10px] font-mono block w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-bold file:bg-stone-900 file:text-white" />
                  </div>

                  <button onClick={startBatchMinting} disabled={isProcessing || !zipFile} className="md:col-span-2 py-5 bg-stone-900 text-white rounded-2xl font-bold tracking-widest text-xs shadow-xl disabled:opacity-50">
                    {isProcessing ? 'PROCESSING BATCH...' : `START MINTING ${csvData.length} CERTIFICATES`}
                  </button>
                </div>
              )}
            </div>

            {/* Right Column: Logs & Status */}
            <div className="lg:col-span-4 space-y-6">
              <AnimatePresence>
                {status !== 'idle' && (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className={`p-6 rounded-[2rem] border ${
                    status === 'processing' ? 'bg-stone-900 text-white border-stone-800' :
                    status === 'done' ? 'bg-stone-50 text-stone-900 border-stone-200' : 'bg-red-50 text-red-900'
                  }`}>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Engine Status</span>
                      <X className="w-4 h-4 cursor-pointer opacity-40 hover:opacity-100" onClick={() => setStatus('idle')} />
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {status === 'processing' ? <Loader2 className="w-8 h-8 animate-spin opacity-20" /> : <CheckCircle2 className="w-8 h-8 text-stone-900" />}
                      <div>
                        <h4 className="font-bold text-sm">{status === 'processing' ? 'Processing...' : status === 'done' ? 'Success' : 'Failed'}</h4>
                        <p className="text-[10px] opacity-60 uppercase mt-0.5">{progress}% Completed</p>
                      </div>
                    </div>

                    {status === 'processing' && (
                      <div className="mt-6 h-1 bg-white/10 rounded-full overflow-hidden">
                        <motion.div animate={{ width: `${progress}%` }} className="h-full bg-white" />
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="bg-[#121212] rounded-[2rem] p-8 border border-stone-800 shadow-2xl h-[580px] flex flex-col relative overflow-hidden">
                <div className="flex items-center gap-2 text-stone-500 mb-6 border-b border-stone-800 pb-4">
                  <Terminal className="w-4 h-4" />
                  <span className="text-[10px] font-bold tracking-widest uppercase">System Log Console</span>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                  {logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-[10px] text-stone-700 font-mono italic">Waiting for process initialization...</p>
                    </div>
                  ) : (
                    logs.map((log, i) => (
                      <motion.div initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} key={i} className="font-mono text-[10px] leading-relaxed flex gap-3">
                        <span className="text-stone-700">[{logs.length - i}]</span>
                        <span className={log.includes('❌') ? 'text-red-500' : log.includes('✅') ? 'text-stone-100' : 'text-stone-500'}>{log}</span>
                      </motion.div>
                    ))
                  )}
                </div>
                
                <div className="absolute bottom-0 left-0 w-full h-20 bg-gradient-to-t from-[#121212] to-transparent pointer-events-none" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .input-style {
          @apply w-full px-5 py-3.5 bg-stone-50 border border-stone-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:bg-white transition-all text-sm text-stone-900 placeholder:text-stone-300;
        }
        .label-style {
          @apply text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #262626;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}