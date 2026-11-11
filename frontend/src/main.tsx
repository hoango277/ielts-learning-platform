import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App';
import './index.css';
import { registerServiceWorker } from './lib/push';
import { useUi } from './store/ui';

// Service worker: nhận thông báo đẩy nhắc ôn tập (kể cả khi đã đóng tab) và cho phép cài app (PWA)
void registerServiceWorker();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 15_000 },
  },
});

function ThemedToaster() {
  const theme = useUi((s) => s.theme);
  return <Toaster position="top-center" richColors closeButton theme={theme} toastOptions={{ className: 'font-sans' }} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ThemedToaster />
    </QueryClientProvider>
  </StrictMode>,
);
