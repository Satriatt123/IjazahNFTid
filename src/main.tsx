import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from './lib/wagmi';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './hooks/useAuth.tsx';

try {
  if (typeof window !== 'undefined') {
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
