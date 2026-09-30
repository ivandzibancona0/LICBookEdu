/**
 * LICBook - Storage & Local-First Repository Manager
 * Integrates:
 * 1. File System Access API (Local Disk, Google Drive, OneDrive, Dropbox sync folders)
 * 2. Automatic creation of "Mi Biblioteca" folder & "library.json" database
 * 3. IndexedDB local-first persistence engine
 */

class StorageManager {
  constructor() {
    this.dbName = 'LICBook_Database';
    this.dbVersion = 1;
    this.db = null;
    this.dirHandle = null; // Directory handle for "Mi Biblioteca"
    this.selectedDirHandle = null; // Root folder selected by user
    this.libraryData = {
      libraryName: 'Mi Biblioteca',
      version: '1.0.0',
      lastSync: new Date().toISOString(),
      folderPath: 'Local / Sincronizado',
      books: []
    };
    this.initPromise = this.initDB();
  }

  /**
   * Initializes IndexedDB for local-first storage
   */
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        // Store for metadata
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
        // Store for book files (PDF / ePub blobs)
        if (!db.objectStoreNames.contains('book_files')) {
          db.createObjectStore('book_files', { keyPath: 'id' });
        }
        // Store for cover images
        if (!db.objectStoreNames.contains('covers')) {
          db.createObjectStore('covers', { keyPath: 'id' });
        }
      };

      request.onsuccess = async (e) => {
        this.db = e.target.result;
        await this.loadInitialMetadata();
        resolve(this.db);
      };

      request.onerror = (e) => {
        console.error('Error opening IndexedDB:', e);
        reject(e);
      };
    });
  }

  /**
   * Loads metadata from IndexedDB or initial state
   */
  async loadInitialMetadata() {
    return new Promise((resolve) => {
      const tx = this.db.transaction(['metadata'], 'readonly');
      const store = tx.objectStore('metadata');
      const req = store.get('library_json');

      req.onsuccess = async (e) => {
        if (e.target.result && e.target.result.data) {
          this.libraryData = e.target.result.data;
        } else {
          // Initialize empty or with welcome sample books
          await this.initStarterBooks();
        }
        await this.loadStoredDirHandles();
        resolve(this.libraryData);
      };

      req.onerror = async () => {
        await this.initStarterBooks();
        await this.loadStoredDirHandles();
        resolve(this.libraryData);
      };
    });
  }

  /**
   * Saves current libraryData to IndexedDB and to physical library.json if directory is connected
   */
  async saveLibraryData() {
    this.libraryData.lastSync = new Date().toISOString();
    
    // 1. Save to IndexedDB
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction(['metadata'], 'readwrite');
      const store = tx.objectStore('metadata');
      const req = store.put({ key: 'library_json', data: this.libraryData });
      req.onsuccess = () => resolve();
      req.onerror = (err) => reject(err);
    });

    // 2. If physical directory handle is active, write library.json
    if (this.dirHandle) {
      try {
        await this.writePhysicalLibraryJson();
      } catch (err) {
        console.warn('Physical sync warning:', err);
      }
    }
  }

  /**
   * Prompts user to select or create "Mi Biblioteca" folder using File System Access API
   */
  async connectLibraryDirectory() {
    if (!('showDirectoryPicker' in window)) {
      alert('La File System Access API no está disponible en este navegador. Se usará el almacenamiento Local-First seguro (IndexedDB). Podrás exportar tu library.json en cualquier momento.');
      return false;
    }

    try {
      // Pick parent or library directory
      const selectedDir = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
      });

      this.selectedDirHandle = selectedDir;

      // Check if user selected "Mi Biblioteca" or create subfolder "Mi Biblioteca"
      let libraryDir;
      if (selectedDir.name === 'Mi Biblioteca') {
        libraryDir = selectedDir;
      } else {
        // Create or get subfolder named "Mi Biblioteca"
        libraryDir = await selectedDir.getDirectoryHandle('Mi Biblioteca', { create: true });
      }

      this.dirHandle = libraryDir;
      this.libraryData.folderPath = selectedDir.name === 'Mi Biblioteca' ? selectedDir.name : `${selectedDir.name}/${libraryDir.name}`;

      // Persist handles in IndexedDB
      await this.saveDirHandles();

      // Check if library.json already exists in this folder
      try {
        const fileHandle = await libraryDir.getFileHandle('library.json');
        const file = await fileHandle.getFile();
        const text = await file.text();
        const json = JSON.parse(text);
        if (json && json.books) {
          // Merge or use existing
          this.libraryData = json;
          await this.saveLibraryData();
        }
      } catch (e) {
        // Does not exist yet, write current libraryData
        await this.writePhysicalLibraryJson();
      }

      return true;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Error selecting directory:', err);
      }
      return false;
    }
  }

  /**
   * Persists directory handles into IndexedDB metadata store
   */
  async saveDirHandles() {
    try {
      const tx = this.db.transaction(['metadata'], 'readwrite');
      const store = tx.objectStore('metadata');
      if (this.dirHandle) {
        store.put({ key: 'dir_handle', handle: this.dirHandle });
      }
      if (this.selectedDirHandle) {
        store.put({ key: 'selected_dir_handle', handle: this.selectedDirHandle });
      }
    } catch (e) {
      console.warn('Could not persist dir handles in IndexedDB:', e);
    }
  }

  /**
   * Restores persisted directory handles from IndexedDB
   */
  async loadStoredDirHandles() {
    try {
      const tx = this.db.transaction(['metadata'], 'readonly');
      const store = tx.objectStore('metadata');
      const reqDir = store.get('dir_handle');
      const reqSel = store.get('selected_dir_handle');

      await new Promise((resolve) => {
        let doneCount = 0;
        const check = () => { if (++doneCount >= 2) resolve(); };
        reqDir.onsuccess = (e) => {
          if (e.target.result && e.target.result.handle) {
            this.dirHandle = e.target.result.handle;
          }
          check();
        };
        reqDir.onerror = check;
        reqSel.onsuccess = (e) => {
          if (e.target.result && e.target.result.handle) {
            this.selectedDirHandle = e.target.result.handle;
          }
          check();
        };
        reqSel.onerror = check;
      });
    } catch (e) {
      console.warn('Could not retrieve stored handles:', e);
    }
  }

  /**
   * Verifies or requests permission for a stored directory handle
   */
  async verifyHandlePermission(fileHandle) {
    if (!fileHandle || !fileHandle.queryPermission) return false;
    try {
      const status = await fileHandle.queryPermission({ mode: 'readwrite' });
      if (status === 'granted') return true;
      const requestStatus = await fileHandle.requestPermission({ mode: 'readwrite' });
      return requestStatus === 'granted';
    } catch (e) {
      return false;
    }
  }

  /**
   * Returns whether a local directory is currently linked
   */
  isFolderConnected() {
    return Boolean(this.dirHandle || this.selectedDirHandle);
  }

  /**
   * Writes library.json inside the "Mi Biblioteca" folder
   */
  async writePhysicalLibraryJson() {
    if (!this.dirHandle) return;
    try {
      const fileHandle = await this.dirHandle.getFileHandle('library.json', { create: true });
      const writable = await fileHandle.createWritable();
      const content = JSON.stringify(this.libraryData, null, 2);
      await writable.write(content);
      await writable.close();
    } catch (err) {
      console.error('Error writing physical library.json:', err);
    }
  }

  /**
   * Saves a physical book file in "Mi Biblioteca" if folder is connected
   */
  async savePhysicalBookFile(fileName, fileBlob) {
    if (!this.dirHandle) return;
    try {
      // Create 'libros' subfolder inside 'Mi Biblioteca'
      const booksDir = await this.dirHandle.getDirectoryHandle('libros', { create: true });
      const fileHandle = await booksDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(fileBlob);
      await writable.close();
    } catch (err) {
      console.warn('Could not save physical file copy:', err);
    }
  }

  /**
   * Saves book binary blob into IndexedDB
   */
  async saveBookBlob(bookId, blob) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['book_files'], 'readwrite');
      const store = tx.objectStore('book_files');
      const req = store.put({ id: bookId, blob: blob });
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e);
    });
  }

  /**
   * Checks if book binary blob exists in IndexedDB
   */
  async hasBookBlob(bookId) {
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(['book_files'], 'readonly');
        const store = tx.objectStore('book_files');
        const req = store.get(bookId);
        req.onsuccess = (e) => resolve(Boolean(e.target.result && e.target.result.blob));
        req.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  /**
   * Recursively searches connected directory handles for a specific fileName
   */
  async findPhysicalBookFile(fileName) {
    if (!fileName) return null;
    const targetName = fileName.toLowerCase();
    const searchInHandle = async (handle, depth = 0) => {
      if (!handle || depth > 3) return null;
      try {
        for await (const entry of handle.values()) {
          if (entry.kind === 'file' && entry.name.toLowerCase() === targetName) {
            return await entry.getFile();
          } else if (entry.kind === 'directory') {
            const found = await searchInHandle(entry, depth + 1);
            if (found) return found;
          }
        }
      } catch (e) {
        console.warn('Error searching in handle:', e);
      }
      return null;
    };

    if (this.selectedDirHandle) {
      const f = await searchInHandle(this.selectedDirHandle);
      if (f) return f;
    }
    if (this.dirHandle && this.dirHandle !== this.selectedDirHandle) {
      const f = await searchInHandle(this.dirHandle);
      if (f) return f;
    }
    return null;
  }

  /**
   * Retrieves book binary blob from IndexedDB or auto-fetches from connected directory
   */
  async getBookBlob(bookId) {
    // 1. Try IndexedDB
    const fromDB = await new Promise((resolve) => {
      try {
        const tx = this.db.transaction(['book_files'], 'readonly');
        const store = tx.objectStore('book_files');
        const req = store.get(bookId);
        req.onsuccess = (e) => resolve(e.target.result ? e.target.result.blob : null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
    if (fromDB) return fromDB;

    // 2. If missing from DB, auto-retrieve from connected directory!
    const book = this.libraryData.books.find(b => b.id === bookId);
    if (book && book.fileName && (this.selectedDirHandle || this.dirHandle)) {
      try {
        const physicalFile = await this.findPhysicalBookFile(book.fileName);
        if (physicalFile) {
          await this.saveBookBlob(bookId, physicalFile);
          const existingCover = await this.getCover(bookId);
          if (!existingCover && physicalFile.name.toLowerCase().endsWith('.pdf')) {
            const extracted = await this.extractPdfCoverAndPages(physicalFile);
            if (extracted.coverDataUrl) {
              await this.saveCover(bookId, extracted.coverDataUrl);
              book.coverDataUrl = extracted.coverDataUrl;
            }
          }
          return physicalFile;
        }
      } catch (err) {
        console.warn('Could not auto-retrieve file from folder:', err);
      }
    }

    return null;
  }

  /**
   * Saves cover image data URL
   */
  async saveCover(bookId, dataUrl) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['covers'], 'readwrite');
      const store = tx.objectStore('covers');
      const req = store.put({ id: bookId, dataUrl: dataUrl });
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e);
    });
  }

  /**
   * Gets cover image data URL
   */
  async getCover(bookId) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['covers'], 'readonly');
      const store = tx.objectStore('covers');
      const req = store.get(bookId);
      req.onsuccess = (e) => resolve(e.target.result ? e.target.result.dataUrl : null);
      req.onerror = (e) => reject(e);
    });
  }

  /**
   * Adds or updates a book in the catalog
   */
  async saveBook(bookMeta, fileBlob = null, coverDataUrl = null) {
    const existingIndex = this.libraryData.books.findIndex(b => b.id === bookMeta.id);
    
    if (coverDataUrl) {
      await this.saveCover(bookMeta.id, coverDataUrl);
      bookMeta.hasCover = true;
    }

    if (fileBlob) {
      await this.saveBookBlob(bookMeta.id, fileBlob);
      // Also save physical copy if directory is connected
      if (bookMeta.fileName) {
        await this.savePhysicalBookFile(bookMeta.fileName, fileBlob);
      }
    }

    if (existingIndex >= 0) {
      this.libraryData.books[existingIndex] = {
        ...this.libraryData.books[existingIndex],
        ...bookMeta
      };
    } else {
      this.libraryData.books.unshift(bookMeta);
    }

    await this.saveLibraryData();
    return bookMeta;
  }

  /**
   * Deletes a book
   */
  async deleteBook(bookId) {
    this.libraryData.books = this.libraryData.books.filter(b => b.id !== bookId);
    
    // Remove from IndexedDB stores
    const tx = this.db.transaction(['book_files', 'covers'], 'readwrite');
    tx.objectStore('book_files').delete(bookId);
    tx.objectStore('covers').delete(bookId);

    await this.saveLibraryData();
  }

  /**
   * Updates reading progress for a book
   */
  async updateProgress(bookId, currentPage, totalPages) {
    const book = this.libraryData.books.find(b => b.id === bookId);
    if (book) {
      book.currentPage = currentPage;
      book.totalPages = totalPages;
      book.progressPercent = Math.min(100, Math.round((currentPage / totalPages) * 100));
      book.lastRead = new Date().toISOString();
      await this.saveLibraryData();
    }
  }

  /**
   * Toggles book favorite status
   */
  async toggleFavorite(bookId) {
    const book = this.libraryData.books.find(b => b.id === bookId);
    if (book) {
      book.isFavorite = !book.isFavorite;
      await this.saveLibraryData();
      return book.isFavorite;
    }
    return false;
  }

  /**
   * Toggles bookmark on a specific page
   */
  async toggleBookmark(bookId, pageNum) {
    const book = this.libraryData.books.find(b => b.id === bookId);
    if (!book) return false;

    if (!Array.isArray(book.bookmarks)) {
      book.bookmarks = [];
    }

    const index = book.bookmarks.findIndex(bm => (typeof bm === 'object' ? bm.page : bm) === pageNum);
    let isBookmarked = false;

    if (index >= 0) {
      book.bookmarks.splice(index, 1);
      isBookmarked = false;
    } else {
      book.bookmarks.push({
        page: pageNum,
        createdAt: new Date().toISOString()
      });
      // Sort bookmarks ascending by page
      book.bookmarks.sort((a, b) => {
        const pageA = typeof a === 'object' ? a.page : a;
        const pageB = typeof b === 'object' ? b.page : b;
        return pageA - pageB;
      });
      isBookmarked = true;
    }

    await this.saveLibraryData();
    return isBookmarked;
  }

  /**
   * Retrieves bookmarks for a book
   */
  getBookmarks(bookId) {
    const book = this.libraryData.books.find(b => b.id === bookId);
    if (!book || !Array.isArray(book.bookmarks)) return [];
    return book.bookmarks.map(bm => typeof bm === 'object' ? {
      page: bm.page,
      createdAt: bm.createdAt || null,
      quote: bm.quote || '',
      note: bm.note || ''
    } : { page: bm, createdAt: null, quote: '', note: '' });
  }

  /**
   * Saves or updates quote and notes for a specific bookmark
   */
  async saveBookmarkNote(bookId, pageNum, quote = '', note = '') {
    const book = this.libraryData.books.find(b => b.id === bookId);
    if (!book) return null;

    if (!Array.isArray(book.bookmarks)) {
      book.bookmarks = [];
    }

    let bm = book.bookmarks.find(item => (typeof item === 'object' ? item.page : item) === pageNum);
    if (!bm) {
      bm = {
        page: pageNum,
        createdAt: new Date().toISOString(),
        quote: quote.trim(),
        note: note.trim()
      };
      book.bookmarks.push(bm);
      book.bookmarks.sort((a, b) => {
        const pageA = typeof a === 'object' ? a.page : a;
        const pageB = typeof b === 'object' ? b.page : b;
        return pageA - pageB;
      });
    } else {
      if (typeof bm !== 'object') {
        const idx = book.bookmarks.indexOf(bm);
        bm = { page: pageNum, createdAt: new Date().toISOString() };
        book.bookmarks[idx] = bm;
      }
      bm.quote = quote.trim();
      bm.note = note.trim();
      bm.updatedAt = new Date().toISOString();
    }

    await this.saveLibraryData();
    return bm;
  }

  /**
   * Retrieves notebook notes for a specific book
   */
  getBookNotes(bookId) {
    const book = this.libraryData.books.find(b => b.id === bookId);
    return (book && typeof book.notes === 'string') ? book.notes : '';
  }

  /**
   * Saves notebook notes for a specific book
   */
  async saveBookNotes(bookId, notes = '') {
    const book = this.libraryData.books.find(b => b.id === bookId);
    if (!book) return;
    book.notes = notes;
    book.notesUpdatedAt = new Date().toISOString();
    await this.saveLibraryData();
  }

  /**
   * Checks if a specific page is bookmarked
   */
  isPageBookmarked(bookId, pageNum) {
    const book = this.libraryData.books.find(b => b.id === bookId);
    if (!book || !Array.isArray(book.bookmarks)) return false;
    return book.bookmarks.some(bm => (typeof bm === 'object' ? bm.page : bm) === pageNum);
  }

  /**
   * Removes a bookmark directly
   */
  async removeBookmark(bookId, pageNum) {
    const book = this.libraryData.books.find(b => b.id === bookId);
    if (!book || !Array.isArray(book.bookmarks)) return;
    book.bookmarks = book.bookmarks.filter(bm => (typeof bm === 'object' ? bm.page : bm) !== pageNum);
    await this.saveLibraryData();
  }

  /**
   * Exports library.json directly as a downloadable file
   */
  exportLibraryJson() {
    const jsonString = JSON.stringify(this.libraryData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'library.json';
    a.click();
    window.URL.revokeObjectURL(url);
  }

  /**
   * Imports a library.json file directly into the application
   */
  async importLibraryJsonFile(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data || !Array.isArray(data.books)) {
        throw new Error('El archivo no contiene una estructura válida de biblioteca LICBook (falta la lista de libros).');
      }

      this.libraryData = {
        libraryName: data.libraryName || 'Mi Biblioteca',
        version: data.version || '1.0.0',
        lastSync: new Date().toISOString(),
        folderPath: data.folderPath || 'Importado desde JSON',
        books: data.books
      };

      await this.saveLibraryData();

      return { success: true, count: data.books.length };
    } catch (err) {
      console.error('Error importing library.json:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Disconnects physical directory, purges all IndexedDB stores and LocalStorage traces,
   * leaving the host browser completely clean without affecting the physical library.json or book files.
   */
  async purgeAndDisconnect() {
    try {
      // 1. Final safe commit to physical file if directory is connected
      if (this.dirHandle) {
        try {
          await this.writePhysicalLibraryJson();
        } catch (e) {
          console.warn('Final physical write warning:', e);
        }
      }

      // 2. Disconnect in-memory directory handles
      this.dirHandle = null;
      this.selectedDirHandle = null;

      // 3. Clear all stores in IndexedDB
      if (this.db) {
        const storeNames = ['metadata', 'book_files', 'covers'];
        await new Promise((resolve) => {
          try {
            const tx = this.db.transaction(storeNames, 'readwrite');
            for (const s of storeNames) {
              if (this.db.objectStoreNames.contains(s)) {
                tx.objectStore(s).clear();
              }
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch (e) {
            resolve();
          }
        });
      }

      // 4. Remove all LICBook entries from localStorage and sessionStorage
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('licbook_') || k.includes('LICBook'))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        sessionStorage.clear();
      } catch (e) {}

      // 5. Reset internal state
      this.libraryData = {
        libraryName: 'Mi Biblioteca',
        version: '1.0.0',
        lastSync: new Date().toISOString(),
        folderPath: 'Local / Sincronizado',
        books: []
      };

      return true;
    } catch (err) {
      console.error('Error during purge and disconnect:', err);
      return false;
    }
  }

  /**
   * Removes starter sample books from the library and IndexedDB
   */
  async removeSampleBooks() {
    const sampleBooks = this.libraryData.books.filter(b => b.id && b.id.startsWith('book-sample-'));
    if (sampleBooks.length === 0) return;

    this.libraryData.books = this.libraryData.books.filter(b => !b.id || !b.id.startsWith('book-sample-'));

    try {
      const tx = this.db.transaction(['book_files', 'covers'], 'readwrite');
      const bookFilesStore = tx.objectStore('book_files');
      const coversStore = tx.objectStore('covers');

      for (const b of sampleBooks) {
        bookFilesStore.delete(b.id);
        coversStore.delete(b.id);
      }

      await new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (err) {
      console.warn('Error clearing sample books from stores:', err);
    }

    await this.saveLibraryData();
  }

  /**
   * Recursively discovers all .pdf and .epub files in a directory handle
   */
  async collectBookFiles(dirHandle, collected = new Map(), maxDepth = 3, currentDepth = 0) {
    if (!dirHandle) return Array.from(collected.values());

    try {
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          const lowerName = entry.name.toLowerCase();
          if (lowerName.endsWith('.pdf') || lowerName.endsWith('.epub')) {
            if (!collected.has(entry.name)) {
              try {
                const file = await entry.getFile();
                collected.set(entry.name, file);
              } catch (err) {
                console.warn('Could not read file:', entry.name, err);
              }
            }
          }
        } else if (entry.kind === 'directory' && currentDepth < maxDepth) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '$RECYCLE.BIN') {
            try {
              await this.collectBookFiles(entry, collected, maxDepth, currentDepth + 1);
            } catch (err) {
              console.warn('Could not open subfolder:', entry.name, err);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Error iterating directory:', dirHandle.name, err);
    }

    return Array.from(collected.values());
  }

  /**
   * Extracts Page 1 cover and total pages from a PDF File
   */
  async extractPdfCoverAndPages(file) {
    if (!window.pdfjsLib) return { totalPages: 1, coverDataUrl: null };
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
      const pdfDoc = await loadingTask.promise;
      const totalPages = pdfDoc.numPages || 1;

      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1.2 });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      const coverDataUrl = canvas.toDataURL('image/webp', 0.85);

      return { totalPages, coverDataUrl };
    } catch (err) {
      console.warn('Error extracting PDF page 1:', file.name, err);
      return { totalPages: 1, coverDataUrl: null };
    }
  }

  /**
   * Derives human-friendly title and author from a filename
   */
  parseBookFileName(fileName) {
    const baseName = fileName.replace(/\.(pdf|epub)$/i, '');
    let title = baseName;
    let authors = ['Autor Local'];

    if (baseName.includes(' - ')) {
      const parts = baseName.split(' - ');
      if (parts.length >= 2) {
        authors = [parts[0].replace(/[_]/g, ' ').trim()];
        title = parts.slice(1).join(' - ').replace(/[_]/g, ' ').trim();
      }
    } else {
      title = baseName.replace(/[_]/g, ' ').replace(/[-]/g, ' ').trim();
      if (title === title.toLowerCase()) {
        title = title.replace(/\b\w/g, l => l.toUpperCase());
      }
    }

    return { title: title || 'Sin Título', authors };
  }

  /**
   * Scans linked directory for new PDF and ePub books
   */
  async scanDirectoryForBooks() {
    // If we have stored handles, verify permissions
    if (this.selectedDirHandle) {
      const ok = await this.verifyHandlePermission(this.selectedDirHandle);
      if (!ok) this.selectedDirHandle = null;
    }
    if (this.dirHandle) {
      const ok = await this.verifyHandlePermission(this.dirHandle);
      if (!ok) this.dirHandle = null;
    }

    if (!this.selectedDirHandle && !this.dirHandle) {
      return { status: 'no_dir', totalFound: 0, newFiles: [], hasSampleBooks: false };
    }

    const collected = new Map();
    if (this.selectedDirHandle) {
      await this.collectBookFiles(this.selectedDirHandle, collected, 3, 0);
    }
    if (this.dirHandle && this.dirHandle !== this.selectedDirHandle) {
      await this.collectBookFiles(this.dirHandle, collected, 3, 0);
    }

    const allFiles = Array.from(collected.values());
    console.log(`Scan found ${allFiles.length} book files:`, allFiles.map(f => f.name));

    const existingFileNames = new Set(
      this.libraryData.books
        .filter(b => b.fileName)
        .map(b => b.fileName.toLowerCase())
    );

    // 1. Auto-rehydrate any existing books that don't have their PDF blob or cover in IndexedDB yet
    let rehydratedCount = 0;
    for (const file of allFiles) {
      const lowerName = file.name.toLowerCase();
      const matchedBook = this.libraryData.books.find(b => b.fileName && b.fileName.toLowerCase() === lowerName);
      if (matchedBook) {
        const hasBlob = await this.hasBookBlob(matchedBook.id);
        if (!hasBlob) {
          await this.saveBookBlob(matchedBook.id, file);
          rehydratedCount++;
        }
        const existingCover = await this.getCover(matchedBook.id);
        if (!existingCover && file.name.toLowerCase().endsWith('.pdf')) {
          const extracted = await this.extractPdfCoverAndPages(file);
          if (extracted.coverDataUrl) {
            await this.saveCover(matchedBook.id, extracted.coverDataUrl);
            matchedBook.coverDataUrl = extracted.coverDataUrl;
          }
          if (extracted.totalPages > 1 && (!matchedBook.totalPages || matchedBook.totalPages <= 1)) {
            matchedBook.totalPages = extracted.totalPages;
          }
        }
      }
    }
    if (rehydratedCount > 0) {
      await this.saveLibraryData();
      if (window.catalog) window.catalog.render();
    }

    const newFiles = allFiles.filter(f => !existingFileNames.has(f.name.toLowerCase()));
    const hasSampleBooks = this.libraryData.books.some(b => b.id && b.id.startsWith('book-sample-'));

    return {
      status: 'scanned',
      totalFound: allFiles.length,
      newFiles: newFiles,
      rehydratedCount: rehydratedCount,
      hasSampleBooks: hasSampleBooks
    };
  }

  /**
   * Scans a FileList from <input type="file" webkitdirectory>
   */
  async scanFromFiles(fileList) {
    const allFiles = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.pdf') || lower.endsWith('.epub')) {
        allFiles.push(file);
      }
    }

    const existingFileNames = new Set(
      this.libraryData.books
        .filter(b => b.fileName)
        .map(b => b.fileName.toLowerCase())
    );

    // Rehydrate existing books from file list
    let rehydratedCount = 0;
    for (const file of allFiles) {
      const lowerName = file.name.toLowerCase();
      const matchedBook = this.libraryData.books.find(b => b.fileName && b.fileName.toLowerCase() === lowerName);
      if (matchedBook) {
        const hasBlob = await this.hasBookBlob(matchedBook.id);
        if (!hasBlob) {
          await this.saveBookBlob(matchedBook.id, file);
          rehydratedCount++;
        }
        const existingCover = await this.getCover(matchedBook.id);
        if (!existingCover && file.name.toLowerCase().endsWith('.pdf')) {
          const extracted = await this.extractPdfCoverAndPages(file);
          if (extracted.coverDataUrl) {
            await this.saveCover(matchedBook.id, extracted.coverDataUrl);
            matchedBook.coverDataUrl = extracted.coverDataUrl;
          }
          if (extracted.totalPages > 1 && (!matchedBook.totalPages || matchedBook.totalPages <= 1)) {
            matchedBook.totalPages = extracted.totalPages;
          }
        }
      }
    }
    if (rehydratedCount > 0) {
      await this.saveLibraryData();
      if (window.catalog) window.catalog.render();
    }

    const newFiles = allFiles.filter(f => !existingFileNames.has(f.name.toLowerCase()));
    const hasSampleBooks = this.libraryData.books.some(b => b.id && b.id.startsWith('book-sample-'));

    return {
      status: 'scanned',
      totalFound: allFiles.length,
      newFiles: newFiles,
      rehydratedCount: rehydratedCount,
      hasSampleBooks: hasSampleBooks
    };
  }

  /**
   * Imports detected book files into the library
   */
  async importBookFiles(files, replaceSamples = false, onProgress = null) {
    if (replaceSamples) {
      await this.removeSampleBooks();
    }

    let importedCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (onProgress) {
        onProgress(i + 1, files.length, file.name);
      }

      const isPdf = file.name.toLowerCase().endsWith('.pdf');
      const { title, authors } = this.parseBookFileName(file.name);

      let totalPages = 1;
      let coverDataUrl = null;

      if (isPdf) {
        const extracted = await this.extractPdfCoverAndPages(file);
        totalPages = extracted.totalPages;
        coverDataUrl = extracted.coverDataUrl;
      }

      const bookId = `book-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const bookMeta = {
        id: bookId,
        title: title,
        authors: authors,
        year: new Date(file.lastModified || Date.now()).getFullYear(),
        edition: 'Edición Digital',
        publisher: 'Archivo Local',
        genre: isPdf ? 'Documento PDF' : 'Libro ePub',
        description: `Archivo local sincronizado desde carpeta vinculada: ${file.name}`,
        fileName: file.name,
        fileSize: file.size,
        totalPages: totalPages,
        currentPage: 1,
        progressPercent: 0,
        lastRead: new Date().toISOString(),
        isFavorite: false,
        hasCover: Boolean(coverDataUrl)
      };

      if (!coverDataUrl) {
        coverDataUrl = this.generateSampleCover(bookMeta);
        bookMeta.hasCover = true;
      }

      await this.saveBook(bookMeta, file, coverDataUrl);
      importedCount++;
    }

    return importedCount;
  }

  /**
   * Initializes high-quality starter sample books if library is fresh
   */
  async initStarterBooks() {
    const starterBooks = [
      {
        id: 'book-sample-1',
        title: 'Cien Años de Soledad',
        authors: ['Gabriel García Márquez'],
        year: 1967,
        edition: '1ra Edición Conmemorativa',
        publisher: 'Editorial Sudamericana',
        genre: 'Realismo Mágico',
        description: 'La historia de la familia Buendía a lo largo de siete generaciones en el mítico pueblo de Macondo.',
        fileName: 'cien_anos_de_soledad.pdf',
        fileSize: 1420580,
        totalPages: 24,
        currentPage: 6,
        progressPercent: 25,
        lastRead: new Date().toISOString(),
        isFavorite: true,
        hasCover: true
      },
      {
        id: 'book-sample-2',
        title: 'El Principito',
        authors: ['Antoine de Saint-Exupéry'],
        year: 1943,
        edition: 'Edición Ilustrada de Bolsillo',
        publisher: 'Reynal & Hitchcock',
        genre: 'Fábula Filosófica',
        description: 'Un aviador perdido en el desierto conoce a un pequeño príncipe de otro planeta.',
        fileName: 'el_principito.pdf',
        fileSize: 980120,
        totalPages: 16,
        currentPage: 8,
        progressPercent: 50,
        lastRead: new Date(Date.now() - 3600000).toISOString(),
        isFavorite: true,
        hasCover: true
      },
      {
        id: 'book-sample-3',
        title: 'Don Quijote de la Mancha',
        authors: ['Miguel de Cervantes'],
        year: 1605,
        edition: 'Clásicos Universales',
        publisher: 'Francisco de Robles',
        genre: 'Novela Clásica',
        description: 'Las célebres aventuras del ingenioso hidalgo Don Quijote y su fiel escudero Sancho Panza.',
        fileName: 'don_quijote.pdf',
        fileSize: 2150340,
        totalPages: 32,
        currentPage: 1,
        progressPercent: 3,
        lastRead: new Date(Date.now() - 86400000).toISOString(),
        isFavorite: false,
        hasCover: true
      },
      {
        id: 'book-sample-4',
        title: 'Clean Code: Manual de Desarrollo Ágil',
        authors: ['Robert C. Martin'],
        year: 2008,
        edition: '1ra Edición Técnica',
        publisher: 'Prentice Hall',
        genre: 'Tecnología y Software',
        description: 'Mejores prácticas para escribir código limpio, mantenible y profesional.',
        fileName: 'clean_code.pdf',
        fileSize: 3120400,
        totalPages: 40,
        currentPage: 15,
        progressPercent: 38,
        lastRead: new Date(Date.now() - 172800000).toISOString(),
        isFavorite: false,
        hasCover: true
      }
    ];

    this.libraryData.books = starterBooks;
    await this.saveLibraryData();

    // Create realistic sample covers for the starters
    for (const b of starterBooks) {
      const coverUrl = this.generateSampleCover(b);
      await this.saveCover(b.id, coverUrl);
    }
  }

  /**
   * Generates a stylized editorial cover for starter books
   */
  generateSampleCover(book) {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 580;
    const ctx = canvas.getContext('2d');

    // Palette background based on genre
    const gradients = {
      'Realismo Mágico': ['#0F223D', '#1B3B6F'],
      'Fábula Filosófica': ['#122718', '#265431'],
      'Novela Clásica': ['#2B1E11', '#5C4028'],
      'Tecnología y Software': ['#091322', '#142540']
    };

    const colors = gradients[book.genre] || ['#0F223D', '#162A45'];
    const grad = ctx.createLinearGradient(0, 0, 400, 580);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 400, 580);

    // Decorative frame
    ctx.strokeStyle = '#8DC63F';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, 360, 540);

    ctx.strokeStyle = 'rgba(254, 212, 2, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(26, 26, 348, 528);

    // Header Publisher
    ctx.fillStyle = '#A5E2DC';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '2px';
    ctx.fillText(book.publisher.toUpperCase(), 200, 65);

    // Title
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px sans-serif';
    const words = book.title.split(' ');
    let line = '';
    let y = 180;
    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > 300 && i > 0) {
        ctx.fillText(line, 200, y);
        line = words[i] + ' ';
        y += 34;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, 200, y);

    // Gold accent divider
    ctx.fillStyle = '#FED402';
    ctx.fillRect(150, y + 25, 100, 3);

    // Author
    ctx.fillStyle = '#8DC63F';
    ctx.font = '600 16px sans-serif';
    ctx.fillText(book.authors.join(', '), 200, y + 60);

    // Genre & Year footer
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '13px sans-serif';
    ctx.fillText(`${book.genre} • ${book.year}`, 200, 510);

    // Spine 3D shadow on left
    const spineGrad = ctx.createLinearGradient(0, 0, 30, 0);
    spineGrad.addColorStop(0, 'rgba(255,255,255,0.25)');
    spineGrad.addColorStop(0.3, 'rgba(0,0,0,0.3)');
    spineGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spineGrad;
    ctx.fillRect(0, 0, 30, 580);

    return canvas.toDataURL('image/webp', 0.9);
  }
}

// Global instance
window.storage = new StorageManager();
