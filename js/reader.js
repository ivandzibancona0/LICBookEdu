/**
 * LICBook - Reader Engine
 * Streamlined dedicated vertical continuous scrolling reader with Bookmarks
 * Features:
 * - Smooth vertical continuous scrolling flow
 * - Interactive page bookmarks with physical satin ribbon & popover drawer
 * - High-performance IntersectionObserver lazy rendering
 * - Fluid page tracking, jump navigation & slider synchronization
 * - Dynamic Zoom & reading themes (Dark, Paper, Sepia)
 * - Offline PDF.js rendering & high-fidelity editorial fallback
 */

class ReaderEngine {
  constructor() {
    this.currentBook = null;
    this.pdfDoc = null;
    this.numPages = 1;
    this.currentPage = 1;
    let savedTheme = localStorage.getItem('licbook_reader_theme') || 'dark';
    if (!['dark', 'night'].includes(savedTheme)) savedTheme = 'dark';
    this.currentTheme = savedTheme; // 'dark' (Blanco Clásico), 'night' (Nocturno Invertido)
    this.currentViewMode = 'vertical';
    this.currentScale = 1.0;

    this.container = null;
    this.viewport = null;
    this.pageObserver = null;

    // Fixed Page Placeholder Dimensions (eliminates layout shifts & inaccurate jumps)
    this.pageWidth = 750;
    this.pageHeight = 1060;
    this.isProgrammaticScroll = false;
    this.scrollProgrammaticTimer = null;

    // Advanced Navigation & Search
    this.outline = null;
    this.pageLabels = null;
    this.activeNavTab = 'toc';
    this.searchResults = [];
    this.currentSearchIndex = -1;
    this.searchCache = new Map();
    this.searchDebounceTimer = null;
  }

  init() {
    this.container = document.getElementById('reader-overlay');
    this.viewport = document.getElementById('reader-viewport');
    if (this.container) {
      this.container.dataset.theme = this.currentTheme;
    }
    this.updateThemeButtonUI();

    this.bindEvents();
    this.initKeyboardShortcuts();
    this.initNotesDrawer();
  }

  bindEvents() {
    // Back / Close button
    const btnBack = document.getElementById('btn-reader-back');
    if (btnBack) {
      btnBack.addEventListener('click', () => this.closeReader());
    }

    // Bookmark Current Page button
    const btnBookmark = document.getElementById('btn-reader-bookmark');
    if (btnBookmark) {
      btnBookmark.addEventListener('click', () => this.toggleBookmarkCurrentPage());
    }

    // Navigation Tabs (Índice vs Marcapáginas)
    const tabToc = document.getElementById('tab-btn-toc');
    const tabBookmarks = document.getElementById('tab-btn-bookmarks');
    if (tabToc) {
      tabToc.addEventListener('click', () => this.switchNavTab('toc'));
    }
    if (tabBookmarks) {
      tabBookmarks.addEventListener('click', () => this.switchNavTab('bookmarks'));
    }

    // Bookmarks List Popover Toggle
    const btnBookmarksList = document.getElementById('btn-reader-bookmarks-list');
    const bookmarksPopover = document.getElementById('reader-bookmarks-popover');
    if (btnBookmarksList && bookmarksPopover) {
      btnBookmarksList.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleBookmarksPopover();
      });

      document.addEventListener('click', (e) => {
        if (!bookmarksPopover.contains(e.target) && e.target !== btnBookmarksList && !btnBookmarksList.contains(e.target)) {
          bookmarksPopover.classList.remove('show');
        }
      });
    }

    // In-Book Search Controls (Ctrl + F)
    const btnSearch = document.getElementById('btn-reader-search');
    const btnSearchClose = document.getElementById('btn-search-close');
    const btnSearchPrev = document.getElementById('btn-search-prev');
    const btnSearchNext = document.getElementById('btn-search-next');
    const searchInput = document.getElementById('reader-search-input');

    if (btnSearch) {
      btnSearch.addEventListener('click', () => this.toggleSearchBar());
    }
    if (btnSearchClose) {
      btnSearchClose.addEventListener('click', () => this.closeSearchBar());
    }
    if (btnSearchPrev) {
      btnSearchPrev.addEventListener('click', () => this.prevSearchResult());
    }
    if (btnSearchNext) {
      btnSearchNext.addEventListener('click', () => this.nextSearchResult());
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(() => {
          this.performSearch(e.target.value);
        }, 220);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) {
            this.prevSearchResult();
          } else {
            this.nextSearchResult();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.closeSearchBar();
        }
      });
    }

    // Zoom Controls
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', () => this.changeZoom(0.2));
    }
    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => this.changeZoom(-0.2));
    }

    // Ctrl + Wheel to zoom smoothly
    if (this.viewport) {
      this.viewport.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          this.changeZoom(e.deltaY < 0 ? 0.15 : -0.15);
        }
      }, { passive: false });
    }

    // Theme Switcher (Dark, Paper, Sepia)
    const btnTheme = document.getElementById('btn-reader-theme');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => this.toggleTheme());
    }

    // Fullscreen Toggle
    const btnFullscreen = document.getElementById('btn-reader-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
    }

    // Page Navigation Buttons
    const btnPrev = document.getElementById('btn-page-prev');
    const btnNext = document.getElementById('btn-page-next');
    if (btnPrev) btnPrev.addEventListener('click', () => this.prevPage());
    if (btnNext) btnNext.addEventListener('click', () => this.nextPage());

    // Page Slider
    const pageSlider = document.getElementById('reader-page-slider');
    if (pageSlider) {
      pageSlider.addEventListener('input', (e) => {
        const targetPage = parseInt(e.target.value, 10);
        this.goToPage(targetPage);
      });
    }

    // Direct Page Jump Input & Button
    const pageInput = document.getElementById('reader-page-input');
    const btnPageGo = document.getElementById('btn-page-go');

    let isJumpingInput = false;
    const handlePageJump = () => {
      if (!pageInput || !this.currentBook || isJumpingInput) return;
      const targetPage = parseInt(pageInput.value, 10);
      if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= this.numPages) {
        isJumpingInput = true;
        this.goToPage(targetPage, false);
        pageInput.blur();
        setTimeout(() => {
          isJumpingInput = false;
        }, 250);
      } else {
        pageInput.value = this.currentPage;
      }
    };

    if (pageInput) {
      // Auto-select text on focus so user can immediately type the number
      pageInput.addEventListener('focus', () => {
        pageInput.select();
      });

      pageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handlePageJump();
        } else if (e.key === 'Escape') {
          pageInput.value = this.currentPage;
          pageInput.blur();
        }
      });

      pageInput.addEventListener('blur', () => {
        handlePageJump();
      });
    }

    if (btnPageGo) {
      btnPageGo.addEventListener('click', () => {
        handlePageJump();
      });
    }

    // Shortcut: Ctrl+G or 'G' to quickly jump to page
    window.addEventListener('keydown', (e) => {
      if (!this.container || !this.container.classList.contains('active')) return;
      const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
      if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        if (pageInput) {
          pageInput.focus();
          pageInput.select();
        }
      } else if (!isInput && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        if (pageInput) {
          pageInput.focus();
          pageInput.select();
        }
      }
    });

    // Bookmark Note Modal events
    const btnCloseBmModal = document.getElementById('btn-close-bm-modal');
    const btnCancelBmModal = document.getElementById('btn-cancel-bm-modal');
    const bmModalOverlay = document.getElementById('bookmark-note-modal-overlay');
    const bmNoteForm = document.getElementById('bm-note-form');

    if (btnCloseBmModal) {
      btnCloseBmModal.addEventListener('click', () => this.closeBookmarkNoteModal());
    }
    if (btnCancelBmModal) {
      btnCancelBmModal.addEventListener('click', () => this.closeBookmarkNoteModal());
    }
    if (bmModalOverlay) {
      bmModalOverlay.addEventListener('click', (e) => {
        if (e.target === bmModalOverlay) this.closeBookmarkNoteModal();
      });
    }
    if (bmNoteForm) {
      bmNoteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pageInput = document.getElementById('bm-modal-page');
        const quoteInput = document.getElementById('bm-quote-input');
        const noteInput = document.getElementById('bm-note-input');
        if (!pageInput || !this.currentBook) return;

        const pageNum = parseInt(pageInput.value, 10);
        const quote = quoteInput ? quoteInput.value : '';
        const note = noteInput ? noteInput.value : '';

        await window.storage.saveBookmarkNote(this.currentBook.id, pageNum, quote, note);

        this.closeBookmarkNoteModal();
        this.renderBookmarksPopoverList();
        this.updateBookmarkButtonState();
        if (window.catalog) {
          window.catalog.render();
        }
        window.app.showToast(`Nota guardada para la pág. ${pageNum}`);
      });
    }
  }

  initKeyboardShortcuts() {
    // Global shortcut Ctrl+F / Cmd+F to open in-book search
    window.addEventListener('keydown', (e) => {
      if (!this.container || !this.container.classList.contains('active')) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        this.openSearchBar();
      }
    });

    document.addEventListener('keydown', (e) => {
      // Don't intercept when user is typing in inputs or textareas
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (!this.container || !this.container.classList.contains('active')) return;

      // Zoom shortcuts (Ctrl + Plus, Ctrl + Minus, Ctrl + 0)
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        this.changeZoom(0.2);
        return;
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        this.changeZoom(-0.2);
        return;
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        this.currentScale = 1.0;
        this.renderCurrentView();
        window.app.showToast('Zoom: 100%');
        return;
      }

      if (e.key === 'Escape') {
        if (this.isSearchBarOpen()) {
          this.closeSearchBar();
          return;
        }
        if (this.isBookmarkNoteModalOpen()) {
          this.closeBookmarkNoteModal();
          return;
        }
        const popover = document.getElementById('reader-bookmarks-popover');
        if (popover && popover.classList.contains('show')) {
          popover.classList.remove('show');
          return;
        }
        this.closeReader();
        return;
      }

      // If modal is open, don't execute reader page turns
      if (this.isBookmarkNoteModalOpen()) return;

      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        this.nextPage();
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        this.prevPage();
      } else if (e.key === 'b' || e.key === 'B') {
        this.toggleBookmarkCurrentPage();
      }
    });
  }

  /**
   * Opens a book in the reader
   */
  async openBook(bookId) {
    const book = window.storage.libraryData.books.find(b => b.id === bookId);
    if (!book) return;

    this.currentBook = book;
    this.currentPage = book.currentPage || 1;
    this.numPages = book.totalPages || 1;
    this.currentScale = 1.0;

    // Update Toolbar Metadata
    const titleEl = document.getElementById('reader-book-title');
    if (titleEl) titleEl.textContent = book.title;

    // Load Document
    await this.loadDocument(book);

    // Open Container
    this.container.classList.add('active');
    this.container.dataset.theme = this.currentTheme;
    this.updateThemeButtonUI();

    await this.renderCurrentView();
    this.updateBookmarkButtonState();
    this.loadBookNotes();
  }

  /**
   * Calculates standard page dimensions for the active scale to create zero-shift placeholders
   */
  async updatePageDimensions() {
    if (typeof this.currentScale !== 'number' || isNaN(this.currentScale) || this.currentScale <= 0) {
      this.currentScale = 1.0;
    }
    const scale = this.currentScale;

    if (this.pdfDoc) {
      try {
        const firstPage = await this.pdfDoc.getPage(1);
        const vp = firstPage.getViewport({ scale: scale });
        this.pageWidth = Math.floor(vp.width);
        this.pageHeight = Math.floor(vp.height);
        return;
      } catch (e) {
        console.warn('Error reading page dimensions:', e);
      }
    }
    this.pageWidth = Math.floor(600 * scale);
    this.pageHeight = Math.floor(850 * scale);
  }

  /**
   * Loads PDF or synthetic multi-page document
   */
  async loadDocument(book) {
    const blob = await window.storage.getBookBlob(book.id);

    if (blob && window.pdfjsLib) {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
        this.pdfDoc = await loadingTask.promise;
        this.numPages = this.pdfDoc.numPages;
        this.currentBook.totalPages = this.numPages;

        // Extract native PDF outline / Table of Contents
        try {
          this.outline = await this.pdfDoc.getOutline();
        } catch (e) {
          console.warn('Could not load PDF outline:', e);
          this.outline = null;
        }

        // Extract native editorial page labels
        try {
          this.pageLabels = await this.pdfDoc.getPageLabels();
        } catch (e) {
          console.warn('Could not load PDF page labels:', e);
          this.pageLabels = null;
        }
      } catch (err) {
        console.warn('PDF loading error, using high-fidelity fallback viewer:', err);
        this.pdfDoc = null;
        this.outline = null;
        this.pageLabels = null;
      }
    } else {
      this.pdfDoc = null;
      this.outline = null;
      this.pageLabels = null;
      if (!blob && window.app && window.app.showToast) {
        window.app.showToast(`El archivo "${book.fileName || book.title}" no está vinculado aún. Haz clic en "Vincular" para conectar tu carpeta de libros.`, 4500);
      }
    }

    // Reset In-Book search state for new book
    this.searchCache.clear();
    this.searchResults = [];
    this.currentSearchIndex = -1;
    this.closeSearchBar();
    const searchInput = document.getElementById('reader-search-input');
    if (searchInput) searchInput.value = '';
    const searchCount = document.getElementById('reader-search-matches-count');
    if (searchCount) searchCount.textContent = '0 resultados';

    // Update slider bounds & manual page input bounds
    const slider = document.getElementById('reader-page-slider');
    if (slider) {
      slider.min = 1;
      slider.max = this.numPages;
      slider.value = this.currentPage;
    }

    const pageInput = document.getElementById('reader-page-input');
    const pageTotal = document.getElementById('reader-page-total');
    if (pageInput) {
      pageInput.min = 1;
      pageInput.max = this.numPages;
      pageInput.value = this.currentPage;
    }
    if (pageTotal) {
      pageTotal.textContent = `de ${this.numPages}`;
    }
  }

  /**
   * Renders the vertical scrolling view
   */
  async renderCurrentView() {
    await this.updatePageDimensions();
    this.renderVerticalScrollMode();
    this.updateControlsUI();
    this.updateBookmarkButtonState();
  }

  /**
   * Vertical Continuous Scrolling Mode
   */
  renderVerticalScrollMode() {
    if (!this.viewport) return;
    this.viewport.innerHTML = '';
    this.viewport.className = 'reader-viewport mode-vertical';

    const flowContainer = document.createElement('div');
    flowContainer.className = 'vertical-pages-flow';
    this.viewport.appendChild(flowContainer);

    // Disconnect any existing observer
    if (this.pageObserver) {
      this.pageObserver.disconnect();
    }

    // Lazy rendering with IntersectionObserver for smooth performance
    this.pageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const card = entry.target;
          const pageNum = parseInt(card.dataset.pageNum, 10);
          const canvas = card.querySelector('canvas');
          const textLayer = card.querySelector('.textLayer');
          const annotationLayer = card.querySelector('.annotationLayer');
          if (canvas && !card.dataset.rendered) {
            card.dataset.rendered = 'true';
            this.renderPageToCanvas(pageNum, canvas, textLayer, annotationLayer, this.currentScale);
          }
        }
      });
    }, {
      root: this.viewport,
      rootMargin: '600px 0px 600px 0px',
      threshold: 0.01
    });

    for (let pageNum = 1; pageNum <= this.numPages; pageNum++) {
      const pageCard = document.createElement('div');
      pageCard.className = 'vertical-page-card';
      pageCard.dataset.pageNum = pageNum;
      pageCard.id = `vertical-page-${pageNum}`;

      // Set exact placeholder dimensions immediately to prevent ANY layout shift on scroll / jump
      pageCard.style.width = this.pageWidth + 'px';
      pageCard.style.height = this.pageHeight + 'px';
      pageCard.style.minHeight = this.pageHeight + 'px';

      const isMarked = window.storage.isPageBookmarked(this.currentBook.id, pageNum);

      // Floating subtle page badge with editorial label support
      const pageTag = document.createElement('div');
      pageTag.className = 'vertical-page-badge';
      pageTag.textContent = this.getPageLabel(pageNum);
      pageCard.appendChild(pageTag);

      // Interactive Bookmark Button on page card corner
      const cardBookmarkBtn = document.createElement('button');
      cardBookmarkBtn.className = `card-ribbon-btn ${isMarked ? 'active' : ''}`;
      cardBookmarkBtn.id = `card-ribbon-${pageNum}`;
      cardBookmarkBtn.title = isMarked ? `Quitar marcapáginas de pág. ${pageNum}` : `Añadir marcapáginas en pág. ${pageNum}`;
      cardBookmarkBtn.innerHTML = Icons.bookmark(18, isMarked);
      cardBookmarkBtn.onclick = async (e) => {
        e.stopPropagation();
        await this.toggleBookmarkOnPage(pageNum);
      };
      pageCard.appendChild(cardBookmarkBtn);

      const canvas = document.createElement('canvas');
      canvas.className = 'vertical-canvas';
      canvas.style.width = this.pageWidth + 'px';
      canvas.style.height = this.pageHeight + 'px';
      pageCard.appendChild(canvas);

      // Text Layer for mouse text selection & copying (Adobe Acrobat / Edge style)
      const textLayer = document.createElement('div');
      textLayer.className = 'textLayer';
      textLayer.style.width = this.pageWidth + 'px';
      textLayer.style.height = this.pageHeight + 'px';
      pageCard.appendChild(textLayer);

      // Annotation Layer for interactive links, footnotes, TOC jumps & external URLs
      const annotationLayer = document.createElement('div');
      annotationLayer.className = 'annotationLayer';
      annotationLayer.style.width = this.pageWidth + 'px';
      annotationLayer.style.height = this.pageHeight + 'px';
      pageCard.appendChild(annotationLayer);

      flowContainer.appendChild(pageCard);

      this.pageObserver.observe(pageCard);
    }

    // Scroll to initial page
    setTimeout(() => {
      this.goToPage(this.currentPage, false);
    }, 60);

    // Track scroll position to update current page indicator and save reading progress
    let scrollTimeout = null;
    this.viewport.onscroll = () => {
      if (this.isProgrammaticScroll) return; // Prevent overwriting during programmatic jumps!

      const pageCards = flowContainer.querySelectorAll('.vertical-page-card');

      // Check if scrolled to the very bottom of the document
      const isAtBottom = this.viewport.scrollTop + this.viewport.clientHeight >= this.viewport.scrollHeight - 50;
      if (isAtBottom && this.numPages > 0) {
        if (this.currentPage !== this.numPages) {
          this.currentPage = this.numPages;
          this.updateControlsUI();
          this.updateBookmarkButtonState();
          if (scrollTimeout) clearTimeout(scrollTimeout);
          scrollTimeout = setTimeout(() => this.saveProgress(), 300);
        }
        return;
      }

      // Upper reading focus point (approx 35% of viewport height, max 240px)
      const focusPoint = this.viewport.scrollTop + Math.min(this.viewport.clientHeight * 0.35, 240);

      for (const card of pageCards) {
        const top = card.offsetTop;
        const bottom = top + card.clientHeight;
        if (focusPoint >= top && focusPoint <= bottom) {
          const page = parseInt(card.dataset.pageNum, 10);
          if (page !== this.currentPage) {
            this.currentPage = page;
            this.updateControlsUI();
            this.updateBookmarkButtonState();
            if (scrollTimeout) clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => this.saveProgress(), 300);
          }
          break;
        }
      }
    };
  }

  /**
   * Bookmark Methods
   */
  async toggleBookmarkCurrentPage() {
    await this.toggleBookmarkOnPage(this.currentPage);
  }

  async toggleBookmarkOnPage(pageNum) {
    if (!this.currentBook) return;
    const isMarked = await window.storage.toggleBookmark(this.currentBook.id, pageNum);

    // Update bookmark circle button on page card
    const cardBtn = document.getElementById(`card-ribbon-${pageNum}`);
    if (cardBtn) {
      cardBtn.classList.toggle('active', isMarked);
      cardBtn.innerHTML = Icons.bookmark(18, isMarked);
      cardBtn.title = isMarked ? `Quitar marcapáginas de pág. ${pageNum}` : `Añadir marcapáginas en pág. ${pageNum}`;
    }

    // Update toolbar button state
    this.updateBookmarkButtonState();

    // Re-render bookmarks popover if open
    this.renderBookmarksPopoverList();

    // Toast notification
    window.app.showToast(isMarked ? `Marcapáginas guardado en pág. ${pageNum}` : `Marcapáginas eliminado de pág. ${pageNum}`);

    // Update catalog UI in background
    if (window.catalog) {
      window.catalog.render();
    }
  }

  updateBookmarkButtonState() {
    if (!this.currentBook) return;
    const isMarked = window.storage.isPageBookmarked(this.currentBook.id, this.currentPage);
    const btnBookmark = document.getElementById('btn-reader-bookmark');
    if (btnBookmark) {
      btnBookmark.classList.toggle('active', isMarked);
      btnBookmark.innerHTML = Icons.bookmark(18, isMarked);
      btnBookmark.title = isMarked ? `Quitar marcapáginas de pág. ${this.currentPage}` : `Marcar pág. ${this.currentPage} con marcapáginas`;
    }

    // Update badge count & tab count
    const bookmarks = window.storage.getBookmarks(this.currentBook.id);
    const badge = document.getElementById('reader-bookmark-badge');
    if (badge) {
      if (bookmarks.length > 0) {
        badge.style.display = 'inline-flex';
        badge.textContent = bookmarks.length;
      } else {
        badge.style.display = 'none';
      }
    }
    const tabBmCount = document.getElementById('tab-bookmarks-count');
    if (tabBmCount) {
      tabBmCount.textContent = bookmarks.length;
    }
  }

  toggleBookmarksPopover() {
    const popover = document.getElementById('reader-bookmarks-popover');
    if (!popover) return;
    const isShowing = popover.classList.contains('show');
    if (isShowing) {
      popover.classList.remove('show');
    } else {
      this.switchNavTab(this.activeNavTab || 'toc');
      popover.classList.add('show');
    }
  }

  renderBookmarksPopoverList() {
    const popoverList = document.getElementById('reader-bookmarks-list');
    const popoverCount = document.getElementById('bookmarks-popover-count');
    const tabBmCount = document.getElementById('tab-bookmarks-count');
    if (!popoverList || !this.currentBook) return;

    const bookmarks = window.storage.getBookmarks(this.currentBook.id);
    if (popoverCount) {
      popoverCount.textContent = `${bookmarks.length} ${bookmarks.length === 1 ? 'marcapáginas' : 'marcapáginas'}`;
    }
    if (tabBmCount) {
      tabBmCount.textContent = bookmarks.length;
    }

    if (bookmarks.length === 0) {
      popoverList.innerHTML = `
        <div class="empty-bookmarks">
          <div class="empty-bm-icon">${Icons.bookmark(32, false)}</div>
          <p class="empty-bm-title">Sin marcapáginas en este libro</p>
          <p class="empty-bm-desc">Marca páginas clave para volver a ellas rápidamente.</p>
        </div>
      `;
      return;
    }

    popoverList.innerHTML = '';
    bookmarks.forEach(bm => {
      const item = document.createElement('div');
      item.className = 'bookmark-popover-item';
      if (bm.page === this.currentPage) {
        item.classList.add('current');
      }

      let dateStr = '';
      if (bm.createdAt) {
        const d = new Date(bm.createdAt);
        dateStr = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      }

      const hasNoteOrQuote = Boolean(bm.quote || bm.note);

      item.innerHTML = `
        <div class="bm-item-info">
          <div class="bm-item-page">
            <span class="bm-ribbon-bullet">${Icons.bookmark(14, true)}</span>
            <span>Página ${this.getPageLabel(bm.page)}</span>
          </div>
          ${dateStr ? `<span class="bm-item-date">${dateStr}</span>` : ''}
          ${hasNoteOrQuote ? `
            <div class="bm-item-preview">
              ${bm.quote ? `<div class="bm-preview-quote" title="${this.escapeHtml(bm.quote)}">“${this.escapeHtml(bm.quote)}”</div>` : ''}
              ${bm.note ? `<div class="bm-preview-note" title="${this.escapeHtml(bm.note)}">${this.escapeHtml(bm.note)}</div>` : ''}
            </div>
          ` : ''}
        </div>
        <div class="bm-item-actions">
          <button class="btn-bm-note ${hasNoteOrQuote ? 'has-note' : ''}" title="${hasNoteOrQuote ? 'Editar nota o cita' : 'Agregar nota o cita'}">
            ${Icons.note(15)}
          </button>
          <button class="btn-bm-jump" title="Ir a pág. ${bm.page}">Ir a pág.</button>
          <button class="btn-bm-delete" title="Eliminar marcapáginas">${Icons.trash(15)}</button>
        </div>
      `;

      item.querySelector('.btn-bm-note').onclick = (e) => {
        e.stopPropagation();
        this.openBookmarkNoteModal(bm.page);
      };

      item.querySelector('.btn-bm-jump').onclick = (e) => {
        e.stopPropagation();
        this.goToPage(bm.page);
        const popover = document.getElementById('reader-bookmarks-popover');
        if (popover) popover.classList.remove('show');
      };

      item.onclick = () => {
        this.goToPage(bm.page);
        const popover = document.getElementById('reader-bookmarks-popover');
        if (popover) popover.classList.remove('show');
      };

      item.querySelector('.btn-bm-delete').onclick = async (e) => {
        e.stopPropagation();
        await this.toggleBookmarkOnPage(bm.page);
      };

      popoverList.appendChild(item);
    });
  }

  /**
   * Opens the bookmark note & quote modal for a specific page
   */
  openBookmarkNoteModal(pageNum) {
    const modal = document.getElementById('bookmark-note-modal-overlay');
    if (!modal || !this.currentBook) return;

    const bookmarks = window.storage.getBookmarks(this.currentBook.id);
    const bm = bookmarks.find(b => b.page === pageNum);

    const pageInput = document.getElementById('bm-modal-page');
    const pageBadge = document.getElementById('bm-modal-page-badge');
    const bookTitle = document.getElementById('bm-modal-book-title');
    const quoteInput = document.getElementById('bm-quote-input');
    const noteInput = document.getElementById('bm-note-input');

    if (pageInput) pageInput.value = pageNum;
    if (pageBadge) pageBadge.textContent = `Página ${pageNum}`;
    if (bookTitle) bookTitle.textContent = this.currentBook.title || 'Libro actual';
    if (quoteInput) quoteInput.value = bm ? (bm.quote || '') : '';
    if (noteInput) noteInput.value = bm ? (bm.note || '') : '';

    modal.style.display = 'flex';
    void modal.offsetWidth; // trigger reflow for smooth transition
    modal.classList.add('active');

    setTimeout(() => {
      if (quoteInput && !quoteInput.value) {
        quoteInput.focus();
      } else if (noteInput) {
        noteInput.focus();
      }
    }, 60);
  }

  /**
   * Closes the bookmark note modal
   */
  closeBookmarkNoteModal() {
    const modal = document.getElementById('bookmark-note-modal-overlay');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => {
        if (!modal.classList.contains('active')) {
          modal.style.display = 'none';
        }
      }, 200);
    }
  }

  /**
   * Checks if bookmark note modal is open
   */
  isBookmarkNoteModalOpen() {
    const modal = document.getElementById('bookmark-note-modal-overlay');
    return modal ? modal.classList.contains('active') : false;
  }

  /**
   * Safe HTML string escaping for user text
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Navigation: jump to specific page
   */
  goToPage(pageNum, smooth = true) {
    pageNum = Math.max(1, Math.min(this.numPages, pageNum));
    const isFar = Math.abs(pageNum - this.currentPage) > 4;
    this.currentPage = pageNum;
    this.isProgrammaticScroll = true;

    this.updateControlsUI();
    this.updateBookmarkButtonState();

    const targetEl = document.getElementById(`vertical-page-${pageNum}`);
    if (targetEl && this.viewport) {
      // Force render destination page immediately so user sees crisp content instantly
      const canvas = targetEl.querySelector('canvas');
      const textLayer = targetEl.querySelector('.textLayer');
      const annotationLayer = targetEl.querySelector('.annotationLayer');
      if (canvas && !targetEl.dataset.rendered) {
        targetEl.dataset.rendered = 'true';
        this.renderPageToCanvas(pageNum, canvas, textLayer, annotationLayer, this.currentScale);
      }

      // targetEl.offsetTop is completely accurate because all cards have exact pre-calculated heights
      const targetTop = Math.max(0, targetEl.offsetTop - 16);
      const useSmooth = smooth && !isFar;

      if (useSmooth) {
        this.viewport.scrollTo({ top: targetTop, behavior: 'smooth' });
      } else {
        this.viewport.scrollTop = targetTop;
      }

      // Confirm final scroll position in case of subpixel adjustment
      requestAnimationFrame(() => {
        if (!useSmooth && Math.abs(this.viewport.scrollTop - targetTop) > 2) {
          this.viewport.scrollTop = targetTop;
        }
      });

      if (this.scrollProgrammaticTimer) {
        clearTimeout(this.scrollProgrammaticTimer);
      }
      this.scrollProgrammaticTimer = setTimeout(() => {
        this.isProgrammaticScroll = false;
        this.updateControlsUI();
        this.saveProgress();
      }, useSmooth ? 450 : 120);
    }
  }

  nextPage() {
    if (this.currentPage < this.numPages) {
      this.goToPage(this.currentPage + 1);
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.goToPage(this.currentPage - 1);
    }
  }

  async changeZoom(delta) {
    if (!this.currentBook) return;
    if (typeof this.currentScale !== 'number' || isNaN(this.currentScale) || this.currentScale <= 0) {
      this.currentScale = 1.0;
    }
    const newScale = Math.round((this.currentScale + delta) * 100) / 100;
    this.currentScale = Math.max(0.6, Math.min(2.5, newScale));
    await this.renderCurrentView();
    window.app.showToast(`Zoom: ${Math.round(this.currentScale * 100)}%`);
  }

  toggleTheme() {
    const themes = ['dark', 'night'];
    const nextIndex = (themes.indexOf(this.currentTheme) + 1) % themes.length;
    this.currentTheme = themes[nextIndex];
    if (this.container) {
      this.container.dataset.theme = this.currentTheme;
    }
    try {
      localStorage.setItem('licbook_reader_theme', this.currentTheme);
    } catch (e) {}

    const themeNames = {
      dark: 'Blanco Clásico',
      night: 'Nocturno (Invertido)'
    };

    this.updateThemeButtonUI();
    window.app.showToast(`Tema de lectura: ${themeNames[this.currentTheme]}`);
  }

  updateThemeButtonUI() {
    const btnTheme = document.getElementById('btn-reader-theme');
    if (!btnTheme) return;

    const isNight = this.currentTheme === 'night';
    const currentName = isNight ? 'Nocturno (Invertido)' : 'Blanco Clásico';
    const targetName = isNight ? 'Blanco Clásico' : 'Nocturno (Invertido)';
    btnTheme.title = `Tema de lectura: ${currentName} (Clic para cambiar a ${targetName})`;

    if (typeof Icons !== 'undefined' && Icons.moon && Icons.sun) {
      btnTheme.innerHTML = isNight ? Icons.sun(18) : Icons.moon(18);
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  }

  updateControlsUI() {
    const pageInput = document.getElementById('reader-page-input');
    if (pageInput && document.activeElement !== pageInput) {
      pageInput.value = this.currentPage;
      pageInput.max = this.numPages;
    }

    const pageTotal = document.getElementById('reader-page-total');
    if (pageTotal) {
      pageTotal.textContent = `de ${this.numPages}`;
    }

    const pageNumEl = document.getElementById('reader-page-indicator');
    if (pageNumEl) {
      const label = this.getPageLabel(this.currentPage);
      pageNumEl.textContent = label !== String(this.currentPage)
        ? `Pág. ${label} (${this.currentPage} de ${this.numPages})`
        : `Página ${this.currentPage} de ${this.numPages}`;
    }

    const slider = document.getElementById('reader-page-slider');
    if (slider) {
      slider.max = this.numPages;
      slider.value = this.currentPage;
    }
  }

  async saveProgress() {
    if (!this.currentBook) return;
    await window.storage.updateProgress(this.currentBook.id, this.currentPage, this.numPages);
    if (window.catalog) {
      window.catalog.updateMiniPlayer();
    }
  }

  closeReader() {
    if (this.pageObserver) {
      this.pageObserver.disconnect();
    }
    const popover = document.getElementById('reader-bookmarks-popover');
    if (popover) popover.classList.remove('show');
    this.closeBookmarkNoteModal();
    this.closeSearchBar();
    this.closeNotesDrawer();

    this.container.classList.remove('active');
    this.saveProgress();
    if (window.catalog) {
      window.catalog.render();
    }
  }

  /**
   * Renders page to a canvas element, textLayer and annotationLayer (HiDPI sharp vector + selectable text + clickable links)
   */
  async renderPageToCanvas(pageNum, canvas, textLayer = null, annotationLayer = null, scale = 1.0) {
    const activeScale = (typeof scale === 'number' && !isNaN(scale) && scale > 0) ? scale : 1.0;
    if (this.pdfDoc) {
      try {
        const page = await this.pdfDoc.getPage(pageNum);
        const dpr = window.devicePixelRatio || 1;
        // Output scale factor: at least 2.0 or dpr * 1.5 for ultra-sharp, non-blurry text
        const outputScale = Math.max(dpr, 2.0);

        const viewport = page.getViewport({ scale: activeScale });
        const actualW = Math.floor(viewport.width);
        const actualH = Math.floor(viewport.height);

        // Update card dimensions if different (e.g. non-standard page sizes)
        const card = document.getElementById(`vertical-page-${pageNum}`);
        if (card) {
          card.style.width = actualW + 'px';
          card.style.height = actualH + 'px';
          card.style.minHeight = actualH + 'px';
        }

        // Physical canvas size in device pixels
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);

        // Logical CSS display size
        canvas.style.width = actualW + 'px';
        canvas.style.height = actualH + 'px';

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const transform = outputScale !== 1
          ? [outputScale, 0, 0, outputScale, 0, 0]
          : null;

        await page.render({
          canvasContext: ctx,
          transform: transform,
          viewport: viewport
        }).promise;

        // Render Selectable Text Layer (Acrobat / Edge style text selection)
        if (textLayer && window.pdfjsLib && window.pdfjsLib.renderTextLayer) {
          textLayer.innerHTML = '';
          textLayer.style.width = Math.floor(viewport.width) + 'px';
          textLayer.style.height = Math.floor(viewport.height) + 'px';
          textLayer.style.setProperty('--scale-factor', viewport.scale);

          const textContent = await page.getTextContent();
          const textLayerTask = window.pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayer,
            viewport: viewport
          });
          if (textLayerTask && textLayerTask.promise) {
            await textLayerTask.promise;
          }
        }

        // Render Interactive Annotation Layer (clickable links, footnotes, chapters & URLs)
        if (annotationLayer && window.pdfjsLib && window.pdfjsLib.AnnotationLayer) {
          annotationLayer.innerHTML = '';
          annotationLayer.style.width = Math.floor(viewport.width) + 'px';
          annotationLayer.style.height = Math.floor(viewport.height) + 'px';
          annotationLayer.style.setProperty('--scale-factor', viewport.scale);

          try {
            const annotations = await page.getAnnotations({ intent: 'display' });
            if (annotations && annotations.length > 0) {
              const linkService = {
                getDestinationHash: (dest) => '#',
                getAnchorUrl: (hash) => '#',
                setHash: (hash) => {},
                executeNamedAction: (action) => {
                  if (action === 'NextPage') this.nextPage();
                  else if (action === 'PrevPage') this.prevPage();
                  else if (action === 'FirstPage') this.goToPage(1);
                  else if (action === 'LastPage') this.goToPage(this.numPages);
                },
                addLinkAttributes: (link, url, newWindow) => {
                  link.href = url;
                  link.target = '_blank';
                  link.rel = 'noopener noreferrer';
                },
                goToDestination: async (dest) => {
                  await this.goToDestination(dest);
                }
              };

              const clonedViewport = viewport.clone({ dontFlip: true });
              if (typeof window.pdfjsLib.AnnotationLayer === 'function') {
                const layer = new window.pdfjsLib.AnnotationLayer({
                  div: annotationLayer,
                  page: page,
                  viewport: clonedViewport
                });
                await layer.render({
                  annotations: annotations,
                  linkService: linkService,
                  renderForms: false
                });
              } else if (window.pdfjsLib.AnnotationLayer.render) {
                await window.pdfjsLib.AnnotationLayer.render({
                  viewport: clonedViewport,
                  div: annotationLayer,
                  annotations: annotations,
                  page: page,
                  linkService: linkService,
                  renderInteractiveForms: false
                });
              }
            }
          } catch (annotErr) {
            console.warn('Annotation layer render warning for page', pageNum, annotErr);
          }
        }
        return;
      } catch (err) {
        console.warn('PDF render error for page', pageNum, err);
      }
    }

    // High-fidelity fallback book page renderer
    this.renderFallbackPage(pageNum, canvas, scale);
  }

  /**
   * Renders a richly designed book page for starter/sample books
   */
  renderFallbackPage(pageNum, canvas, scale = 1.0) {
    const activeScale = (typeof scale === 'number' && !isNaN(scale) && scale > 0) ? scale : 1.0;
    const dpr = window.devicePixelRatio || 1;
    const outputScale = Math.max(dpr, 2.0);
    const baseW = 600 * activeScale;
    const baseH = 850 * activeScale;

    canvas.width = Math.floor(baseW * outputScale);
    canvas.height = Math.floor(baseH * outputScale);
    canvas.style.width = Math.floor(baseW) + 'px';
    canvas.style.height = Math.floor(baseH) + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(outputScale, outputScale);

    // Standard page base (CSS dynamically applies reading themes to the canvas)
    const bg = '#FFFFFF';
    const textCol = '#1E293B';
    const mutedCol = '#64748B';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, baseW, baseH);

    // Subtle paper grain margin
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.lineWidth = 1;
    ctx.strokeRect(20 * scale, 20 * scale, baseW - 40 * scale, baseH - 40 * scale);

    // Running Header
    ctx.fillStyle = mutedCol;
    ctx.font = `italic ${11 * scale}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText((this.currentBook.title || '').toUpperCase(), baseW / 2, 45 * scale);

    // Running Header Line
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.moveTo(50 * scale, 55 * scale);
    ctx.lineTo(baseW - 50 * scale, 55 * scale);
    ctx.stroke();

    // Chapter Header or Body Text
    ctx.textAlign = 'left';
    let y = 100 * scale;

    if (pageNum === 1) {
      // Title page
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0F223D';
      ctx.font = `bold ${24 * scale}px Georgia, serif`;
      ctx.fillText(this.currentBook.title, baseW / 2, 180 * scale);

      ctx.fillStyle = '#8DC63F';
      ctx.font = `${14 * scale}px sans-serif`;
      ctx.fillText((this.currentBook.authors || []).join(', '), baseW / 2, 220 * scale);

      ctx.fillStyle = mutedCol;
      ctx.font = `${12 * scale}px Georgia, serif`;
      ctx.fillText(`${this.currentBook.publisher} • ${this.currentBook.edition}`, baseW / 2, 260 * scale);

      // Decorative divider
      ctx.fillStyle = '#FED402';
      ctx.fillRect(baseW / 2 - 40 * scale, 300 * scale, 80 * scale, 3 * scale);

      y = 380 * scale;
      ctx.textAlign = 'left';
    } else {
      // Regular Chapter page
      ctx.fillStyle = textCol;
      ctx.font = `bold ${16 * scale}px Georgia, serif`;
      ctx.fillText(`Capítulo ${Math.ceil(pageNum / 2)}`, 60 * scale, y);
      y += 35 * scale;
    }

    // Sample content paragraphs
    const sampleParagraphs = [
      "En aquel lugar de la memoria donde las historias cobran vida, cada página leída es una ventana hacia mundos inexplorados y conocimientos profundos.",
      "La lectura enriquece el pensamiento crítico, expande la imaginación y conecta a los lectores con las ideas más brillantes de la historia humana.",
      "Con LICBook, tu biblioteca personal permanece siempre en tus manos: local, privada, accesible y con la más alta calidad visual.",
      "Las palabras fluyen con la naturalidad de un libro impreso, combinando la tradición tipográfica con la tecnología digital moderna.",
      "Avanzar entre los capítulos es descubrir nuevas perspectivas que transforman el entendimiento cotidiano en una aventura constante."
    ];

    ctx.fillStyle = textCol;
    ctx.font = `${13 * scale}px Georgia, serif`;
    const lineHeight = 24 * scale;

    sampleParagraphs.forEach(p => {
      this.wrapText(ctx, p, 60 * scale, y, baseW - 120 * scale, lineHeight);
      y += 65 * scale;
    });

    // Page Number Footer
    ctx.fillStyle = mutedCol;
    ctx.font = `${12 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${pageNum}`, baseW / 2, baseH - 35 * scale);
  }

  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
  }

  /**
   * Returns exact sequential physical page number (Option 2: 1 to N synchronized)
   */
  getPageLabel(pageNum) {
    return String(pageNum);
  }

  /**
   * Resolves PDF destination (named string, explicit array [ref, ...], or number) to 1-based page number
   */
  async resolveDestination(dest) {
    if (!dest) return null;
    if (typeof dest === 'number') {
      return dest;
    }
    let explicitDest = dest;
    if (typeof dest === 'string' && this.pdfDoc) {
      try {
        explicitDest = await this.pdfDoc.getDestination(dest);
      } catch (e) {
        console.warn('Error fetching named destination:', dest, e);
      }
    }
    if (Array.isArray(explicitDest) && explicitDest.length > 0) {
      const pageRef = explicitDest[0];
      if (typeof pageRef === 'number') {
        return pageRef + 1;
      }
      if (pageRef && typeof pageRef === 'object' && this.pdfDoc) {
        try {
          const pageIndex = await this.pdfDoc.getPageIndex(pageRef);
          return pageIndex + 1;
        } catch (e) {
          console.warn('Error resolving page index for destination:', e);
        }
      }
    }
    return null;
  }

  /**
   * Jumps to destination target
   */
  async goToDestination(dest) {
    try {
      const pageNum = await this.resolveDestination(dest);
      if (pageNum && pageNum >= 1 && pageNum <= this.numPages) {
        this.goToPage(pageNum);
        const popover = document.getElementById('reader-bookmarks-popover');
        if (popover) popover.classList.remove('show');
      }
    } catch (err) {
      console.warn('Could not go to destination:', dest, err);
    }
  }

  /**
   * Switches navigation popover tab ('toc' or 'bookmarks')
   */
  switchNavTab(tabName) {
    this.activeNavTab = tabName;
    const tabToc = document.getElementById('tab-btn-toc');
    const tabBm = document.getElementById('tab-btn-bookmarks');
    const panelToc = document.getElementById('panel-toc');
    const panelBm = document.getElementById('panel-bookmarks');

    if (tabToc && tabBm && panelToc && panelBm) {
      if (tabName === 'toc') {
        tabToc.classList.add('active');
        tabBm.classList.remove('active');
        panelToc.classList.add('active');
        panelBm.classList.remove('active');
        this.renderOutline();
      } else {
        tabBm.classList.add('active');
        tabToc.classList.remove('active');
        panelBm.classList.add('active');
        panelToc.classList.remove('active');
        this.renderBookmarksPopoverList();
      }
    }
  }

  /**
   * Renders the Table of Contents / Outline tree
   */
  async renderOutline() {
    const tocList = document.getElementById('reader-toc-list');
    if (!tocList || !this.currentBook) return;

    if (this.outline && this.outline.length > 0) {
      tocList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">Cargando índice...</div>';

      const fragment = document.createDocumentFragment();

      const renderLevel = async (items, level = 0) => {
        for (const item of items) {
          const itemEl = document.createElement('div');
          itemEl.className = `toc-item ${level > 0 ? `level-${Math.min(level, 2)}` : ''}`;

          let targetPage = null;
          if (item.dest) {
            targetPage = await this.resolveDestination(item.dest);
          }

          const titleSpan = document.createElement('span');
          titleSpan.className = 'toc-item-title';
          titleSpan.textContent = item.title || 'Sección';
          titleSpan.title = item.title || '';
          itemEl.appendChild(titleSpan);

          if (targetPage) {
            const pageSpan = document.createElement('span');
            pageSpan.className = 'toc-item-page';
            pageSpan.textContent = this.getPageLabel(targetPage);
            itemEl.appendChild(pageSpan);

            itemEl.onclick = (e) => {
              e.stopPropagation();
              this.goToPage(targetPage);
              const popover = document.getElementById('reader-bookmarks-popover');
              if (popover) popover.classList.remove('show');
            };
          } else if (item.dest) {
            itemEl.onclick = async (e) => {
              e.stopPropagation();
              await this.goToDestination(item.dest);
            };
          }

          fragment.appendChild(itemEl);

          if (item.items && item.items.length > 0) {
            await renderLevel(item.items, level + 1);
          }
        }
      };

      await renderLevel(this.outline, 0);
      tocList.innerHTML = '';
      tocList.appendChild(fragment);

    } else if (!this.pdfDoc && this.numPages > 1) {
      // Synthetic TOC for sample books
      tocList.innerHTML = '';
      for (let p = 1; p <= this.numPages; p += 2) {
        const chapNum = Math.ceil(p / 2);
        const itemEl = document.createElement('div');
        itemEl.className = 'toc-item';
        itemEl.innerHTML = `
          <span class="toc-item-title">${p === 1 ? 'Portada y Datos de Edición' : `Capítulo ${chapNum}`}</span>
          <span class="toc-item-page">${p}</span>
        `;
        itemEl.onclick = () => {
          this.goToPage(p);
          const popover = document.getElementById('reader-bookmarks-popover');
          if (popover) popover.classList.remove('show');
        };
        tocList.appendChild(itemEl);
      }
    } else {
      // Friendly fallback for PDFs without embedded outline
      tocList.innerHTML = `
        <div class="empty-toc">
          <div class="empty-toc-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              <line x1="9" y1="9" x2="15" y2="9"></line>
              <line x1="9" y1="13" x2="13" y2="13"></line>
            </svg>
          </div>
          <p class="empty-toc-title">Sin índice de capítulos</p>
          <p class="empty-toc-desc">Este documento PDF no incluye un índice digital predefinido. Puedes usar la búsqueda de texto (Ctrl + F) o marcar capítulos clave con marcapáginas.</p>
        </div>
      `;
    }
  }

  /* ==========================================================================
     Reader Notes Drawer (Libreta de Apuntes)
     ========================================================================== */
  initNotesDrawer() {
    const btnTab = document.getElementById('btn-reader-notes-tab');
    const drawer = document.getElementById('reader-notes-drawer');
    const btnClose = document.getElementById('btn-close-notes');
    const textarea = document.getElementById('reader-notes-textarea');
    const previewEl = document.getElementById('reader-notes-preview');
    const btnDownload = document.getElementById('btn-download-notes');
    const btnAppend = document.getElementById('btn-append-notes');
    const fileInput = document.getElementById('notes-file-input');
    const btnTabEdit = document.getElementById('btn-notes-tab-edit');
    const btnTabPreview = document.getElementById('btn-notes-tab-preview');
    const formattingTools = document.getElementById('notes-formatting-tools');

    if (btnTab) {
      btnTab.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleNotesDrawer();
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        this.closeNotesDrawer();
      });
    }

    // Mode Switcher: Edit vs Obsidian Live Preview
    if (btnTabEdit) {
      btnTabEdit.addEventListener('click', () => {
        this.setNotesViewMode('edit');
      });
    }
    if (btnTabPreview) {
      btnTabPreview.addEventListener('click', () => {
        this.setNotesViewMode('preview');
      });
    }

    // Formatting Toolbar Buttons (H1, H2, H3, Bold, Italic, Strike, Highlight, Quote, Bullet, Task, Code, HR)
    if (formattingTools) {
      formattingTools.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-tool');
        if (!btn) return;
        const action = btn.dataset.action;
        if (!action) return;

        // Switch to edit mode first so the user sees the changes in real-time
        this.setNotesViewMode('edit');
        this.applyMarkdownFormat(action);
      });
    }

    // Interactive Checkboxes in Obsidian Preview Mode
    if (previewEl) {
      previewEl.addEventListener('change', async (e) => {
        if (e.target.classList.contains('obsidian-task-checkbox')) {
          const taskItem = e.target.closest('.obsidian-task-item');
          if (!taskItem || !textarea) return;
          const lineIdx = parseInt(taskItem.dataset.lineIndex, 10);
          const isChecked = e.target.checked;

          const lines = textarea.value.split('\n');
          if (lines[lineIdx] !== undefined) {
            if (isChecked) {
              lines[lineIdx] = lines[lineIdx].replace(/^(\s*[-*+]\s+\[)\s*(\])/, '$1x$2');
            } else {
              lines[lineIdx] = lines[lineIdx].replace(/^(\s*[-*+]\s+\[)[xX](\])/, '$1 $2');
            }
            textarea.value = lines.join('\n');
            taskItem.classList.toggle('completed', isChecked);

            if (this.currentBook) {
              await window.storage.saveBookNotes(this.currentBook.id, textarea.value);
            }
            this.updateNotesStats();
          }
        }
      });
    }

    // Textarea Auto-save & Keyboard Shortcuts (Ctrl+B, Ctrl+I, Ctrl+Shift+H, Tab, Enter list continuation)
    if (textarea) {
      let saveTimer = null;
      textarea.addEventListener('input', () => {
        this.updateNotesStats();
        const statusEl = document.getElementById('notes-save-status');
        if (statusEl) {
          statusEl.innerHTML = '<span class="save-status-dot saving"></span> Guardando...';
        }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          if (this.currentBook) {
            await window.storage.saveBookNotes(this.currentBook.id, textarea.value);
            if (statusEl) {
              statusEl.innerHTML = '<span class="save-status-dot"></span> Guardado';
            }
          }
        }, 400);
      });

      textarea.addEventListener('keydown', (e) => {
        // Ctrl+B / Cmd+B -> Bold
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
          e.preventDefault();
          this.applyMarkdownFormat('bold');
          return;
        }
        // Ctrl+I / Cmd+I -> Italic
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'i' || e.key === 'I')) {
          e.preventDefault();
          this.applyMarkdownFormat('italic');
          return;
        }
        // Ctrl+Shift+H -> Obsidian Highlight
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'h' || e.key === 'H')) {
          e.preventDefault();
          this.applyMarkdownFormat('highlight');
          return;
        }
        // Ctrl+Shift+S -> Strikethrough
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
          e.preventDefault();
          this.applyMarkdownFormat('strike');
          return;
        }

        // Tab -> 2 spaces indentation
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          if (e.shiftKey) {
            const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
            const line = textarea.value.substring(lineStart, end);
            if (line.startsWith('  ')) {
              textarea.value = textarea.value.substring(0, lineStart) + line.substring(2) + textarea.value.substring(end);
              textarea.setSelectionRange(Math.max(lineStart, start - 2), Math.max(lineStart, end - 2));
            }
          } else {
            textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
            textarea.setSelectionRange(start + 2, start + 2);
          }
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }

        // Enter -> Auto-continue lists & task checkboxes
        if (e.key === 'Enter') {
          const start = textarea.selectionStart;
          const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
          const currentLine = textarea.value.substring(lineStart, start);

          // Task item: - [ ] or - [x]
          const taskMatch = currentLine.match(/^(\s*[-*+]\s+\[[ xX]\]\s+)(.*)$/);
          if (taskMatch) {
            e.preventDefault();
            if (!taskMatch[2].trim()) {
              textarea.value = textarea.value.substring(0, lineStart) + textarea.value.substring(start);
              textarea.setSelectionRange(lineStart, lineStart);
            } else {
              const prefix = currentLine.match(/^\s*[-*+]\s+/)[0] + '[ ] ';
              textarea.value = textarea.value.substring(0, start) + '\n' + prefix + textarea.value.substring(start);
              textarea.setSelectionRange(start + 1 + prefix.length, start + 1 + prefix.length);
            }
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            return;
          }

          // Bullet item: - or *
          const bulletMatch = currentLine.match(/^(\s*[-*+]\s+)(.*)$/);
          if (bulletMatch) {
            e.preventDefault();
            if (!bulletMatch[2].trim()) {
              textarea.value = textarea.value.substring(0, lineStart) + textarea.value.substring(start);
              textarea.setSelectionRange(lineStart, lineStart);
            } else {
              const prefix = bulletMatch[1];
              textarea.value = textarea.value.substring(0, start) + '\n' + prefix + textarea.value.substring(start);
              textarea.setSelectionRange(start + 1 + prefix.length, start + 1 + prefix.length);
            }
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            return;
          }
        }
      });
    }

    if (btnDownload) {
      btnDownload.addEventListener('click', () => {
        this.downloadNotesMarkdown();
      });
    }

    if (btnAppend && fileInput) {
      btnAppend.addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
          const importedText = ev.target.result;
          const currentText = textarea ? textarea.value : '';
          const separator = currentText.trim().length > 0 ? '\n\n---\n\n' : '';
          const dateStr = new Date().toLocaleDateString('es-ES');
          const appendedHeader = `### 📎 Anexo: ${file.name} (${dateStr})\n\n`;

          if (textarea) {
            textarea.value = currentText + separator + appendedHeader + importedText;
            this.updateNotesStats();
            this.setNotesViewMode('edit');
            textarea.focus();
            textarea.scrollTop = textarea.scrollHeight;
          }

          if (this.currentBook) {
            await window.storage.saveBookNotes(this.currentBook.id, textarea ? textarea.value : '');
            const statusEl = document.getElementById('notes-save-status');
            if (statusEl) {
              statusEl.innerHTML = '<span class="save-status-dot"></span> Guardado';
            }
          }

          fileInput.value = '';
          window.app.showToast(`Archivo "${file.name}" anexado a tus apuntes`);
        };

        reader.onerror = () => {
          window.app.showToast('Error al leer el archivo seleccionado');
        };

        reader.readAsText(file);
      });
    }
  }

  /**
   * Sets notes view mode: 'edit' or 'preview'
   */
  setNotesViewMode(mode = 'edit') {
    const btnEdit = document.getElementById('btn-notes-tab-edit');
    const btnPreview = document.getElementById('btn-notes-tab-preview');
    const textarea = document.getElementById('reader-notes-textarea');
    const previewEl = document.getElementById('reader-notes-preview');
    const formattingTools = document.getElementById('notes-formatting-tools');

    if (mode === 'preview') {
      if (btnEdit) btnEdit.classList.remove('active');
      if (btnPreview) btnPreview.classList.add('active');
      if (textarea) textarea.style.display = 'none';
      if (previewEl) previewEl.style.display = 'block';
      if (formattingTools) formattingTools.classList.add('disabled');
      this.renderNotesPreview();
    } else {
      if (btnEdit) btnEdit.classList.add('active');
      if (btnPreview) btnPreview.classList.remove('active');
      if (textarea) textarea.style.display = 'block';
      if (previewEl) previewEl.style.display = 'none';
      if (formattingTools) formattingTools.classList.remove('disabled');
      if (textarea) textarea.focus();
    }
  }

  /**
   * Applies markdown formatting (bold, italic, headings, lists, obsidian highlight, etc.)
   */
  applyMarkdownFormat(action) {
    const textarea = document.getElementById('reader-notes-textarea');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const hasSelection = start !== end;
    const selectedText = hasSelection ? text.substring(start, end) : '';

    // Inline wrapping formats
    const inlineFormats = {
      bold: { prefix: '**', suffix: '**', defaultText: 'texto en negrita' },
      italic: { prefix: '*', suffix: '*', defaultText: 'texto en cursiva' },
      strike: { prefix: '~~', suffix: '~~', defaultText: 'texto tachado' },
      highlight: { prefix: '==', suffix: '==', defaultText: 'texto resaltado' },
      code: { prefix: '`', suffix: '`', defaultText: 'código' }
    };

    if (inlineFormats[action]) {
      const { prefix, suffix, defaultText } = inlineFormats[action];
      if (hasSelection) {
        if (selectedText.startsWith(prefix) && selectedText.endsWith(suffix) && selectedText.length >= prefix.length + suffix.length) {
          const unwrapped = selectedText.slice(prefix.length, -suffix.length);
          textarea.value = text.substring(0, start) + unwrapped + text.substring(end);
          textarea.setSelectionRange(start, start + unwrapped.length);
        } else {
          const wrapped = prefix + selectedText + suffix;
          textarea.value = text.substring(0, start) + wrapped + text.substring(end);
          textarea.setSelectionRange(start, start + wrapped.length);
        }
      } else {
        const insertion = prefix + defaultText + suffix;
        textarea.value = text.substring(0, start) + insertion + text.substring(end);
        textarea.setSelectionRange(start + prefix.length, start + prefix.length + defaultText.length);
      }
      textarea.focus();
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // Line prefix formats (H1, H2, H3, quote, bullet, task)
    const linePrefixes = {
      h1: '# ',
      h2: '## ',
      h3: '### ',
      quote: '> ',
      'bullet-list': '- ',
      'task-list': '- [ ] '
    };

    if (linePrefixes[action]) {
      const prefix = linePrefixes[action];
      const startOfLine = text.lastIndexOf('\n', start - 1) + 1;
      let endOfLine = text.indexOf('\n', end);
      if (endOfLine === -1) endOfLine = text.length;

      const lines = text.substring(startOfLine, endOfLine).split('\n');

      const formatted = lines.map(line => {
        if (prefix.startsWith('#')) {
          const clean = line.replace(/^#{1,6}\s*/, '');
          const fallback = action === 'h1' ? 'Título Principal' : action === 'h2' ? 'Subtítulo' : 'Sección';
          return prefix + (clean || fallback);
        }
        if (prefix === '- [ ] ') {
          if (line.match(/^[-*+]\s+\[[ xX]\]\s+/)) {
            return line.replace(/^[-*+]\s+\[[ xX]\]\s+/, '');
          }
          const clean = line.replace(/^(\s*[-*+]|\s*\d+\.)\s*/, '');
          return prefix + clean;
        }
        if (prefix === '- ') {
          if (line.startsWith('- ')) return line.substring(2);
          return prefix + line.replace(/^[-*+]\s+/, '');
        }
        if (prefix === '> ') {
          if (line.startsWith('> ')) return line.substring(2);
          return prefix + line;
        }
        return prefix + line;
      });

      const replacement = formatted.join('\n');
      textarea.value = text.substring(0, startOfLine) + replacement + text.substring(endOfLine);
      textarea.setSelectionRange(startOfLine, startOfLine + replacement.length);
      textarea.focus();
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    if (action === 'hr') {
      const insertion = '\n\n---\n\n';
      textarea.value = text.substring(0, start) + insertion + text.substring(end);
      const newPos = start + insertion.length;
      textarea.setSelectionRange(newPos, newPos);
      textarea.focus();
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
  }

  /**
   * Renders markdown text into the live Obsidian preview pane
   */
  renderNotesPreview() {
    const textarea = document.getElementById('reader-notes-textarea');
    const previewEl = document.getElementById('reader-notes-preview');
    if (!previewEl) return;
    const text = textarea ? textarea.value : '';
    previewEl.innerHTML = this.parseObsidianMarkdown(text);
  }

  /**
   * High-fidelity Obsidian-style Markdown Parser
   * Supports: H1-H6, **bold**, *italic*, ~~strike~~, ==highlight==, lists, task checkboxes,
   * blockquotes, code blocks, inline code, wikilinks, links, horizontal rules
   */
  parseObsidianMarkdown(markdown) {
    if (!markdown || !markdown.trim()) {
      return `<div class="obsidian-empty-preview">
        <p style="font-size: 1.1rem; margin-bottom: 6px; font-weight: 600;">📝 Libreta sin notas</p>
        <p style="font-size: 0.82rem; opacity: 0.8;">Escribe tus apuntes en la pestaña <strong>Editar</strong> con formato Markdown tipo Obsidian.</p>
      </div>`;
    }

    const escapeHtml = (str) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    // 1. Protect code blocks
    const codeBlocks = [];
    let processed = markdown.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push(`<pre class="obsidian-code-block"><code class="language-${escapeHtml(lang || 'text')}">${escapeHtml(code.trim())}</code></pre>`);
      return `§§CODEBLOCK${idx}§§`;
    });

    // 2. Protect inline code
    const inlineCodes = [];
    processed = processed.replace(/`([^`\n]+)`/g, (match, code) => {
      const idx = inlineCodes.length;
      inlineCodes.push(`<code class="obsidian-inline-code">${escapeHtml(code)}</code>`);
      return `§§INLINECODE${idx}§§`;
    });

    // Helper for inline styles
    const parseInline = (str) => {
      let s = escapeHtml(str);
      // Obsidian Highlight: ==text==
      s = s.replace(/==(.*?)==/g, '<mark class="obsidian-highlight">$1</mark>');
      // Bold + Italic: ***text***
      s = s.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
      // Bold: **text** or __text__
      s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/__(.*?)__/g, '<strong>$1</strong>');
      // Italic: *text* or _text_
      s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
      // Strikethrough: ~~text~~
      s = s.replace(/~~(.*?)~~/g, '<del>$1</del>');
      // Obsidian Wikilink: [[page]]
      s = s.replace(/\[\[(.*?)\]\]/g, '<span class="obsidian-wikilink">[[ $1 ]]</span>');
      // Standard Link: [text](url)
      s = s.replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="obsidian-link">$1</a>');
      return s;
    };

    const lines = processed.split('\n');
    const output = [];
    let inList = null;
    let inBlockquote = false;
    let blockquoteBuffer = [];

    const flushList = () => {
      if (inList) {
        if (inList === 'task') output.push('</ul>');
        else output.push(`</${inList}>`);
        inList = null;
      }
    };

    const flushBlockquote = () => {
      if (inBlockquote) {
        const content = blockquoteBuffer.map(b => parseInline(b)).join('<br>');
        output.push(`<blockquote class="obsidian-quote">${content}</blockquote>`);
        inBlockquote = false;
        blockquoteBuffer = [];
      }
    };

    lines.forEach((line, lineIdx) => {
      // Check if line is purely a protected codeblock
      const cbMatch = line.trim().match(/^§§CODEBLOCK(\d+)§§$/);
      if (cbMatch) {
        flushList();
        flushBlockquote();
        const idx = parseInt(cbMatch[1], 10);
        output.push(codeBlocks[idx]);
        return;
      }

      // Blockquote
      const bqMatch = line.match(/^>\s?(.*)$/);
      if (bqMatch) {
        flushList();
        inBlockquote = true;
        blockquoteBuffer.push(bqMatch[1]);
        return;
      } else {
        flushBlockquote();
      }

      // Horizontal Rule
      if (/^(?:---|\*\*\*|___)\s*$/.test(line)) {
        flushList();
        output.push('<hr class="obsidian-hr">');
        return;
      }

      // Headings # H1 to ###### H6
      const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (hMatch) {
        flushList();
        const level = hMatch[1].length;
        const text = parseInline(hMatch[2]);
        output.push(`<h${level} class="obsidian-h${level}">${text}</h${level}>`);
        return;
      }

      // Task List: - [ ] or - [x]
      const taskMatch = line.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/);
      if (taskMatch) {
        if (inList !== 'task') {
          flushList();
          output.push('<ul class="obsidian-task-list">');
          inList = 'task';
        }
        const isChecked = taskMatch[1].toLowerCase() === 'x';
        const text = parseInline(taskMatch[2]);
        output.push(`<li class="obsidian-task-item ${isChecked ? 'completed' : ''}" data-line-index="${lineIdx}">
          <input type="checkbox" class="obsidian-task-checkbox" ${isChecked ? 'checked' : ''}>
          <span>${text}</span>
        </li>`);
        return;
      }

      // Bullet List: - or * or +
      const bulletMatch = line.match(/^[-*+]\s+(.*)$/);
      if (bulletMatch) {
        if (inList !== 'ul') {
          flushList();
          output.push('<ul class="obsidian-ul">');
          inList = 'ul';
        }
        output.push(`<li>${parseInline(bulletMatch[1])}</li>`);
        return;
      }

      // Ordered List: 1. 2.
      const numMatch = line.match(/^\d+\.\s+(.*)$/);
      if (numMatch) {
        if (inList !== 'ol') {
          flushList();
          output.push('<ol class="obsidian-ol">');
          inList = 'ol';
        }
        output.push(`<li>${parseInline(numMatch[1])}</li>`);
        return;
      }

      // Empty spacing line
      if (!line.trim()) {
        flushList();
        output.push('<div class="obsidian-spacing"></div>');
        return;
      }

      // Standard Paragraph
      flushList();
      output.push(`<p class="obsidian-p">${parseInline(line)}</p>`);
    });

    flushList();
    flushBlockquote();

    let html = output.join('\n');

    // Restore protected blocks
    codeBlocks.forEach((block, idx) => {
      html = html.replace(new RegExp(`§§CODEBLOCK${idx}§§`, 'g'), block);
    });
    inlineCodes.forEach((code, idx) => {
      html = html.replace(new RegExp(`§§INLINECODE${idx}§§`, 'g'), code);
    });

    return html;
  }

  toggleNotesDrawer() {
    const drawer = document.getElementById('reader-notes-drawer');
    if (!drawer) return;
    if (drawer.classList.contains('open')) {
      this.closeNotesDrawer();
    } else {
      this.openNotesDrawer();
    }
  }

  openNotesDrawer() {
    const drawer = document.getElementById('reader-notes-drawer');
    const btnTab = document.getElementById('btn-reader-notes-tab');
    const textarea = document.getElementById('reader-notes-textarea');
    if (drawer) drawer.classList.add('open');
    if (btnTab) btnTab.classList.add('active');
    if (this.container) this.container.classList.add('notes-drawer-open');
    if (textarea) {
      setTimeout(() => textarea.focus(), 250);
    }
    this.updateNotesStats();
  }

  closeNotesDrawer() {
    const drawer = document.getElementById('reader-notes-drawer');
    const btnTab = document.getElementById('btn-reader-notes-tab');
    if (drawer) drawer.classList.remove('open');
    if (btnTab) btnTab.classList.remove('active');
    if (this.container) this.container.classList.remove('notes-drawer-open');
  }

  loadBookNotes() {
    if (!this.currentBook) return;
    const titleEl = document.getElementById('notes-book-title');
    const textarea = document.getElementById('reader-notes-textarea');
    const statusEl = document.getElementById('notes-save-status');

    if (titleEl) titleEl.textContent = this.currentBook.title;
    if (textarea) {
      textarea.value = window.storage.getBookNotes(this.currentBook.id) || '';
    }
    if (statusEl) {
      statusEl.innerHTML = '<span class="save-status-dot"></span> Guardado';
    }
    this.updateNotesStats();
    if (document.getElementById('btn-notes-tab-preview')?.classList.contains('active')) {
      this.renderNotesPreview();
    }
  }

  updateNotesStats() {
    const textarea = document.getElementById('reader-notes-textarea');
    const charEl = document.getElementById('notes-char-count');
    const wordEl = document.getElementById('notes-word-count');
    if (!textarea) return;

    const text = textarea.value.trim();
    const chars = text.length;
    const words = text ? text.split(/\s+/).length : 0;

    if (charEl) charEl.textContent = `${chars.toLocaleString()} ${chars === 1 ? 'carácter' : 'caracteres'}`;
    if (wordEl) wordEl.textContent = `${words.toLocaleString()} ${words === 1 ? 'palabra' : 'palabras'}`;
  }

  downloadNotesMarkdown() {
    if (!this.currentBook) return;
    const textarea = document.getElementById('reader-notes-textarea');
    const notesText = textarea ? textarea.value : '';
    const title = this.currentBook.title || 'Libro';
    const author = this.currentBook.author || 'Desconocido';
    const dateStr = new Date().toLocaleDateString('es-ES', { dateStyle: 'full' });

    const mdContent = `# Apuntes de Lectura: ${title}\n\n` +
      `> **Autor:** ${author}  \n` +
      `> **Fecha de descarga:** ${dateStr}  \n` +
      `> **Aplicación:** LICBook  \n\n` +
      `---\n\n` +
      (notesText.trim() ? notesText : '*Sin apuntes registrados aún.*') +
      `\n\n---\n*Exportado automáticamente desde LICBook - Tu Biblioteca Personal.*`;

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '_').substring(0, 40).trim();
    a.href = url;
    a.download = `Apuntes - ${safeTitle}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    window.app.showToast('Apuntes descargados en formato .md');
  }

  /* ==========================================================================
     In-Book Search Engine (Ctrl + F)
     ========================================================================== */
  openSearchBar() {
    const searchBar = document.getElementById('reader-search-bar');
    const searchInput = document.getElementById('reader-search-input');
    if (!searchBar) return;

    searchBar.style.display = 'flex';
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
      if (searchInput.value.trim().length >= 2) {
        this.performSearch(searchInput.value.trim());
      }
    }
  }

  closeSearchBar() {
    const searchBar = document.getElementById('reader-search-bar');
    const searchResultsDropdown = document.getElementById('reader-search-results');
    if (searchBar) {
      searchBar.style.display = 'none';
    }
    if (searchResultsDropdown) {
      searchResultsDropdown.style.display = 'none';
    }
    this.clearSearchHighlights();
  }

  toggleSearchBar() {
    const searchBar = document.getElementById('reader-search-bar');
    if (!searchBar) return;
    if (searchBar.style.display === 'none' || !searchBar.style.display) {
      this.openSearchBar();
    } else {
      this.closeSearchBar();
    }
  }

  isSearchBarOpen() {
    const searchBar = document.getElementById('reader-search-bar');
    return searchBar ? searchBar.style.display !== 'none' : false;
  }

  async extractPageText(pageNum) {
    if (this.searchCache.has(pageNum)) {
      return this.searchCache.get(pageNum);
    }
    if (this.pdfDoc) {
      try {
        const page = await this.pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const text = textContent.items.map(item => item.str).join(' ');
        this.searchCache.set(pageNum, text);
        return text;
      } catch (e) {
        return '';
      }
    } else {
      // Fallback book sample text
      const sampleText = pageNum === 1
        ? `${this.currentBook.title} ${(this.currentBook.authors || []).join(' ')} ${this.currentBook.publisher}`
        : `Capítulo ${Math.ceil(pageNum / 2)}. En aquel lugar de la memoria donde las historias cobran vida, cada página leída es una ventana hacia mundos inexplorados y conocimientos profundos. La lectura enriquece el pensamiento crítico, expande la imaginación y conecta a los lectores con las ideas más brillantes. Con LICBook, tu biblioteca personal permanece siempre en tus manos: local, privada, accesible y con la más alta calidad visual.`;
      this.searchCache.set(pageNum, sampleText);
      return sampleText;
    }
  }

  async performSearch(query) {
    query = (query || '').trim();
    const countEl = document.getElementById('reader-search-matches-count');
    const dropdown = document.getElementById('reader-search-results');

    if (query.length < 2) {
      this.searchResults = [];
      this.currentSearchIndex = -1;
      if (countEl) countEl.textContent = '0 resultados';
      if (dropdown) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
      }
      this.clearSearchHighlights();
      return;
    }

    if (countEl) countEl.textContent = 'Buscando...';
    const lowerQuery = query.toLowerCase();
    const results = [];

    for (let p = 1; p <= this.numPages; p++) {
      const pageText = await this.extractPageText(p);
      const lowerText = pageText.toLowerCase();

      let startIdx = 0;
      while (true) {
        const foundIdx = lowerText.indexOf(lowerQuery, startIdx);
        if (foundIdx === -1) break;

        const snippetStart = Math.max(0, foundIdx - 35);
        const snippetEnd = Math.min(pageText.length, foundIdx + query.length + 35);
        const prefix = snippetStart > 0 ? '...' : '';
        const suffix = snippetEnd < pageText.length ? '...' : '';
        const before = pageText.slice(snippetStart, foundIdx);
        const matchText = pageText.slice(foundIdx, foundIdx + query.length);
        const after = pageText.slice(foundIdx + query.length, snippetEnd);

        results.push({
          page: p,
          prefix,
          before: this.escapeHtml(before),
          match: this.escapeHtml(matchText),
          after: this.escapeHtml(after),
          suffix
        });

        startIdx = foundIdx + query.length;
        if (results.length >= 100) break;
      }
      if (results.length >= 100) break;
    }

    this.searchResults = results;

    if (results.length > 0) {
      this.currentSearchIndex = 0;
      if (countEl) countEl.textContent = `1 de ${results.length}`;
      this.renderSearchResultsDropdown();
      this.goToSearchResult(0);
    } else {
      this.currentSearchIndex = -1;
      if (countEl) countEl.textContent = '0 resultados';
      if (dropdown) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
      }
      this.clearSearchHighlights();
    }
  }

  renderSearchResultsDropdown() {
    const dropdown = document.getElementById('reader-search-results');
    if (!dropdown) return;

    if (this.searchResults.length === 0) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      return;
    }

    dropdown.style.display = 'flex';
    dropdown.innerHTML = '';

    this.searchResults.forEach((res, idx) => {
      const item = document.createElement('div');
      item.className = `search-result-item ${idx === this.currentSearchIndex ? 'active' : ''}`;
      item.dataset.index = idx;
      item.innerHTML = `
        <div class="search-result-snippet">
          ${res.prefix}${res.before}<mark>${res.match}</mark>${res.after}${res.suffix}
        </div>
        <span class="search-result-badge">Pág. ${this.getPageLabel(res.page)}</span>
      `;
      item.onclick = () => {
        this.goToSearchResult(idx);
      };
      dropdown.appendChild(item);
    });
  }

  goToSearchResult(index) {
    if (index < 0 || index >= this.searchResults.length) return;
    this.currentSearchIndex = index;
    const match = this.searchResults[index];

    // Jump to matching page
    this.goToPage(match.page);

    // Update match count indicator
    const countEl = document.getElementById('reader-search-matches-count');
    if (countEl) {
      countEl.textContent = `${index + 1} de ${this.searchResults.length}`;
    }

    // Update active item in dropdown
    const dropdown = document.getElementById('reader-search-results');
    if (dropdown) {
      const items = dropdown.querySelectorAll('.search-result-item');
      items.forEach((it, i) => {
        it.classList.toggle('active', i === index);
        if (i === index) {
          it.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
    }

    // Highlight search match in text layer
    const searchInput = document.getElementById('reader-search-input');
    if (searchInput) {
      this.highlightSearchInPage(match.page, searchInput.value.trim());
    }
  }

  nextSearchResult() {
    if (this.searchResults.length === 0) return;
    const nextIdx = (this.currentSearchIndex + 1) % this.searchResults.length;
    this.goToSearchResult(nextIdx);
  }

  prevSearchResult() {
    if (this.searchResults.length === 0) return;
    const prevIdx = (this.currentSearchIndex - 1 + this.searchResults.length) % this.searchResults.length;
    this.goToSearchResult(prevIdx);
  }

  highlightSearchInPage(pageNum, query) {
    this.clearSearchHighlights();
    if (!query) return;

    const lowerQuery = query.toLowerCase();
    const pageCard = document.getElementById(`vertical-page-${pageNum}`);
    if (!pageCard) return;

    const textLayer = pageCard.querySelector('.textLayer');
    if (!textLayer) return;

    const spans = textLayer.querySelectorAll('span');
    for (const span of spans) {
      if (span.textContent.toLowerCase().includes(lowerQuery)) {
        span.classList.add('search-highlight-active');
      }
    }
  }

  clearSearchHighlights() {
    document.querySelectorAll('.textLayer .search-highlight-active').forEach(span => {
      span.classList.remove('search-highlight-active');
    });
  }
}

window.reader = new ReaderEngine();
