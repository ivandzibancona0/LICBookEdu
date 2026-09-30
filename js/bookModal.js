/**
 * LICBook - Add & Edit Book Modal Controller
 * Handles:
 * - PDF/ePub file selection and drop
 * - Automatic page 1 extraction from PDF as book cover using PDF.js
 * - Custom cover replacement
 * - Form validation and metadata saving
 */

class BookModalManager {
  constructor() {
    this.currentBookId = null;
    this.currentFileBlob = null;
    this.currentCoverDataUrl = null;
    this.currentTotalPages = 1;

    this.modalOverlay = null;
    this.form = null;
    this.fileInput = null;
    this.coverInput = null;
    this.dropzone = null;
    this.coverPreviewImg = null;
    this.dropzoneLabel = null;
  }

  init() {
    this.modalOverlay = document.getElementById('book-modal-overlay');
    this.form = document.getElementById('book-form');
    this.fileInput = document.getElementById('book-file-input');
    this.coverInput = document.getElementById('book-cover-input');
    this.dropzone = document.getElementById('file-dropzone');
    this.coverPreviewImg = document.getElementById('modal-cover-preview');
    this.dropzoneLabel = document.getElementById('dropzone-file-name');

    this.bindEvents();
  }

  bindEvents() {
    // Open/Close buttons
    const btnClose = document.getElementById('btn-close-modal');
    const btnCancel = document.getElementById('btn-cancel-modal');
    if (btnClose) btnClose.addEventListener('click', () => this.closeModal());
    if (btnCancel) btnCancel.addEventListener('click', () => this.closeModal());

    // Close on overlay click outside card
    if (this.modalOverlay) {
      this.modalOverlay.addEventListener('click', (e) => {
        if (e.target === this.modalOverlay) this.closeModal();
      });
    }

    // Dropzone click & drag events
    if (this.dropzone) {
      this.dropzone.addEventListener('click', () => this.fileInput.click());
      this.dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        this.dropzone.classList.add('dragover');
      });
      this.dropzone.addEventListener('dragleave', () => {
        this.dropzone.classList.remove('dragover');
      });
      this.dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        this.dropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.handleFileSelected(e.dataTransfer.files[0]);
        }
      });
    }

    // File input change
    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleFileSelected(e.target.files[0]);
        }
      });
    }

    // Custom cover button & input
    const btnCustomCover = document.getElementById('btn-pick-custom-cover');
    if (btnCustomCover && this.coverInput) {
      btnCustomCover.addEventListener('click', () => this.coverInput.click());
    }

    if (this.coverInput) {
      this.coverInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleCustomCoverSelected(e.target.files[0]);
        }
      });
    }

    // Form submit
    if (this.form) {
      this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }
  }

  openAddModal() {
    this.currentBookId = null;
    this.currentFileBlob = null;
    this.currentCoverDataUrl = null;
    this.currentTotalPages = 1;

    document.getElementById('modal-title-text').textContent = 'Agregar Libro a Mi Biblioteca';
    this.form.reset();
    document.getElementById('book-id-input').value = '';
    this.dropzoneLabel.textContent = 'Arrastra aquí tu archivo PDF o ePub o haz clic para seleccionarlo';
    this.coverPreviewImg.src = '';
    document.getElementById('cover-preview-section').style.display = 'none';

    this.modalOverlay.classList.add('active');
  }

  async openEditModal(bookId) {
    const book = window.storage.libraryData.books.find(b => b.id === bookId);
    if (!book) return;

    this.currentBookId = book.id;
    this.currentFileBlob = null;
    this.currentTotalPages = book.totalPages || 1;

    document.getElementById('modal-title-text').textContent = 'Editar Información del Libro';
    document.getElementById('book-id-input').value = book.id;
    document.getElementById('book-title').value = book.title || '';
    document.getElementById('book-authors').value = (book.authors || []).join(', ');
    document.getElementById('book-year').value = book.year || '';
    document.getElementById('book-edition').value = book.edition || '';
    document.getElementById('book-publisher').value = book.publisher || '';
    document.getElementById('book-genre').value = book.genre || '';
    document.getElementById('book-description').value = book.description || '';

    this.dropzoneLabel.textContent = book.fileName ? `Archivo actual: ${book.fileName} (puedes cambiarlo)` : 'Seleccionar nuevo archivo';

    // Load existing cover
    const existingCover = await window.storage.getCover(book.id);
    if (existingCover) {
      this.currentCoverDataUrl = existingCover;
      this.coverPreviewImg.src = existingCover;
      document.getElementById('cover-preview-section').style.display = 'flex';
      document.getElementById('cover-source-info').textContent = 'Portada actual del libro';
    } else {
      document.getElementById('cover-preview-section').style.display = 'none';
    }

    this.modalOverlay.classList.add('active');
  }

  closeModal() {
    this.modalOverlay.classList.remove('active');
  }

  /**
   * Processes selected book file (PDF or ePub) and automatically extracts Page 1 as cover
   */
  async handleFileSelected(file) {
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    const isEpub = file.name.toLowerCase().endsWith('.epub');

    if (!isPdf && !isEpub) {
      alert('Por favor selecciona un archivo con formato PDF o ePub.');
      return;
    }

    this.currentFileBlob = file;
    this.dropzoneLabel.textContent = `Archivo seleccionado: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;

    // Auto-fill title from filename if title is empty
    const titleInput = document.getElementById('book-title');
    if (!titleInput.value) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      titleInput.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    }

    // Automatically extract Page 1 of PDF as cover
    if (isPdf) {
      try {
        document.getElementById('cover-source-info').textContent = 'Extrayendo primera página del PDF...';
        document.getElementById('cover-preview-section').style.display = 'flex';

        const arrayBuffer = await file.arrayBuffer();
        if (window.pdfjsLib) {
          const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
          const pdfDoc = await loadingTask.promise;
          this.currentTotalPages = pdfDoc.numPages || 1;

          const page = await pdfDoc.getPage(1);
          const viewport = page.getViewport({ scale: 1.5 });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');

          await page.render({ canvasContext: ctx, viewport: viewport }).promise;

          const coverDataUrl = canvas.toDataURL('image/webp', 0.88);
          this.currentCoverDataUrl = coverDataUrl;
          this.coverPreviewImg.src = coverDataUrl;
          document.getElementById('cover-source-info').textContent = 'Portada generada automáticamente (Página 1 del PDF)';
        }
      } catch (err) {
        console.warn('Error extracting PDF page 1:', err);
        document.getElementById('cover-source-info').textContent = 'No se pudo extraer la página. Puedes subir una portada personalizada.';
      }
    } else {
      // For ePub, prompt user or keep default generated
      document.getElementById('cover-preview-section').style.display = 'flex';
      document.getElementById('cover-source-info').textContent = 'Archivo ePub: Puedes seleccionar una portada personalizada.';
    }
  }

  /**
   * Replaces current cover with custom user-provided image
   */
  async handleCustomCoverSelected(file) {
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona una imagen válida (JPG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.currentCoverDataUrl = e.target.result;
      this.coverPreviewImg.src = e.target.result;
      document.getElementById('cover-preview-section').style.display = 'flex';
      document.getElementById('cover-source-info').textContent = 'Portada personalizada seleccionada por el usuario';
    };
    reader.readAsDataURL(file);
  }

  /**
   * Saves book to library
   */
  async handleSubmit(e) {
    e.preventDefault();

    const title = document.getElementById('book-title').value.trim();
    if (!title) {
      alert('Por favor escribe el título del libro.');
      return;
    }

    const authors = document.getElementById('book-authors').value
      .split(',')
      .map(a => a.trim())
      .filter(a => a.length > 0);

    const year = parseInt(document.getElementById('book-year').value, 10) || new Date().getFullYear();
    const edition = document.getElementById('book-edition').value.trim() || '1ra Edición';
    const publisher = document.getElementById('book-publisher').value.trim() || 'Edición Independiente';
    const genre = document.getElementById('book-genre').value.trim() || 'General';
    const description = document.getElementById('book-description').value.trim();

    const isEdit = Boolean(this.currentBookId);
    const bookId = isEdit ? this.currentBookId : `book-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // If adding new book and no file was selected
    if (!isEdit && !this.currentFileBlob) {
      alert('Por favor selecciona un archivo PDF o ePub para el libro.');
      return;
    }

    const existingBook = isEdit ? window.storage.libraryData.books.find(b => b.id === bookId) : null;

    const bookMeta = {
      id: bookId,
      title: title,
      authors: authors.length > 0 ? authors : ['Autor desconocido'],
      year: year,
      edition: edition,
      publisher: publisher,
      genre: genre,
      description: description,
      fileName: this.currentFileBlob ? this.currentFileBlob.name : (existingBook ? existingBook.fileName : 'archivo.pdf'),
      fileSize: this.currentFileBlob ? this.currentFileBlob.size : (existingBook ? existingBook.fileSize : 0),
      totalPages: this.currentTotalPages || (existingBook ? existingBook.totalPages : 1),
      currentPage: existingBook ? existingBook.currentPage : 1,
      progressPercent: existingBook ? existingBook.progressPercent : 0,
      lastRead: existingBook ? existingBook.lastRead : new Date().toISOString(),
      isFavorite: existingBook ? existingBook.isFavorite : false,
      hasCover: Boolean(this.currentCoverDataUrl || (existingBook && existingBook.hasCover))
    };

    // If no cover was extracted or custom uploaded, generate an elegant default one
    let finalCover = this.currentCoverDataUrl;
    if (!finalCover && !bookMeta.hasCover) {
      finalCover = window.storage.generateSampleCover(bookMeta);
    }

    // Save to storage
    await window.storage.saveBook(bookMeta, this.currentFileBlob, finalCover);

    this.closeModal();
    window.catalog.render();
    window.app.showToast(isEdit ? 'Libro actualizado exitosamente' : 'Libro añadido a Mi Biblioteca');
  }
}

window.bookModal = new BookModalManager();
