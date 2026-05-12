import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { Certificate } from '../types';
import { ShieldCheck, Award, Calendar, CheckCircle2, QrCode, ArrowLeft, Loader2, Globe, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';

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
      // If manual mode, scroll to input
      if (certId === 'manual') {
        const input = document.querySelector('input');
        input?.focus();
      }
    }
  }, []);

  async function loadCertificate(id: string) {
    const cleanId = id.trim();
    if (!cleanId) return;

    setLoading(true);
    setError(null);
    console.log('Starting certificate lookup for:', cleanId);

    try {
      // 1. Try fetching by Firestore Document ID first (if valid ID format)
      if (cleanId.length >= 20) {
        console.log('Checking as Firestore Doc ID...');
        const docRef = doc(db, 'certificates', cleanId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          console.log('Found by Doc ID');
          setCert({ id: docSnap.id, ...docSnap.data() } as Certificate);
          return;
        }
      }

      // 2. Try querying by Token ID (Blockchain ID)
      console.log('Checking as Token ID...');
      const qToken = query(collection(db, 'certificates'), where('tokenId', '==', cleanId), limit(1));
      const tokenSnap = await getDocs(qToken);
      if (!tokenSnap.empty) {
        console.log('Found by Token ID');
        const d = tokenSnap.docs[0];
        setCert({ id: d.id, ...d.data() } as Certificate);
        return;
      }

      // 3. Try querying by Certificate Number
      console.log('Checking as Certificate Number...');
      const qNum = query(collection(db, 'certificates'), where('certificateNumber', '==', cleanId), limit(1));
      const numSnap = await getDocs(qNum);
      if (!numSnap.empty) {
        console.log('Found by Certificate Number');
        const d = numSnap.docs[0];
        setCert({ id: d.id, ...d.data() } as Certificate);
        return;
      }

      // 4. Try querying by Student Email
      if (cleanId.includes('@')) {
        console.log('Checking as Student Email...');
        const qEmail = query(collection(db, 'certificates'), where('studentEmail', '==', cleanId.toLowerCase()), limit(1));
        const emailSnap = await getDocs(qEmail);
        if (!emailSnap.empty) {
          console.log('Found by Student Email');
          const d = emailSnap.docs[0];
          setCert({ id: d.id, ...d.data() } as Certificate);
          return;
        }
      }

      console.warn('Certificate not found for ID:', cleanId);
      setError('Certificate not found. Please check the ID, Certificate Number, or Email.');
    } catch (err) {
      console.error('Lookup error:', err);
      handleFirestoreError(err, OperationType.GET, `certificates/${cleanId}`);
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
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-stone-50">
        <Loader2 className="w-12 h-12 text-stone-300 animate-spin mb-6" />
        <h2 className="text-2xl font-serif italic text-stone-900">Validating Cryptographic Record</h2>
        <p className="text-stone-500 mt-2">Connecting to secure verification oracle...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 py-12">
      <div className="mb-12 flex justify-between items-center bg-white p-6 rounded-2xl border border-stone-200">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-stone-400 hover:text-stone-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Go Back
        </button>
        <div className="flex items-center gap-2 text-stone-900">
           <ShieldCheck className="w-6 h-6" />
           <span className="font-serif italic text-xl">VeriCert Protocol</span>
        </div>
      </div>

      {!cert ? (
        <div className="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center">
            <h1 className="text-4xl font-serif font-medium text-stone-900 mb-4">Verification Center</h1>
            <p className="text-stone-600 leading-relaxed">Enter a Certificate ID or scan a VeriCert QR code to confirm the authenticity of a digital credential.</p>
          </div>
          
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <input 
                type="text" 
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="Enter ID, Certificate #, or Email"
                className="flex-1 px-6 py-4 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-900 transition-shadow bg-white"
              />
              <button className="px-8 py-4 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-colors shadow-lg">
                Verify Now
              </button>
            </div>
            {error && (
              <p className="text-center text-sm text-red-600 font-medium">{error}</p>
            )}
          </form>

          <div className="grid grid-cols-2 gap-4 mt-12">
             <div className="p-6 bg-stone-100 rounded-2xl border border-stone-200">
                <Globe className="w-6 h-6 mb-3 text-stone-400" />
                <h4 className="font-bold text-xs uppercase tracking-widest text-stone-900 mb-2">Immutable Records</h4>
                <p className="text-[11px] text-stone-500 leading-relaxed">All certificates are permanently etched into our secure protocol database.</p>
             </div>
             <div className="p-6 bg-stone-100 rounded-2xl border border-stone-200">
                <QrCode className="w-6 h-6 mb-3 text-stone-400" />
                <h4 className="font-bold text-xs uppercase tracking-widest text-stone-900 mb-2">Instant Validation</h4>
                <p className="text-[11px] text-stone-500 leading-relaxed">Cryptographic proof ensures the record hasn't been altered since issuance.</p>
             </div>
          </div>
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          <div className="relative bg-white rounded-3xl border border-stone-200 shadow-2xl overflow-hidden">
             {/* Security Header */}
             <div className={`${cert.txHash ? 'bg-green-600' : 'bg-amber-600'} text-white px-8 py-4 flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                   <CheckCircle2 className="w-5 h-5" />
                   <span className="text-xs font-bold uppercase tracking-widest">
                     {cert.txHash ? 'Digitally Verified & Valid (On-Chain)' : 'Database Record Verified'}
                   </span>
                </div>
                {/* PERBAIKAN: Gunakan optional chaining atau pengecekan manual */}
                <div className="text-[10px] opacity-80 font-mono uppercase">
                  HASH: {cert.txHash ? cert.txHash.substring(0, 16) : 'OFF-CHAIN RECORD'}...
                </div>
             </div>

             <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-stone-100">
                <div className="md:w-2/5 p-8 sm:p-12 bg-stone-50/50">
                   <img src={cert.imageUrl} className="w-full aspect-square object-cover rounded-2xl shadow-xl shadow-stone-200 border border-stone-200 mb-8" />
                   
                  <div className="space-y-6">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1">Blockchain ID</p>
                        <p className="font-mono text-xs text-stone-900 break-all">{cert.tokenId || 'Not Minted'}</p>
                      </div>
                      
                      {/* PERBAIKAN: Hanya tampilkan link Etherscan jika txHash ada */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1">Transaction Proof</p>
                        {cert.txHash ? (
                          <a 
                            href={`https://sepolia.etherscan.io/tx/${cert.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[10px] text-stone-600 break-all hover:text-stone-900 underline flex items-center gap-1"
                          >
                            {cert.txHash.substring(0, 24)}...
                            <ExternalLink className="w-2 h-2" />
                          </a>
                        ) : (
                          <p className="text-[10px] text-stone-400 italic">No transaction recorded yet.</p>
                        )}
                      </div>

                      {cert.ipfsHash && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1">IPFS Image Hash</p>
                          <a 
                            href={`https://gateway.pinata.cloud/ipfs/${cert.ipfsHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[10px] text-stone-600 break-all hover:text-stone-900 underline flex items-center gap-1"
                          >
                            {cert.ipfsHash}
                            <ExternalLink className="w-2 h-2" />
                          </a>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1">Issued By</p>
                        <p className="font-semibold text-stone-900">VeriCert University Protocol</p>
                      </div>
                   </div>
                </div>

                <div className="flex-1 p-8 sm:p-12">
                   {/* ... (konten isi sertifikat tetap sama) */}
                   <div className="mb-12">
                      <h2 className="text-4xl font-serif italic text-stone-900 mb-2">Certificate of Excellence</h2>
                      <p className="text-stone-500 uppercase tracking-widest text-[10px] font-bold">Official Credential Details</p>
                   </div>

                   <div className="space-y-8 mb-12">
                      <div className="grid grid-cols-2 gap-8">
                         <div>
                            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1">Recipient Name</h4>
                            <p className="text-xl font-serif italic text-stone-900">{cert.studentName}</p>
                         </div>
                         <div>
                            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1">Course / Program</h4>
                            <p className="text-xl font-serif italic text-stone-900">{cert.courseName}</p>
                         </div>
                      </div>

                      <div className="grid grid-cols-2 gap-8">
                         <div>
                            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1">Certification No.</h4>
                            <p className="font-semibold text-stone-900">{cert.certificateNumber}</p>
                         </div>
                         <div>
                            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-1">Issue Date</h4>
                            <div className="flex items-center gap-2 font-semibold text-stone-900">
                               <Calendar className="w-4 h-4 text-stone-400" />
                               {new Date(cert.issueDate).toLocaleDateString()}
                            </div>
                         </div>
                      </div>
                   </div>

                   <div className="p-8 bg-stone-50 rounded-2xl border border-stone-200">
                      <div className="flex items-center gap-3 mb-4">
                         <ShieldCheck className={`w-6 h-6 ${cert.txHash ? 'text-green-600' : 'text-amber-600'}`} />
                         <h4 className="font-bold text-sm text-stone-900 uppercase tracking-wider">Provenance Verification</h4>
                      </div>
                      <p className="text-xs text-stone-600 leading-relaxed mb-6">
                        {cert.txHash 
                          ? `This digital record was issued on ${new Date(cert.mintedAt?.toDate?.() || Date.now()).toLocaleString()} and is permanently etched on the blockchain.`
                          : `This record exists in the verified database but has not yet been issued to the blockchain protocol.`
                        }
                      </p>
                      <div className="flex gap-4">
                         <div className="flex-1 p-4 bg-white rounded-xl border border-stone-100 flex flex-col justify-center">
                            <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">Asset Status</p>
                            <p className={`text-xs font-bold ${cert.txHash ? 'text-green-600' : 'text-amber-600'}`}>
                              {cert.txHash ? 'On-Chain Valid' : 'Database Valid'}
                            </p>
                         </div>
                         <div className="flex-1 p-4 bg-white rounded-xl border border-stone-100 flex flex-col justify-center">
                            <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">Ownership</p>
                            <p className="text-xs font-bold text-stone-900">Verifiably Issued</p>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>
          
          <div className="text-center">
             <button 
               onClick={() => {
                 window.history.pushState({}, '', '/');
                 setCert(null);
               }}
               className="text-stone-400 hover:text-stone-900 font-bold uppercase tracking-widest text-[10px] transition-colors"
             >
               Verify Another Certificate
             </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
