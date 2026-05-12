import React, { useState, useEffect, createContext, useContext } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';
import { useAccount, useDisconnect, useConnect, useSignMessage } from 'wagmi';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<User>;
  loginWithWallet: (connector: any) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Wagmi Hooks
  const { isConnected } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { connectAsync } = useConnect();
  const { signMessageAsync } = useSignMessage();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      try {
        if (authUser) {
          const email = authUser.email?.toLowerCase() || '';
          
          // Guard: Izinkan domain UPN, email mahasiswa, email wallet deterministik, atau bypass admin
          const isAllowedDomain = email.endsWith('@upnyk.ac.id') || email.endsWith('@student.upnyk.ac.id');
          const isAdminBypass = email === 'satriaanjasmara04@gmail.com'; 

          if (!isAllowedDomain && !isAdminBypass) {
            await firebaseSignOut(auth);
            setUser(null);
            setProfile(null);
            return;
          }

          setUser(authUser);
          const docRef = doc(db, 'users', authUser.uid);
          const docSnap = await getDoc(docRef);

          // List email Admin
          const adminList = [
            'satriaanjasmara04@gmail.com',
            'admin.satria@upnyk.ac.id'
          ];
          
          const shouldBeAdmin = adminList.includes(email) || email.includes('admin');

          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            if (shouldBeAdmin && data.role !== 'admin') {
              await setDoc(docRef, { role: 'admin' }, { merge: true });
              setProfile({ ...data, role: 'admin' });
            } else {
              setProfile(data);
            }
          } else {
            // Deteksi jika login menggunakan wallet untuk mengambil alamat walletnya
            const walletAddress = email.startsWith('wallet_') 
              ? email.split('_')[1].split('@')[0] 
              : null;

            const newProfileData = {
              uid: authUser.uid,
              email: email,
              name: authUser.displayName || email.split('@')[0],
              role: shouldBeAdmin ? 'admin' : 'student',
              createdAt: serverTimestamp(),
              walletAddress: walletAddress // Simpan alamat wallet ke Firestore jika ada
            };
            await setDoc(docRef, newProfileData);
            setProfile(newProfileData as unknown as UserProfile);
          }
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (error) {
        console.error('Auth Sync Error:', error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (error) {
      throw error;
    }
  };

  const loginWithWallet = async (connector: any) => {
    try {
      // 1. Hubungkan ke Wallet
      const connection = await connectAsync({ connector });
      const address = connection.accounts[0].toLowerCase();
      
      // 2. Buat identitas Firebase deterministik
      const walletEmail = `wallet_${address}@upnyk.ac.id`;
      const walletPass = `wallet_pass_${address.slice(0, 12)}`;

      // 3. Verifikasi kepemilikan wallet dengan Signature
      const message = `LOGIN IJAZAH DIGITAL ID\n\nAlamat: ${address}\nTimestamp: ${new Date().toISOString()}`;
      await signMessageAsync({ message, account: address as `0x${string}` });

      // 4. Firebase Authentication
      try {
        await signInWithEmailAndPassword(auth, walletEmail, walletPass);
      } catch (err: any) {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
          // Buat akun Firebase baru jika wallet pertama kali digunakan
          await createUserWithEmailAndPassword(auth, walletEmail, walletPass);
        } else {
          throw err;
        }
      }
    } catch (error: any) {
      console.error('Wallet Login Error:', error);
      throw error;
    }
  };

  const logout = async () => {
    await firebaseSignOut(auth);
    if (isConnected) {
      await disconnectAsync();
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, loginWithGoogle, loginWithWallet, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};