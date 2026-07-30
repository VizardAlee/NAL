'use client';

import { useEffect } from 'react';

const SERVICE_WORKER_PATH = '/firebase-messaging-sw.js';
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

export function PwaRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    let updateTimer: ReturnType<typeof setInterval> | undefined;
    let registration: ServiceWorkerRegistration | undefined;

    const updateServiceWorker = () => {
      void registration?.update().catch((error) => {
        console.warn('Unable to check for a PWA update.', error);
      });
    };

    const registerServiceWorker = async () => {
      try {
        registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
          scope: '/',
          updateViaCache: 'none',
        });
        updateTimer = setInterval(updateServiceWorker, UPDATE_INTERVAL_MS);
        window.addEventListener('online', updateServiceWorker);
      } catch (error) {
        console.error('Unable to register the NAL service worker.', error);
      }
    };

    void registerServiceWorker();

    return () => {
      if (updateTimer) {
        clearInterval(updateTimer);
      }
      window.removeEventListener('online', updateServiceWorker);
    };
  }, []);

  return null;
}
