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
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  loginWithWallet: (connector: any) => Promise<void>;
  logout: () => Promise<void>;
  updateAccount: (newEmail?: string, newPassword?: string, newName?: string, newWallet?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Wagmi hooks
  const { address: currentWalletAddress, isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      try {
        if (authUser) {
          setUser(authUser);
          const docRef = doc(db, 'users', authUser.uid);
          
          try {
            const docSnap = await getDoc(docRef);
            // Pre-authorized Admins (Email or Wallet Email)
            const adminList = [
              'satriaanjasmara04@gmail.com',
              'admin.satria@upnyk.ac.id',
              'wallet_0x4f9215592a3f5c4a9f1a51c66fb03a4613bd2217@upnyk.ac.id'
            ];
            
            const isAdminEmail = adminList.includes(authUser.email?.toLowerCase() || '') || 
                                authUser.email?.includes('admin');

            if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              if (isAdminEmail && data.role !== 'admin') {
                try {
                  await setDoc(docRef, { role: 'admin' }, { merge: true });
                  setProfile({ ...data, role: 'admin' });
                } catch (e) {
                  console.warn('Failed to sync admin role:', e);
                  setProfile(data);
                }
              } else {
                setProfile(data);
              }
            } else {
              // Create new profile record
              const walletAdd = authUser.email?.startsWith('wallet_') ? 
                                authUser.email.split('_')[1].split('@')[0] : null;

              const newProfileData = {
                uid: authUser.uid,
                email: authUser.email || '',
                name: authUser.displayName || authUser.email?.split('@')[0] || 'User',
                role: isAdminEmail ? 'admin' : 'student',
                createdAt: serverTimestamp(),
                walletAddress: walletAdd
              };
              
              try {
                await setDoc(docRef, newProfileData);
                setProfile(newProfileData as unknown as UserProfile);
              } catch (e) {
                console.error('Error creating user profile:', e);
                // Fallback to local profile so app doesn't hang
                setProfile(newProfileData as unknown as UserProfile);
              }
            }
          } catch (error) {
            console.error('Firestore sync error:', error);
            // Fallback for profile state if Firestore fails entirely
            setProfile({
              uid: authUser.uid,
              email: authUser.email || '',
              name: authUser.email?.split('@')[0] || 'User',
              role: 'student'
            } as UserProfile);
          }
        } else {
          setUser(null);
          setProfile(null);
        }
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Sync wallet address with Firebase session
  useEffect(() => {
    if (user?.email?.startsWith('wallet_') && currentWalletAddress) {
      const currentWalletInEmail = user.email.split('_')[1].split('@')[0];
      if (currentWalletAddress.toLowerCase() !== currentWalletInEmail.toLowerCase()) {
        const isAuthProcessing = isSigningIn;
        if (!isAuthProcessing) {
          console.log('Wallet account change detected, signing out for safety...');
          logout();
        }
      }
    }
  }, [currentWalletAddress, user, isSigningIn]);

  const login = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (
        error.code === 'auth/cancelled-popup-request' ||
        error.code === 'auth/popup-closed-by-user'
      ) {
        console.log('Login popup was closed or cancelled.');
      } else {
        console.error('Login error:', error);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error: any) {
      console.error('Email login error:', error);
      throw error;
    }
  };

  const loginWithWallet = async (connector: any) => {
    try {
      setIsSigningIn(true);
      
      // 1. If already connected to Firebase, sign out
      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }

      // 2. Disconnect if already connected to a wallet to force fresh session
      if (isConnected) {
        try {
          await disconnectAsync();
        } catch (e) {
          console.warn('Disconnect failed, ignoring...', e);
        }
      }

      // 3. Connect using specified connector
      if (!connector) {
        throw new Error('Wallet connector tidak valid.');
      }

      const connection = await connectAsync({ 
        connector 
      });
      
      const accountAddress = connection.accounts[0];
      
      // Check if this wallet is already mapped to a specifically set email
      let targetEmail = `wallet_${accountAddress.toLowerCase()}@upnyk.ac.id`;
      const deterministicPassword = `wallet_pass_${accountAddress.toLowerCase().slice(0, 12)}`;

      // Try searching for this wallet address in Firestore
      try {
        const q = query(collection(db, 'users'), where('walletAddress', '==', accountAddress.toLowerCase()));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const userData = querySnapshot.docs[0].data();
          if (userData.email) {
             targetEmail = userData.email;
             console.log('Mapped existing user via wallet address:', targetEmail);
          }
        }
      } catch (err) {
        console.warn('Wallet address lookup failed:', err);
      }

      // 4. Force identity confirmation via message signing
      const message = `LOGIN SADEWA\n\nAlamat: ${accountAddress}\nTimestamp: ${new Date().toISOString()}\n\nSaya mengonfirmasi bahwa saya adalah pemilik wallet ini.`;
      
      try {
        await signMessageAsync({ 
          message,
          account: accountAddress as `0x${string}`
        });
      } catch (signErr: any) {
        if (signErr.code === 4001 || signErr.message?.includes('rejected')) {
          await disconnectAsync();
          throw new Error('Konfirmasi tanda tangan ditolak.');
        }
        throw signErr;
      }

      // 5. Firebase authentication
      try {
        await signInWithEmailAndPassword(auth, targetEmail, deterministicPassword);
      } catch (err: any) {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
          // If the mapped email login fails, try the deterministic one as fallback (maybe they changed email but not yet password or vice versa)
          const fallbackEmail = `wallet_${accountAddress.toLowerCase()}@upnyk.ac.id`;
          try {
            await signInWithEmailAndPassword(auth, fallbackEmail, deterministicPassword);
          } catch (fallbackErr: any) {
            if (fallbackErr.code === 'auth/user-not-found' || fallbackErr.code === 'auth/invalid-credential') {
              await createUserWithEmailAndPassword(auth, fallbackEmail, deterministicPassword);
            } else {
              throw fallbackErr;
            }
          }
        } else {
          throw err;
        }
      }
    } catch (error: any) {
      console.error('Wallet login error:', error);
      if (error.code === 4001 || error.message?.includes('user rejected')) {
        throw new Error('Login dibatalkan oleh pengguna.');
      }
      throw error;
    } finally {
      setIsSigningIn(false);
    }
  };

  const logout = async () => {
    await firebaseSignOut(auth);
    if (isConnected) {
      try {
        await disconnectAsync();
      } catch (e) {
        console.warn('Silent disconnect failed:', e);
      }
    }
  };

  const updateAccount = async (newEmail?: string, newPassword?: string, newName?: string, newWallet?: string) => {
    if (!auth.currentUser) throw new Error('Anda harus login terlebih dahulu.');
    
    const user = auth.currentUser;
    const updates: any = {};
    if (newName) updates.name = newName;
    if (newWallet) updates.walletAddress = newWallet.toLowerCase();
    if (newEmail) {
      updates.email = newEmail.toLowerCase();
      updates.contactEmail = newEmail.toLowerCase();
    }

    try {
      // 1. Update Firestore Profile
      if (Object.keys(updates).length > 0) {
        await setDoc(doc(db, 'users', user.uid), updates, { merge: true });
      }

      // 2. Update Firebase Auth Email
      if (newEmail && newEmail.toLowerCase() !== user.email?.toLowerCase()) {
        try {
          await updateEmail(user, newEmail);
        } catch (emailErr: any) {
          if (emailErr.code === 'auth/requires-recent-login') {
            throw new Error('Silakan login kembali untuk memperbarui email.');
          }
          throw emailErr;
        }
      }

      // 3. Update Password if provided
      if (newPassword) {
        await updatePassword(user, newPassword);
      }

      // 4. Optimistic state update to avoid fetching from network
      setProfile(prev => {
        if (!prev) return null;
        return {
          ...prev,
          ...updates
        };
      });
      
    } catch (err: any) {
      console.error('Account update error:', err);
      throw err;
    }
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      login, 
      loginWithEmail, 
      loginWithWallet, 
      logout,
      updateAccount
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
