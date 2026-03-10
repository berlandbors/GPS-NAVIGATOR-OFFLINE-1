/**
 * PWA Installation Manager
 * Handles beforeinstallprompt event and provides install UI
 */
export class PWAInstaller {
  constructor() {
    /** @type {Event|null} */
    this.deferredPrompt = null;
    this.installPromo = null;
    this.installBtn = null;
    this.dismissBtn = null;
    this.isInstalled = false;
  }

  /**
   * Initialize the PWA installer
   */
  init() {
    this.installPromo = document.getElementById('installPromo');
    this.installBtn = document.getElementById('installAppBtn');
    this.dismissBtn = document.getElementById('dismissInstallBtn');

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('[PWA] App is already installed');
      this.isInstalled = true;
      this.hideInstallPromo();
      return;
    }

    // Check if user previously dismissed the prompt
    if (localStorage.getItem('pwa-install-dismissed') === 'true') {
      console.log('[PWA] User previously dismissed install prompt');
      return;
    }

    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('[PWA] beforeinstallprompt event fired');
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallPromo();
    });

    // Listen for successful installation
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App was installed successfully');
      this.isInstalled = true;
      this.hideInstallPromo();
      this.showInstallSuccess();
    });

    // Attach event listeners
    if (this.installBtn) {
      this.installBtn.addEventListener('click', () => this.installApp());
    }
    if (this.dismissBtn) {
      this.dismissBtn.addEventListener('click', () => this.dismissInstallPromo());
    }
  }

  /**
   * Show the install promotion banner
   */
  showInstallPromo() {
    if (this.installPromo) {
      this.installPromo.style.display = 'block';
      // Animate in
      setTimeout(() => {
        this.installPromo.classList.add('visible');
      }, 100);
    }
  }

  /**
   * Hide the install promotion banner
   */
  hideInstallPromo() {
    if (this.installPromo) {
      this.installPromo.classList.remove('visible');
      setTimeout(() => {
        this.installPromo.style.display = 'none';
      }, 300);
    }
  }

  /**
   * Dismiss the install promo and remember user preference
   */
  dismissInstallPromo() {
    localStorage.setItem('pwa-install-dismissed', 'true');
    this.hideInstallPromo();
    console.log('[PWA] Install promo dismissed by user');
  }

  /**
   * Trigger the installation prompt
   */
  async installApp() {
    if (!this.deferredPrompt) {
      console.log('[PWA] No deferred prompt available');
      alert('> Installation is not available. Try adding to home screen from browser menu.');
      return;
    }

    // Show the install prompt
    this.deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await this.deferredPrompt.userChoice;
    console.log(`[PWA] User response: ${outcome}`);

    if (outcome === 'accepted') {
      console.log('[PWA] User accepted the install prompt');
    } else {
      console.log('[PWA] User dismissed the install prompt');
    }

    // Clear the deferred prompt
    this.deferredPrompt = null;
    this.hideInstallPromo();
  }

  /**
   * Show success message after installation
   */
  showInstallSuccess() {
    const output = document.getElementById('output');
    if (output) {
      output.innerHTML = `
        <div class="success">
          &gt; SUCCESS: GPS-NAV INSTALLED!<br>
          &gt; You can now use the app from your home screen<br>
          &gt; Works 100% offline with AI neural network<span class="cursor">█</span>
        </div>
      `;
    }
  }

  /**
   * Check if installation is supported
   * @returns {boolean}
   */
  static isInstallSupported() {
    return window.matchMedia('(display-mode: standalone)').matches;
  }
}
