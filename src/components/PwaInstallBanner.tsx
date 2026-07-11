import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X } from 'lucide-react';

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
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

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('pwa_dismissed', 'true');
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-6 right-6 z-[9999] w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[#121214]/80 p-4 shadow-2xl backdrop-blur-xl"
        >
          {/* Subtle animated gradient background effect */}
          <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-purple-500/20 blur-3xl" />
          
          <div className="relative flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 p-[2px] shadow-lg">
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-[#121214]">
                <img src="/favicon.png" alt="Jellycut" className="h-7 w-7" />
              </div>
            </div>
            
            <div className="flex-1 pt-1">
              <h3 className="text-sm font-bold text-white tracking-wide">Install Jellycut</h3>
              <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                Get the desktop app experience. Works offline, faster load times, and native feel.
              </p>
            </div>
            
            <button
              onClick={handleDismiss}
              className="group -mr-1 -mt-1 rounded-full p-1.5 transition-colors hover:bg-white/10"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-gray-500 transition-colors group-hover:text-white" />
            </button>
          </div>
          
          <div className="relative mt-4 flex gap-2">
            <button
              onClick={handleInstall}
              className="group flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-black transition-all hover:bg-gray-100 hover:scale-[1.02] active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.15)]"
            >
              <Download className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
              Install Desktop App
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
