/**
 * LICBook - Main Application Controller
 * Initializes PDF.js, UI handlers, global theme, folder connector & toasts
 */

class AppController {
  constructor() {
    this.toastTimer = null;
    this.pendingScanFiles = [];
  }

  async init() {
    // 0. Initialize App Color Theme
    this.initTheme();

    // 1. Configure PDF.js worker if available
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';
    }

    // 2. Wait for storage initialization
    await window.storage.initPromise;

    // 3. Initialize components
    window.catalog.init();
    window.bookModal.init();
    window.reader.init();
    if (window.tour) {
      window.tour.init();
    }

    // 4. Bind Global UI Events
    this.bindGlobalEvents();

    // 5. Update Storage status badge & folder info
    this.updateStorageUI();
  }

  bindGlobalEvents() {
    // Top Bar "Agregar Libro" button
    const btnAddBook = document.getElementById('btn-add-book-header');
    if (btnAddBook) {
      btnAddBook.addEventListener('click', () => window.bookModal.openAddModal());
    }

    // Sidebar Unified "Vincular / Sincronizar" button
    const btnSyncDir = document.getElementById('btn-sync-directory');
    if (btnSyncDir) {
      btnSyncDir.addEventListener('click', async () => {
        if (!('showDirectoryPicker' in window)) {
          const fallbackInput = document.getElementById('fallback-folder-input');
          if (fallbackInput) fallbackInput.click();
          return;
        }

        // If not connected yet -> prompt user to select folder
        if (!window.storage.isFolderConnected()) {
          const success = await window.storage.connectLibraryDirectory();
          if (success) {
            this.updateStorageUI();
            window.catalog.render();
            this.showToast('Carpeta vinculada exitosamente');
            setTimeout(() => {
              this.triggerScanDirectory(true);
            }, 350);
          }
        } else {
          // Already connected -> scan & synchronize for new external books
          await this.triggerScanDirectory(false);
        }
      });
    }

    // Fallback Folder Input Handler (for browser compatibility)
    const fallbackFolderInput = document.getElementById('fallback-folder-input');
    if (fallbackFolderInput) {
      fallbackFolderInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.showToast('Escaneando archivos seleccionados...');
          const result = await window.storage.scanFromFiles(e.target.files);
          await this.handleScanResult(result);
        }
      });
    }

    // Scan Confirmation Modal Actions
    const scanModalOverlay = document.getElementById('scan-modal-overlay');
    const btnScanKeepBoth = document.getElementById('btn-scan-keep-both');
    const btnScanReplace = document.getElementById('btn-scan-replace-samples');
    const btnCloseScanModal = document.getElementById('btn-close-scan-modal');

    if (btnScanKeepBoth) {
      btnScanKeepBoth.addEventListener('click', async () => {
        this.closeScanModal();
        await this.executeImport(false);
      });
    }

    if (btnScanReplace) {
      btnScanReplace.addEventListener('click', async () => {
        this.closeScanModal();
        await this.executeImport(true);
      });
    }

    if (btnCloseScanModal) {
      btnCloseScanModal.addEventListener('click', () => {
        this.closeScanModal();
      });
    }

    if (scanModalOverlay) {
      scanModalOverlay.addEventListener('click', (e) => {
        if (e.target === scanModalOverlay) {
          this.closeScanModal();
        }
      });
    }

    // Export library.json
    const btnExportJson = document.getElementById('btn-export-json');
    if (btnExportJson) {
      btnExportJson.addEventListener('click', () => {
        window.storage.exportLibraryJson();
        this.showToast('Descargando base de datos library.json');
      });
    }

    // Import library.json directly
    const btnImportJson = document.getElementById('btn-import-json');
    const jsonFileInput = document.getElementById('json-file-input');
    if (btnImportJson && jsonFileInput) {
      btnImportJson.addEventListener('click', () => {
        jsonFileInput.value = '';
        jsonFileInput.click();
      });

      jsonFileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        this.showToast('Cargando base de datos JSON...');
        const result = await window.storage.importLibraryJsonFile(file);

        if (result.success) {
          this.updateStorageUI();
          window.catalog.render();
          this.showToast(`¡Biblioteca cargada! Se importaron ${result.count} libro(s) y sus notas.`);
        } else {
          alert('No se pudo cargar el archivo JSON: ' + result.error);
        }
      });
    }

    // Disconnect & Purge Browser Data Actions
    const btnDisconnectPurge = document.getElementById('btn-disconnect-purge');
    const purgeModalOverlay = document.getElementById('purge-modal-overlay');
    const btnClosePurgeModal = document.getElementById('btn-close-purge-modal');
    const btnCancelPurge = document.getElementById('btn-cancel-purge');
    const btnConfirmPurge = document.getElementById('btn-confirm-purge');

    if (btnDisconnectPurge && purgeModalOverlay) {
      btnDisconnectPurge.addEventListener('click', () => {
        this.openPurgeModal();
      });

      if (btnClosePurgeModal) btnClosePurgeModal.addEventListener('click', () => this.closePurgeModal());
      if (btnCancelPurge) btnCancelPurge.addEventListener('click', () => this.closePurgeModal());
      purgeModalOverlay.addEventListener('click', (e) => {
        if (e.target === purgeModalOverlay) this.closePurgeModal();
      });

      if (btnConfirmPurge) {
        btnConfirmPurge.addEventListener('click', async () => {
          btnConfirmPurge.disabled = true;
          btnConfirmPurge.innerHTML = '<span>Limpiando este equipo...</span>';

          await window.storage.purgeAndDisconnect();

          this.showToast('Navegador limpiado y carpeta desvinculada');
          setTimeout(() => {
            window.location.reload();
          }, 600);
        });
      }
    }

    // Theme Customizer Modal Events
    const btnThemeModal = document.getElementById('btn-theme-modal');
    const themeModalOverlay = document.getElementById('theme-modal-overlay');
    const btnCloseThemeModal = document.getElementById('btn-close-theme-modal');

    if (btnThemeModal && themeModalOverlay) {
      btnThemeModal.addEventListener('click', () => this.openThemeModal());

      if (btnCloseThemeModal) {
        btnCloseThemeModal.addEventListener('click', () => this.closeThemeModal());
      }

      themeModalOverlay.addEventListener('click', (e) => {
        if (e.target === themeModalOverlay) this.closeThemeModal();
      });

      const themeCards = themeModalOverlay.querySelectorAll('.theme-card');
      themeCards.forEach(card => {
        card.addEventListener('click', () => {
          const themeId = card.dataset.themeId;
          if (themeId) {
            this.applyTheme(themeId);
            const name = card.querySelector('.theme-card-name')?.textContent || themeId;
            this.showToast(`Tema aplicado: ${name}`);
          }
        });
      });
    }

    // Close theme modal on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const themeOverlay = document.getElementById('theme-modal-overlay');
        if (themeOverlay && themeOverlay.classList.contains('active')) {
          this.closeThemeModal();
        }
      }
    });

  }

  initTheme() {
    const savedTheme = localStorage.getItem('licbook_app_theme') || 'lemon-icecream';
    this.applyTheme(savedTheme);
  }

  applyTheme(themeId) {
    document.documentElement.dataset.appTheme = themeId;
    localStorage.setItem('licbook_app_theme', themeId);

    // Update active highlight in modal cards
    const themeCards = document.querySelectorAll('.theme-card');
    themeCards.forEach(card => {
      card.classList.toggle('active', card.dataset.themeId === themeId);
    });
  }

  openThemeModal() {
    const currentTheme = localStorage.getItem('licbook_app_theme') || 'lemon-icecream';
    this.applyTheme(currentTheme);

    const overlay = document.getElementById('theme-modal-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      void overlay.offsetWidth;
      overlay.classList.add('active');
    }
  }

  closeThemeModal() {
    const overlay = document.getElementById('theme-modal-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => {
        if (!overlay.classList.contains('active')) {
          overlay.style.display = 'none';
        }
      }, 250);
    }
  }

  openPurgeModal() {
    const purgeModalOverlay = document.getElementById('purge-modal-overlay');
    if (purgeModalOverlay) {
      purgeModalOverlay.style.display = 'flex';
      void purgeModalOverlay.offsetWidth;
      purgeModalOverlay.classList.add('active');
    }
  }

  closePurgeModal() {
    const purgeModalOverlay = document.getElementById('purge-modal-overlay');
    if (purgeModalOverlay) {
      purgeModalOverlay.classList.remove('active');
      setTimeout(() => {
        if (!purgeModalOverlay.classList.contains('active')) {
          purgeModalOverlay.style.display = 'none';
        }
      }, 250);
    }
  }

  openScanModal(count) {
    const scanModalOverlay = document.getElementById('scan-modal-overlay');
    const desc = document.getElementById('scan-modal-desc');
    if (desc) {
      desc.textContent = `Se encontraron ${count} libro(s) en tu carpeta vinculada.`;
    }
    if (scanModalOverlay) {
      scanModalOverlay.style.display = 'flex';
      void scanModalOverlay.offsetWidth;
      scanModalOverlay.classList.add('active');
    }
  }

  closeScanModal() {
    const scanModalOverlay = document.getElementById('scan-modal-overlay');
    if (scanModalOverlay) {
      scanModalOverlay.classList.remove('active');
      setTimeout(() => {
        if (!scanModalOverlay.classList.contains('active')) {
          scanModalOverlay.style.display = 'none';
        }
      }, 250);
    }
  }

  async triggerScanDirectory(isFirstConnect = false) {
    const btnSync = document.getElementById('btn-sync-directory');
    const syncIcon = btnSync ? btnSync.querySelector('.sync-icon') : null;
    if (syncIcon) syncIcon.classList.add('rotating');

    // If no directory is connected, open native picker directly in user click gesture
    if (!window.storage.isFolderConnected()) {
      if (isFirstConnect) {
        if (syncIcon) syncIcon.classList.remove('rotating');
        return;
      }
      const ok = await window.storage.connectLibraryDirectory();
      if (!ok) {
        if (syncIcon) syncIcon.classList.remove('rotating');
        return;
      }
      this.updateStorageUI();
      window.catalog.render();
    }

    this.showToast('Escaneando carpeta en busca de libros...');

    try {
      const result = await window.storage.scanDirectoryForBooks();
      if (result.status === 'no_dir') {
        if (!isFirstConnect) {
          const ok = await window.storage.connectLibraryDirectory();
          if (ok) {
            this.updateStorageUI();
            const retryResult = await window.storage.scanDirectoryForBooks();
            await this.handleScanResult(retryResult);
          }
        }
        if (syncIcon) syncIcon.classList.remove('rotating');
        return;
      }

      await this.handleScanResult(result);
    } catch (err) {
      console.error('Scan error:', err);
      this.showToast('Error al escanear la carpeta');
    } finally {
      if (syncIcon) syncIcon.classList.remove('rotating');
    }
  }

  async handleScanResult(result) {
    if (result.rehydratedCount && result.rehydratedCount > 0) {
      this.showToast(`Se vincularon ${result.rehydratedCount} archivo(s) PDF y sus portadas.`);
      window.catalog.render();
    }

    if (result.newFiles.length === 0) {
      if (result.totalFound === 0) {
        this.showToast('No se encontraron archivos PDF o ePub en la carpeta.');
      } else if (!result.rehydratedCount || result.rehydratedCount === 0) {
        this.showToast(`Tu biblioteca está al día (${result.totalFound} libros en el catálogo).`);
      }
      return;
    }

    this.pendingScanFiles = result.newFiles;

    if (result.hasSampleBooks) {
      this.openScanModal(result.newFiles.length);
    } else {
      await this.executeImport(false);
    }
  }

  async executeImport(replaceSamples) {
    if (!this.pendingScanFiles || this.pendingScanFiles.length === 0) return;

    const filesToImport = [...this.pendingScanFiles];
    this.pendingScanFiles = [];

    this.showToast(`Iniciando importación de ${filesToImport.length} libro(s)...`);

    const count = await window.storage.importBookFiles(
      filesToImport,
      replaceSamples,
      (current, total, name) => {
        this.showToast(`Procesando (${current}/${total}): ${name}`);
      }
    );

    window.catalog.render();
    if (replaceSamples) {
      this.showToast(`¡Listo! Se importaron ${count} libros y se reemplazaron los de muestra.`);
    } else {
      this.showToast(`¡Listo! Se importaron ${count} libros a tu biblioteca.`);
    }
  }

  updateStorageUI() {
    const isConnected = window.storage.isFolderConnected();
    const folderNameEl = document.getElementById('sidebar-storage-path');
    if (folderNameEl) {
      if (isConnected) {
        folderNameEl.textContent = window.storage.libraryData.folderPath || 'Mi Biblioteca';
        folderNameEl.title = `Carpeta vinculada: ${folderNameEl.textContent}`;
      } else {
        folderNameEl.textContent = 'Sin vincular';
        folderNameEl.title = 'No hay ninguna carpeta vinculada aún';
      }
    }

    const badgeEl = document.querySelector('.storage-badge');
    if (badgeEl) {
      badgeEl.classList.toggle('connected', isConnected);
    }

    const btnSync = document.getElementById('btn-sync-directory');
    if (btnSync) {
      if (isConnected) {
        btnSync.classList.add('is-connected');
        btnSync.title = 'Buscar y sincronizar libros nuevos en la carpeta vinculada';
        btnSync.innerHTML = `
          <svg class="sync-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          <span class="sync-label">Sincronizar</span>
        `;
      } else {
        btnSync.classList.remove('is-connected');
        btnSync.title = 'Vincular carpeta en disco local o nube';
        btnSync.innerHTML = `
          <svg class="sync-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <span class="sync-label">Vincular Carpeta</span>
        `;
      }
    }
  }

  /**
   * Shows a sleek toast notification
   */
  showToast(message) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = 'toast-notification';
      document.body.appendChild(toast);
    }

    toast.innerHTML = `${Icons.check(18)} <span>${message}</span>`;
    toast.classList.add('show');

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }
}

window.app = new AppController();

// Boot application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
