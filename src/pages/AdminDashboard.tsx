import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { uploadToIPFS, uploadJSONToIPFS } from '../lib/pinata';
import { getProvider, getContract, getAdminWallet } from '../lib/blockchain';
import { Upload, FileUp, Database, CheckCircle2, Loader2, AlertCircle, X, Shield, Settings } from 'lucide-react';
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
  studentWalletAddress: string; // Added for blockchain
}

export default function AdminDashboard() {
  const { user, profile } = useAuth();
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

  const walletMissing = !user || !((import.meta as any).env.VITE_PRIVATE_KEY || (import.meta as any).env.PRIVATE_KEY);
  
  const handleSingleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleImage || !user) return;

    setIsProcessing(true);
    setStatus('processing');
    setProgress(0);
    setLogs([]);
    addLog('Memulai penerbitan ijazah tunggal...');

    try {
      const provider = getProvider();
      const wallet = getAdminWallet(provider);
      if (!wallet) throw new Error('Admin wallet initialization failed.');

      const contract = getContract(wallet);

      // 1. Upload Gambar ke IPFS
      addLog('Mengunggah ijazah ke IPFS...');
      const pinataResult = await uploadToIPFS(singleImage, singleImage.name);
      const imageUrl = `https://gateway.pinata.cloud/ipfs/${pinataResult.IpfsHash}`;
      
      // 2. Buat Metadata Ijazah
      addLog('Menyusun metadata...');
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

      // 3. Minting (Blockchain)
      let txHash = '';
      let tokenId = '';
      const walletAddress = singleData.studentWalletAddress.trim();
      const isValidRecipient = walletAddress && ethers.isAddress(walletAddress);

      if (isValidRecipient) {
        addLog('Memproses Blockchain Minting (Wallet Terdeteksi)...');
        const numericTokenId = Math.floor(Date.now() / 1000);
        
        try {
          const tx = await contract.mintIjazah(walletAddress, numericTokenId, tokenURI);
          addLog(`Transaksi dikirim: ${tx.hash}`);
          await tx.wait();
          addLog('Berhasil dikonfirmasi di Blockchain!');
          txHash = tx.hash;
          tokenId = numericTokenId.toString();
        } catch (mintErr: any) {
          addLog(`Blockchain Fail (Data tetap dicatat di DB): ${mintErr.message}`);
        }
      } else {
        addLog('Wallet tidak valid/kosong. Melewati Blockchain (Model Database-Only).');
      }

      // 4. Catat di Firestore
      await addDoc(collection(db, 'certificates'), {
        ...singleData,
        issueDate: new Date().toISOString(),
        imageUrl,
        ipfsHash: pinataResult.IpfsHash,
        tokenId: tokenId || null,
        txHash: txHash || null,
        createdBy: user.uid,
        mintedAt: serverTimestamp(),
        isDigitalOnly: !txHash
      });

      addLog(txHash ? 'Ijazah + NFT berhasil diterbitkan!' : 'Ijazah Digital (Tanpa NFT) berhasil diterbitkan!');
      setStatus('done');
      setProgress(100);
    } catch (err: any) {
      addLog(`Error: ${err.message}`);
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
      transformHeader: (header) => header.trim(), // Normalize headers
      complete: (results) => {
        // Map data to ensure field names match our interface regardless of CSV case
        const normalizedData = results.data.map((row: any) => ({
          studentEmail: row.studentEmail || row.email || '',
          studentName: row.studentName || row.name || '',
          certificateNumber: row.certificateNumber || row.number || '',
          imageFileName: row.imageFileName || row.image || '',
          studentWalletAddress: row.studentWalletAddress || row.wallet || row.address || ''
        }));
        setCsvData(normalizedData as BatchItem[]);
        addLog(`Loaded ${results.data.length} student records from CSV.`);
      },
      error: (err) => {
        addLog(`Error parsing CSV: ${err.message}`);
        setStatus('error');
      }
    });
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const startBatchMinting = async () => {
    if (!zipFile || csvData.length === 0 || !user) return;

    setIsProcessing(true);
    setStatus('processing');
    setProgress(0);
    setLogs([]);
    addLog('Starting batch processing (Blockchain + IPFS)...');

    try {
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(zipFile);
      
      const provider = getProvider();
      const wallet = getAdminWallet(provider);

      if (!wallet) {
        throw new Error('Admin wallet could not be initialized. Check PRIVATE_KEY in environment variables.');
      }

      if (!ethers.isAddress(wallet.address)) {
        throw new Error('Invalid Admin Wallet Address derived from Private Key.');
      }

      const contract = getContract(wallet);
      
      addLog(`Connecting to Contract: ${(import.meta as any).env.VITE_CONTRACT_ADDRESS}`);
      addLog(`Using Admin Wallet: ${wallet.address}`);
      
      // Check if addresses are valid lengths to prevent PK in Address field
      const contractAddr = (import.meta as any).env.VITE_CONTRACT_ADDRESS;
      if (contractAddr.length > 42) {
        throw new Error('VITE_CONTRACT_ADDRESS looks like a Private Key. Please use the 42-character Contract Address.');
      }

      // Verification: Check if sender is owner
      addLog('Verifying contract ownership...');
      try {
        const contractOwner = await contract.owner();
        addLog(`Contract Owner: ${contractOwner}`);
        if (contractOwner.toLowerCase() !== wallet.address.toLowerCase()) {
          throw new Error(`Owner Mismatch! Wallet ${wallet.address} is NOT the owner of contract ${contractAddr}. Only the owner can mint.`);
        }
        addLog('Ownership verified. Proceeding...');
      } catch (err: any) {
        addLog(`Error checking owner: ${err.message}`);
        throw new Error(`Could not verify ownership. Ensure the Contract Address and RPC URL are correct. Error: ${err.message}`);
      }

      let completedCount = 0;

      for (const item of csvData) {
        try {
          addLog(`Processing ${item.studentName}...`);
        
        // 1. Get image from ZIP
        const imageFile = zipContent.file(item.imageFileName.trim());
        if (!imageFile) {
          addLog(`Error: Image ${item.imageFileName} not found in ZIP. Skipping.`);
          continue;
        }

        const imageBlob = await imageFile.async('blob');
        
        // 2. Upload to Pinata (IPFS)
        addLog(`Uploading image to IPFS via Pinata...`);
        const pinataResult = await uploadToIPFS(imageBlob, item.imageFileName);
        const ipfsHash = pinataResult.IpfsHash;
        const imageUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
        
        addLog(`IPFS Link: ${imageUrl}`);

        // 3. Create & Upload Metadata
        const metadata = {
          name: `University Certificate - ${item.studentName}`,
          description: `Digital Certificate issued by VeriCert for ${item.studentName}`,
          image: imageUrl,
          attributes: [
            { trait_type: "Student", value: item.studentName },
            { trait_type: "Certificate Number", value: item.certificateNumber },
            { trait_type: "Issue Date", value: new Date().toISOString() }
          ]
        };

        addLog(`Uploading metadata to IPFS...`);
        const metaResult = await uploadJSONToIPFS(metadata);
        const tokenURI = `ipfs://${metaResult.IpfsHash}`;

        // 4. Mint on Blockchain (ONLY if wallet is valid)
        const rawRecipient = (item.studentWalletAddress || '').trim();
        const isValidRecipient = rawRecipient && ethers.isAddress(rawRecipient);
        
        let txHash = '';
        let tokenId = '';

        if (isValidRecipient) {
          addLog(`Minting on Chain for ${item.studentName}...`);
          try {
            const numericTokenId = Math.floor(Date.now() / 1000) + completedCount;
            const tx = await contract.mintIjazah(rawRecipient, numericTokenId, tokenURI);
            addLog(`Transaction Sent for ${item.studentName}: ${tx.hash}`);
            await tx.wait();
            txHash = tx.hash;
            tokenId = numericTokenId.toString();
          } catch (mintErr: any) {
            addLog(`Blockchain Minting failed for ${item.studentName}: ${mintErr.message}`);
          }
        } else {
          addLog(`No valid wallet for ${item.studentName}. Skipping Blockchain minting.`);
        }

        // 5. Save to Firestore (Always)
        const path = 'certificates';
        await addDoc(collection(db, 'certificates'), {
          studentEmail: item.studentEmail.toLowerCase().trim(),
          studentName: item.studentName,
          certificateNumber: item.certificateNumber,
          issueDate: new Date().toISOString(),
          imageUrl: imageUrl,
          ipfsHash: ipfsHash,
          tokenId: tokenId || null,
          txHash: txHash || null,
          createdBy: user.uid,
          mintedAt: serverTimestamp(),
          isDigitalOnly: !txHash
        });

        completedCount++;
          setProgress(Math.round((completedCount / csvData.length) * 100));
          addLog(`Successfully minted certificate for ${item.studentName}.`);
        } catch (mintErr: any) {
          addLog(`Minting Failed for ${item.studentName}: ${mintErr.message}`);
          // Continue to next record or stop depending on policy
        }
      }

      addLog(`Batch complete. ${completedCount} certificates issued.`);
      setStatus('done');
    } catch (err: any) {
      addLog(`Critical Error: ${err.message}`);
      setStatus('error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-serif font-medium text-stone-900 italic">Management Dashboard</h2>
          <p className="text-stone-500 text-sm mt-1">Sistem Penerbitan Ijazah Digital Universitas</p>
        </div>
        <div className="flex items-center gap-2 bg-stone-100 p-1 rounded-xl border border-stone-200">
           <button onClick={() => setActiveMode('single')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeMode === 'single' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>Single</button>
           <button onClick={() => setActiveMode('batch')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeMode === 'batch' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>Batch</button>
           <button onClick={() => setActiveMode('settings')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeMode === 'settings' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>Account</button>
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
                    <div className="w-12 h-12 rounded-2xl bg-stone-900 flex items-center justify-center text-white shadow-lg"><FileUp /></div>
                    <div>
                      <h3 className="font-bold text-stone-900">Input Data Ijazah</h3>
                      <p className="text-xs text-stone-400">Penerbitan ijazah per mahasiswa</p>
                    </div>
                  </div>

                  <form onSubmit={handleSingleUpload} className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">Nama Mahasiswa</label>
                      <input type="text" placeholder="Nama Lengkap Mahasiswa" className="input-style" value={singleData.studentName} onChange={e => setSingleData({...singleData, studentName: e.target.value})} required />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">Email Mahasiswa</label>
                      <input type="email" placeholder="mahasiswa@upnyk.ac.id" className="input-style" value={singleData.studentEmail} onChange={e => setSingleData({...singleData, studentEmail: e.target.value})} required />
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">Nomor Ijazah</label>
                      <input type="text" placeholder="SC-2024-001" className="input-style" value={singleData.certificateNumber} onChange={e => setSingleData({...singleData, certificateNumber: e.target.value})} required />
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">Wallet Address (Opsional)</label>
                      <input type="text" placeholder="0x..." className="input-style font-mono text-xs" value={singleData.studentWalletAddress} onChange={e => setSingleData({...singleData, studentWalletAddress: e.target.value})} />
                    </div>
                    
                    <div className="md:col-span-2 mt-4">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">Scan Ijazah</label>
                      <div className="relative group mt-1.5">
                        <input type="file" onChange={e => setSingleImage(e.target.files?.[0] || null)} className="absolute inset-0 opacity-0 cursor-pointer z-10" id="file-up" required={activeMode === 'single'} />
                        <div className={`p-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 transition-all ${singleImage ? 'bg-stone-50 border-stone-900' : 'border-stone-100 bg-stone-50'}`}>
                          <Upload className={`w-8 h-8 ${singleImage ? 'text-stone-900' : 'text-stone-300'}`} />
                          <span className="text-xs font-bold text-stone-600">
                            {singleImage ? singleImage.name : 'Klik atau Drop Gambar Ijazah (Scanned)'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button type="submit" disabled={isProcessing} className="md:col-span-2 mt-4 py-4 bg-stone-900 text-white rounded-2xl font-bold flex justify-center items-center gap-2 transition-all hover:bg-black disabled:opacity-50">
                      {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'TERBITKAN IJAZAH'}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-8 bg-white rounded-3xl border border-stone-200 shadow-sm space-y-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center text-white"><Database className="w-5 h-5" /></div>
                        <h3 className="font-bold text-stone-900">Certificate Records (CSV)</h3>
                    </div>
                    <p className="text-xs text-stone-500 leading-relaxed">Pilih file CSV dengan kolom: studentEmail, studentName, certificateNumber, imageFileName, studentWalletAddress.</p>
                    <div className="relative">
                      <input type="file" accept=".csv" onChange={handleCsvUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                      <div className={`p-8 border-2 border-dashed rounded-xl flex flex-col items-center gap-2 transition-colors ${csvData.length > 0 ? 'bg-stone-50 border-stone-900' : 'border-stone-100 bg-stone-50'}`}>
                        <Database className={`w-8 h-8 ${csvData.length > 0 ? 'text-stone-900' : 'text-stone-300'}`} />
                        <span className="text-xs font-bold text-stone-600">{csvData.length > 0 ? `${csvData.length} data dimuat` : 'Pilih File CSV'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-8 bg-white rounded-3xl border border-stone-200 shadow-sm space-y-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center text-white"><Upload className="w-5 h-5" /></div>
                        <h3 className="font-bold text-stone-900">Assets Archive (ZIP)</h3>
                    </div>
                    <p className="text-xs text-stone-500 leading-relaxed">Unggah file ZIP yang berisi semua gambar ijazah sesuai nama file di dalam CSV.</p>
                    <div className="relative">
                      <input type="file" accept=".zip" onChange={e => setZipFile(e.target.files?.[0] || null)} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                      <div className={`p-8 border-2 border-dashed rounded-xl flex flex-col items-center gap-2 transition-colors ${zipFile ? 'bg-stone-50 border-stone-900' : 'border-stone-100 bg-stone-50'}`}>
                        <CheckCircle2 className={`w-8 h-8 ${zipFile ? 'text-stone-900' : 'text-stone-300'}`} />
                        <span className="text-xs font-bold text-stone-600">{zipFile ? zipFile.name : 'Pilih File ZIP'}</span>
                      </div>
                    </div>
                  </div>

                  <button onClick={startBatchMinting} disabled={isProcessing || !zipFile || csvData.length === 0} className="w-full py-5 bg-stone-900 text-white rounded-2xl font-bold transition-all hover:bg-black shadow-xl disabled:opacity-50">
                    {isProcessing ? 'SEDANG MEMPROSES BATCH...' : `MULAI PROSES BATCH (${csvData.length} IJAZAH)`}
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-6">
              <div className="bg-[#121212] text-stone-400 p-6 rounded-3xl font-mono text-[10px] h-full min-h-[500px] overflow-y-auto border border-stone-800 shadow-2xl flex flex-col">
                <p className="text-stone-600 border-b border-stone-800 pb-2 mb-4 uppercase tracking-widest text-[9px] font-bold">System Dashboard Console</p>
                <div className="flex-1 space-y-2">
                   {logs.length === 0 ? (
                     <p className="italic opacity-30">Waiting for activity...</p>
                   ) : (
                     logs.map((log, i) => (
                       <div key={i} className="flex gap-2 group">
                         <span className="text-stone-700">[{i+1}]</span>
                         <span className={log.includes('Error') || log.includes('Fail') ? 'text-red-400' : log.includes('Berhasil') ? 'text-green-400' : 'group-hover:text-stone-200'}>{log}</span>
                       </div>
                     ))
                   )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .input-style {
          @apply w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 transition-all shadow-sm;
        }
      `}</style>
    </div>
  );
}
