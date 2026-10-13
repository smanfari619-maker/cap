import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Monitor } from 'lucide-react';
import DownloadAppModal from './dashboard/DownloadAppModal';

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  useEffect(() => {
    // If running inside the Electron native app, don't show the banner
    if (typeof window !== 'undefined' && (window as any).electron?.isElectron) {
      return;
    }

    // Check if the app is already installed or if the user previously dismissed
    if (window.matchMedia('(display-mode: standalone)').matches || localStorage.getItem('pwa_dismissed')) {
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      
      // Delay showing the prompt slightly so it doesn't overwhelm the user immediately
      setTimeout(() => {
        setIsVisible(true);
      }, 3000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If on desktop browser without beforeinstallprompt firing immediately, also show after 5s
    const timer = setTimeout(() => {
      if (!localStorage.getItem('pwa_dismissed')) {
        setIsVisible(true);
      }
    }, 5000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearTimeout(timer);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      // Show the browser PWA install prompt
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      }
      setDeferredPrompt(null);
      setIsVisible(false);
    } else {
      // Open the Mac/Windows download modal
      setShowDownloadModal(true);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('pwa_dismissed', 'true');
  };

  if (typeof window !== 'undefined' && (window as any).electron?.isElectron) {
    return null;
  }

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-6 right-6 z-[9999] w-[360px] overflow-hidden rounded-2xl border border-white/10 bg-[#121214]/90 p-4 shadow-2xl backdrop-blur-xl"
          >
            {/* Subtle animated gradient background effect */}
            <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-sky-500/20 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" />
            
            <div className="relative flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 p-[2px] shadow-lg">
                <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-[#121214]">
                  <img src="/favicon.png" alt="Jellycut" className="h-7 w-7" />
                </div>
              </div>
              
              <div className="flex-1 pt-1">
                <h3 className="text-sm font-bold text-white tracking-wide">Get Jellycut Desktop</h3>
                <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                  Available for macOS &amp; Windows with hardware 4K acceleration, or install as app.
                </p>
              </div>
              
              <button
                onClick={handleDismiss}
                className="group -mr-1 -mt-1 rounded-full p-1.5 transition-colors hover:bg-white/10 cursor-pointer"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-gray-500 transition-colors group-hover:text-white" />
              </button>
            </div>
            
            <div className="relative mt-4 flex gap-2">
              <button
                onClick={() => setShowDownloadModal(true)}
                className="group flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-2 text-xs font-bold text-white transition-all hover:brightness-110 active:scale-95 shadow-md cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
                Download App
              </button>
              {deferredPrompt && (
                <button
                  onClick={handleInstall}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/15 transition-all cursor-pointer"
                  title="Install as Progressive Web App"
                >
                  <Monitor className="h-3.5 w-3.5" />
                  <span>Install</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <DownloadAppModal 
        isOpen={showDownloadModal} 
        onClose={() => setShowDownloadModal(false)} 
      />
    </>
  );
}
