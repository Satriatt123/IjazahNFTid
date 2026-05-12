import React, { useState, useEffect, createContext, useContext } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';
import { useAccount, useDisconnect } from 'wagmi';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const { isConnected } = useAccount();
  const { disconnectAsync } = useDisconnect();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      try {
        if (authUser) {
          const email = authUser.email?.toLowerCase() || '';
          
          // Guard: Pastikan hanya domain UPN atau email admin yang diizinkan
          const isAllowedDomain = email.endsWith('@upnyk.ac.id') || email.endsWith('@student.upnyk.ac.id');
          const isAdminBypass = email === 'satriaanjasmara04@gmail.com'; // Email pengembang

          if (!isAllowedDomain && !isAdminBypass) {
            await firebaseSignOut(auth);
            setUser(null);
            setProfile(null);
            return;
          }

          setUser(authUser);
          const docRef = doc(db, 'users', authUser.uid);
          const docSnap = await getDoc(docRef);

          // List email yang otomatis mendapatkan role Admin
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
            // Buat profil baru jika belum ada di Firestore
            const newProfileData = {
              uid: authUser.uid,
              email: email,
              name: authUser.displayName || email.split('@')[0],
              role: shouldBeAdmin ? 'admin' : 'student',
              createdAt: serverTimestamp(),
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
    // Memaksa pilihan akun agar user bisa memilih email kampus
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (error) {
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
    <AuthContext.Provider value={{ user, profile, loading, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};