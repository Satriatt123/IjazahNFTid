import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from './lib/wagmi';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './hooks/useAuth.tsx';

// --- WALLET PROXY SAFETY SHIM ---
// Handle cases where window.ethereum is read-only or causing conflicts in iframe environment
try {
  if (typeof window !== 'undefined') {
    // If window.ethereum is a read-only property (getter), we try to make it configurable
    // to avoid "Cannot set property ethereum of #<Window> which has only a getter"
    const descriptor = Object.getOwnPropertyDescriptor(window, 'ethereum');
    if (descriptor && !descriptor.writable && !descriptor.set && descriptor.configurable) {
      let currentVal = (window as any).ethereum;
      Object.defineProperty(window, 'ethereum', {
        get: () => currentVal,
        set: (v) => { currentVal = v; },
        configurable: true,
        enumerable: true
      });
      console.log('Sadewa: ethereum descriptor patched for compatibility.');
    }
  }
} catch (e) {
  console.warn('Sadewa: ethereum proxy safety shim failed (non-critical):', e);
}
// --------------------------------

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
