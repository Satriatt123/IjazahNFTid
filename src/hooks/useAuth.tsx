import React, { useState, useEffect, createContext, useContext } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateEmail,
  setPersistence,
  browserSessionPersistence 
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
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
  updateAccount: (newEmail?: string, newPassword?: string, newName?: string, newWallet?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const { isConnected } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { connectAsync } = useConnect();
  const { signMessageAsync } = useSignMessage();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      try {
        if (authUser) {
          const email = authUser.email?.toLowerCase() || '';
          
          const adminBypass = ['satriadian091@gmail.com', 'newwcandra@gmail.com', 'satriaanjasmara04@gmail.com'];
          
          const isAllowed = email.endsWith('@upnyk.ac.id') || email.endsWith('@student.upnyk.ac.id') || adminBypass.includes(email);
          
          if (!isAllowed) {
            await firebaseSignOut(auth);
            if (isConnected) await disconnectAsync();
            setUser(null);
            setProfile(null);
            setLoading(false);
            return;
          }

          setUser(authUser);
          const docRef = doc(db, 'users', authUser.uid);
          const docSnap = await getDoc(docRef);

          const shouldBeAdmin = adminBypass.includes(email) || email.endsWith('@upnyk.ac.id');

          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            if (shouldBeAdmin && data.role !== 'admin') {
              await updateDoc(docRef, { role: 'admin' });
              setProfile({ ...data, role: 'admin' });
            } else {
              setProfile(data);
            }
          } else {
            const walletAddress = email.startsWith('wallet_') ? email.split('_')[1].split('@')[0] : null;
            const newProfileData = {
              uid: authUser.uid,
              email: email,
              name: authUser.displayName || email.split('@')[0],
              role: shouldBeAdmin ? 'admin' : 'student',
              createdAt: serverTimestamp(),
              walletAddress: walletAddress
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
  }, [isConnected, disconnectAsync]);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await setPersistence(auth, browserSessionPersistence);
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (error) {
      throw error;
    }
  };

  const loginWithWallet = async (connector: any) => {
    try {
      const connection = await connectAsync({ connector });
      const address = connection.accounts[0].toLowerCase();
      const walletEmail = `wallet_${address}@upnyk.ac.id`;
      const walletPass = `wallet_pass_${address.slice(0, 12)}`;

      const message = `LOGIN IJAZAH DIGITAL ID\n\nAlamat: ${address}\nTimestamp: ${new Date().toISOString()}`;
      await signMessageAsync({ message, account: address as `0x${string}` });

      await setPersistence(auth, browserSessionPersistence);

      try {
        await signInWithEmailAndPassword(auth, walletEmail, walletPass);
      } catch (err: any) {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
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

  const updateAccount = async (newEmail?: string, newPassword?: string, newName?: string, newWallet?: string) => {
    if (!auth.currentUser) throw new Error('Anda harus login terlebih dahulu.');
    
    const currentUser = auth.currentUser;
    const profileUpdates: any = {};
    
    if (newName) profileUpdates.name = newName;
    if (newWallet) profileUpdates.walletAddress = newWallet.toLowerCase();
    if (newEmail) profileUpdates.email = newEmail.toLowerCase();

    try {
      if (Object.keys(profileUpdates).length > 0) {
        await updateDoc(doc(db, 'users', currentUser.uid), profileUpdates);
      }

      if (newEmail && newEmail.toLowerCase() !== currentUser.email?.toLowerCase()) {
        await updateEmail(currentUser, newEmail);
      }

      if (newPassword) {
        const { updatePassword } = await import('firebase/auth');
        await updatePassword(currentUser, newPassword);
      }

      setProfile(prev => prev ? { ...prev, ...profileUpdates } : null);
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        throw new Error('Sesi ini memerlukan login ulang untuk mengubah informasi sensitif.');
      }
      throw err;
    }
  };

  const logout = async () => {
    await firebaseSignOut(auth);
    if (isConnected) await disconnectAsync();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, loginWithGoogle, loginWithWallet, logout, updateAccount }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};