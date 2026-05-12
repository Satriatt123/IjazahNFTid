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
  courseName: string;
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
    courseName: '',
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
    addLog('Starting single certificate issuance...');

    try {
      const provider = getProvider();
      const wallet = getAdminWallet(provider);
      if (!wallet) throw new Error('Admin wallet initialization failed.');

      const contract = getContract(wallet);

      // 1. Upload to IPFS
      addLog('Uploading image to IPFS...');
      const pinataResult = await uploadToIPFS(singleImage, singleImage.name);
      const imageUrl = `https://gateway.pinata.cloud/ipfs/${pinataResult.IpfsHash}`;
      
      // 2. Metadata
      addLog('Uploading metadata...');
      const metadata = {
        name: `${singleData.courseName} Certificate - ${singleData.studentName}`,
        description: `Digital Certificate issued by SADEWA for ${singleData.studentName}`,
        image: imageUrl,
        attributes: [
          { trait_type: "Student", value: singleData.studentName },
          { trait_type: "Certificate Number", value: singleData.certificateNumber },
          { trait_type: "Course", value: singleData.courseName }
        ]
      };
      const metaResult = await uploadJSONToIPFS(metadata);
      const tokenURI = `ipfs://${metaResult.IpfsHash}`;

      // 3. Mint (Optional)
      let txHash = '';
      let tokenId = '';
      const walletAddress = singleData.studentWalletAddress.trim();
      const isValidRecipient = walletAddress && ethers.isAddress(walletAddress);

      if (isValidRecipient) {
        addLog('Minting on Blockchain (Recipient detected)...');
        const numericTokenId = Math.floor(Date.now() / 1000);
        
        try {
          const tx = await contract.mintIjazah(walletAddress, numericTokenId, tokenURI);
          addLog(`TX Sent: ${tx.hash}`);
          await tx.wait();
          addLog('Confirmed on Blockchain!');
          txHash = tx.hash;
          tokenId = numericTokenId.toString();
        } catch (mintErr: any) {
          addLog(`Blockchain Minting failed, but moving forward with Database record: ${mintErr.message}`);
        }
      } else {
        addLog('No valid Wallet detected. Skipping Blockchain minting (Database-only mode).');
      }

      // 4. Firestore
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

      addLog(txHash ? 'Certificate + NFT successfully issued!' : 'Digital Certificate successfully issued (Pending Wallet)!');
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
          courseName: row.courseName || row.course || '',
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
          name: `${item.courseName} Certificate - ${item.studentName}`,
          description: `Digital Certificate issued by VeriCert for ${item.studentName}`,
          image: imageUrl,
          attributes: [
            { trait_type: "Student", value: item.studentName },
            { trait_type: "Certificate Number", value: item.certificateNumber },
            { trait_type: "Course", value: item.courseName },
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
          courseName: item.courseName,
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
          <h2 className="text-3xl font-serif font-medium text-stone-900 italic">Admin Dashboard</h2>
          <p className="text-stone-500 text-sm mt-1">Issue and manage digital credentials</p>
        </div>
        <div className="flex items-center gap-2 bg-stone-100 p-1 rounded-xl border border-stone-200 self-start">
           <button 
             onClick={() => setActiveMode('single')}
             className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeMode === 'single' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
           >
             Single Upload
           </button>
           <button 
             onClick={() => setActiveMode('batch')}
             className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeMode === 'batch' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
           >
             Batch Minting
           </button>
           <button 
             onClick={() => setActiveMode('settings')}
             className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeMode === 'settings' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
           >
             Account
           </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeMode === 'settings' ? (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-4xl"
          >
            <AccountSettings />
          </motion.div>
        ) : (
          <motion.div
            key="minting"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            {walletMissing && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3 shadow-sm">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-amber-900">Wallet Minting Belum Dikonfigurasi</h4>
            <p className="text-xs text-amber-700 leading-relaxed mt-1">
              Variabel lingkungan <b>PRIVATE_KEY</b> tidak ditemukan. Admin tidak akan bisa melakukan <i>batch minting</i> ke blockchain. 
              Harap tambahkan PRIVATE_KEY di menu <b>Settings &gt; Environment Variables</b>.
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Interface Column */}
        <div className="lg:col-span-2 space-y-6">
          {activeMode === 'single' ? (
            <div className="p-8 bg-white rounded-3xl border border-stone-200 shadow-sm">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-[#2196F3] flex items-center justify-center text-white shadow-lg shadow-blue-200">
                  <FileUp className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900">Penerbitan Sertifikat Tunggal</h3>
                  <p className="text-xs text-stone-400">Input data mahasiswa secara manual</p>
                </div>
              </div>

              <form onSubmit={handleSingleUpload} className="grid md:grid-cols-2 gap-x-6 gap-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">Nama Mahasiswa</label>
                  <input 
                    type="text" 
                    required
                    value={singleData.studentName}
                    onChange={e => setSingleData({...singleData, studentName: e.target.value})}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2196F3] transition-all shadow-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">Email Mahasiswa</label>
                  <input 
                    type="email" 
                    required
                    value={singleData.studentEmail}
                    onChange={e => setSingleData({...singleData, studentEmail: e.target.value})}
                    placeholder="mahasiswa@upnyk.ac.id"
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2196F3] transition-all shadow-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">Nomor Sertifikat</label>
                  <input 
                    type="text" 
                    required
                    value={singleData.certificateNumber}
                    onChange={e => setSingleData({...singleData, certificateNumber: e.target.value})}
                    placeholder="SC-2024-001"
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2196F3] transition-all shadow-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">Nama Kegiatan/Mata Kuliah</label>
                  <input 
                    type="text" 
                    required
                    value={singleData.courseName}
                    onChange={e => setSingleData({...singleData, courseName: e.target.value})}
                    placeholder="Web Development Bootcamp"
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2196F3] transition-all shadow-sm"
                  />
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">Alamat Wallet Mahasiswa (Opsional)</label>
                  <input 
                    type="text" 
                    value={singleData.studentWalletAddress}
                    onChange={e => setSingleData({...singleData, studentWalletAddress: e.target.value})}
                    placeholder="0x..."
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2196F3] transition-all font-mono text-xs shadow-sm"
                  />
                </div>
                
                <div className="md:col-span-2 space-y-1.5 mt-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-1">File Gambar Sertifikat</label>
                  <div className="relative group">
                    <input 
                      type="file" 
                      accept="image/*"
                      required
                      onChange={e => setSingleImage(e.target.files?.[0] || null)}
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    />
                    <div className={`p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 transition-all ${singleImage ? 'bg-blue-50 border-[#2196F3]' : 'border-stone-100 bg-stone-50'}`}>
                      <Upload className={`w-8 h-8 ${singleImage ? 'text-[#2196F3]' : 'text-stone-300'}`} />
                      <span className="text-xs font-bold text-stone-600">
                        {singleImage ? singleImage.name : 'Pilih File Gambar'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 mt-6">
                  <button 
                    type="submit"
                    disabled={isProcessing || !singleImage}
                    className="w-full py-4 bg-[#2196F3] text-white rounded-2xl font-bold hover:bg-[#1E88E5] disabled:opacity-50 transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'TERBITKAN SERTIFIKAT'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-sm transition-all hover:shadow-md">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center text-white">
                    <Database className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-stone-900">Certificate Records (CSV)</h3>
                </div>
                
                <p className="text-sm text-stone-500 mb-6">Upload file CSV berisi data mahasiswa. Kolom wajib: studentEmail, studentName, certificateNumber, courseName, imageFileName.</p>
                
                <div className="relative">
                  <input 
                    type="file" 
                    accept=".csv" 
                    onChange={handleCsvUpload}
                    disabled={isProcessing}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  <div className={`p-8 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 transition-colors ${csvData.length > 0 ? 'bg-stone-50 border-stone-900' : 'border-stone-200 bg-stone-50/50'}`}>
                    <Database className={`w-8 h-8 ${csvData.length > 0 ? 'text-stone-900' : 'text-stone-300'}`} />
                    <span className="text-sm font-medium text-stone-600">
                      {csvData.length > 0 ? `${csvData.length} records loaded` : 'Klik atau drop file CSV'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-sm transition-all hover:shadow-md">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center text-white">
                    <Upload className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-stone-900">Image Assets (ZIP)</h3>
                </div>
                
                <p className="text-sm text-stone-500 mb-6">Upload file ZIP berisi semua gambar sertifikat. Nama file harus sesuai dengan kolom "imageFileName" di CSV.</p>
                
                <div className="relative">
                  <input 
                    type="file" 
                    accept=".zip" 
                    onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                    disabled={isProcessing}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  <div className={`p-8 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 transition-colors ${zipFile ? 'bg-stone-50 border-stone-900' : 'border-stone-200 bg-stone-50/50'}`}>
                    <CheckCircle2 className={`w-8 h-8 ${zipFile ? 'text-stone-900' : 'text-stone-300'}`} />
                    <span className="text-sm font-medium text-stone-600">
                      {zipFile ? zipFile.name : 'Klik atau drop file ZIP'}
                    </span>
                  </div>
                </div>
              </div>

              <button 
                onClick={startBatchMinting}
                disabled={isProcessing || !zipFile || csvData.length === 0}
                className="w-full py-4 bg-stone-900 text-white rounded-xl font-semibold hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Sedang memproses...
                  </>
                ) : (
                  <>
                    Terbitkan {csvData.length > 0 ? csvData.length : ''} Sertifikat (Batch)
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Status/Logs Column */}
        <div className="flex flex-col gap-6">
          <AnimatePresence mode="wait">
            {status !== 'idle' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`p-6 rounded-2xl border ${
                  status === 'processing' ? 'bg-[#003366] text-white border-stone-800 shadow-xl shadow-blue-900/20' :
                  status === 'done' ? 'bg-green-50 text-green-900 border-green-100 shadow-xl' :
                  'bg-red-50 text-red-900 border-red-100'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                   <h4 className="font-semibold">{status === 'processing' ? 'Proses Berjalan' : status === 'done' ? 'Berhasil' : 'Gagal'}</h4>
                   <button onClick={() => setStatus('idle')} className="p-1 hover:opacity-70">
                     <X className="w-4 h-4" />
                   </button>
                </div>
                
                {status === 'processing' ? (
                  <div className="space-y-4">
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="h-full bg-white"
                      />
                    </div>
                    <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest opacity-60">
                      <span>{progress}% Selesai</span>
                      <span>Mencatat ke Blockchain...</span>
                    </div>
                  </div>
                ) : status === 'done' ? (
                  <div className="flex items-center gap-3 text-sm">
                    <Shield className="text-green-600 w-5 h-5 shrink-0" />
                    <p className="font-medium">Sertifikat telah berhasil diterbitkan dan dicatat ke dalam database blockchain.</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-sm">
                    <AlertCircle className="text-red-600 w-5 h-5 shrink-0" />
                    <p className="font-medium">Terjadi kesalahan pada proses penerbitan. Cek log sistem di bawah.</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 bg-stone-900 text-stone-400 p-6 rounded-3xl font-mono text-[10px] h-[400px] overflow-y-auto border border-stone-800 shadow-inner">
            <p className="text-stone-600 mb-4 border-b border-stone-800 pb-2 uppercase tracking-widest text-[9px] font-bold">System Dashboard Console</p>
            {logs.length === 0 ? (
              <p className="italic opacity-50">Menunggu aktivitas...</p>
            ) : (
              <div className="space-y-1.5">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-2 group">
                    <span className="text-stone-700 shrink-0">[{i+1}]</span>
                    <span className={log.includes('Error') ? 'text-red-400' : log.includes('Successfully') || log.includes('Berhasil') ? 'text-green-400' : 'group-hover:text-stone-200'}>
                      {log}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
</div>
  );
}
