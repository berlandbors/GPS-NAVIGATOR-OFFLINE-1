// Register Service Worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('> SERVICE WORKER REGISTERED:', registration.scope);

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('> NEW VERSION AVAILABLE - RELOAD TO UPDATE');
              showUpdateBanner();
            }
          });
        });
      })
      .catch((error) => {
        console.error('> SERVICE WORKER REGISTRATION FAILED:', error);
      });
  });

  // Handle offline/online status
  function updateConnectionStatus(isOnline) {
    console.log(isOnline ? '> NETWORK: ONLINE' : '> NETWORK: OFFLINE');
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
      statusEl.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
      statusEl.classList.toggle('online', isOnline);
    }
  }

  window.addEventListener('online', () => updateConnectionStatus(true));
  window.addEventListener('offline', () => updateConnectionStatus(false));
} else {
  console.warn('> SERVICE WORKERS NOT SUPPORTED');
}

// Show a non-blocking update banner instead of blocking confirm()
function showUpdateBanner() {
  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.textContent = 'New version available! ';

  const reloadBtn = document.createElement('button');
  reloadBtn.textContent = 'Reload';
  reloadBtn.addEventListener('click', () => window.location.reload());

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.addEventListener('click', () => banner.remove());

  banner.appendChild(reloadBtn);
  banner.appendChild(dismissBtn);
  document.body.appendChild(banner);
}
