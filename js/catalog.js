/**
 * LICBook - Catalog & Library UI Manager
 * Handles:
 * - Spotify-like Grid and List views
 * - Real-time search across Title, Author, Publisher, Genre, Year
 * - Filtering by Genre, Publisher, Favorites, and Reading Status
 * - Bottom Mini-Reader Player Bar with reading progress & quick resume
 */

class CatalogManager {
  constructor() {
    this.booksContainer = null;
    this.searchInput = null;
    this.genreSelect = null;
    this.publisherSelect = null;
    this.activeFilter = 'all'; // 'all', 'reading', 'favorites'
    this.currentViewMode = 'grid'; // 'grid' or 'list'
    this.currentSearchQuery = '';
    this.currentGenre = '';
    this.currentPublisher = '';
    this.bookPendingDelete = null;
  }

  init() {
    this.booksContainer = document.getElementById('books-catalog-container');
    this.searchInput = document.getElementById('catalog-search-input');
    this.genreSelect = document.getElementById('filter-genre-select');
    this.publisherSelect = document.getElementById('filter-publisher-select');

    this.bindEvents();
    this.render();
  }

  bindEvents() {
    // Search input
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.currentSearchQuery = e.target.value.toLowerCase().trim();
        this.render();
      });

      const clearBtn = document.getElementById('btn-clear-search');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          this.searchInput.value = '';
          this.currentSearchQuery = '';
          this.render();
        });
      }
    }

    // Filter pills
    const pills = document.querySelectorAll('.filter-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', (e) => {
        pills.forEach(p => p.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.activeFilter = e.currentTarget.dataset.filter;
        this.syncSidebarNav(this.activeFilter);
        this.render();
      });
    });

    // Sidebar & Bottom Navigation Items
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        navItems.forEach(n => n.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const nav = e.currentTarget.dataset.nav;
        this.activeFilter = nav === 'library' ? 'all' : nav;
        // Sync filter pills
        pills.forEach(p => {
          p.classList.toggle('active', p.dataset.filter === this.activeFilter);
        });
        this.render();
      });
    });

    // Dropdown filters
    if (this.genreSelect) {
      this.genreSelect.addEventListener('change', (e) => {
        this.currentGenre = e.target.value;
        this.render();
      });
    }

    if (this.publisherSelect) {
      this.publisherSelect.addEventListener('change', (e) => {
        this.currentPublisher = e.target.value;
        this.render();
      });
    }

    // View mode toggle (grid vs list)
    const btnGrid = document.getElementById('btn-view-grid');
    const btnList = document.getElementById('btn-view-list');
    if (btnGrid && btnList) {
      btnGrid.addEventListener('click', () => {
        this.currentViewMode = 'grid';
        btnGrid.classList.add('active');
        btnList.classList.remove('active');
        this.render();
      });

      btnList.addEventListener('click', () => {
        this.currentViewMode = 'list';
        btnList.classList.add('active');
        btnGrid.classList.remove('active');
        this.render();
      });
    }

    // Delete Book Confirmation Modal
    const btnCancelDelete = document.getElementById('btn-cancel-delete-book');
    const btnCloseDelete = document.getElementById('btn-close-delete-book-modal');
    const btnConfirmDelete = document.getElementById('btn-confirm-delete-book');
    const deleteModalOverlay = document.getElementById('delete-book-modal-overlay');

    if (btnCancelDelete) {
      btnCancelDelete.addEventListener('click', () => this.closeDeleteBookModal());
    }
    if (btnCloseDelete) {
      btnCloseDelete.addEventListener('click', () => this.closeDeleteBookModal());
    }
    if (btnConfirmDelete) {
      btnConfirmDelete.addEventListener('click', () => this.confirmDeleteBook());
    }
    if (deleteModalOverlay) {
      deleteModalOverlay.addEventListener('click', (e) => {
        if (e.target === deleteModalOverlay) {
          this.closeDeleteBookModal();
        }
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && deleteModalOverlay && deleteModalOverlay.classList.contains('active')) {
        this.closeDeleteBookModal();
      }
    });
  }

  syncSidebarNav(filter) {
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    navItems.forEach(n => {
      const navTarget = n.dataset.nav === 'library' ? 'all' : n.dataset.nav;
      n.classList.toggle('active', navTarget === filter);
    });
  }

  /**
   * Updates dropdowns with current existing genres and publishers
   */
  updateFilterDropdowns() {
    const books = window.storage.libraryData.books || [];
    
    // Genres
    const genres = [...new Set(books.map(b => b.genre).filter(Boolean))].sort();
    if (this.genreSelect) {
      const currentVal = this.genreSelect.value;
      this.genreSelect.innerHTML = `<option value="">Todos los Géneros (${genres.length})</option>`;
      genres.forEach(g => {
        const count = books.filter(b => b.genre === g).length;
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = `${g} (${count})`;
        if (g === currentVal) opt.selected = true;
        this.genreSelect.appendChild(opt);
      });
    }

    // Publishers
    const publishers = [...new Set(books.map(b => b.publisher).filter(Boolean))].sort();
    if (this.publisherSelect) {
      const currentVal = this.publisherSelect.value;
      this.publisherSelect.innerHTML = `<option value="">Todas las Editoriales (${publishers.length})</option>`;
      publishers.forEach(p => {
        const count = books.filter(b => b.publisher === p).length;
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = `${p} (${count})`;
        if (p === currentVal) opt.selected = true;
        this.publisherSelect.appendChild(opt);
      });
    }
  }

  /**
   * Filters and sorts books
   */
  getFilteredBooks() {
    let books = window.storage.libraryData.books || [];

    // Filter by quick pill
    if (this.activeFilter === 'reading') {
      books = books.filter(b => b.progressPercent > 0 && b.progressPercent < 100);
    } else if (this.activeFilter === 'favorites') {
      books = books.filter(b => b.isFavorite);
    } else if (this.activeFilter === 'completed') {
      books = books.filter(b => b.progressPercent >= 100);
    }

    // Filter by genre
    if (this.currentGenre) {
      books = books.filter(b => b.genre === this.currentGenre);
    }

    // Filter by publisher
    if (this.currentPublisher) {
      books = books.filter(b => b.publisher === this.currentPublisher);
    }

    // Search query
    if (this.currentSearchQuery) {
      const q = this.currentSearchQuery;
      books = books.filter(b => {
        const titleMatch = (b.title || '').toLowerCase().includes(q);
        const authorMatch = (b.authors || []).some(a => a.toLowerCase().includes(q));
        const publisherMatch = (b.publisher || '').toLowerCase().includes(q);
        const genreMatch = (b.genre || '').toLowerCase().includes(q);
        const yearMatch = String(b.year || '').includes(q);
        return titleMatch || authorMatch || publisherMatch || genreMatch || yearMatch;
      });
    }

    return books;
  }

  /**
   * Renders the catalog cards and updates the Spotify mini-player bar
   */
  async render() {
    this.updateFilterDropdowns();
    const books = this.getFilteredBooks();

    // Update stats count
    const statsEl = document.getElementById('catalog-stats-count');
    if (statsEl) {
      statsEl.textContent = `${books.length} ${books.length === 1 ? 'libro' : 'libros'}`;
    }

    if (!this.booksContainer) return;

    if (books.length === 0) {
      this.booksContainer.className = '';
      this.booksContainer.innerHTML = `
        <div class="empty-catalog-state">
          <div class="empty-icon-wrap">
            ${Icons.book(36)}
          </div>
          <h3 class="empty-title">No se encontraron libros</h3>
          <p class="empty-desc">
            ${this.currentSearchQuery || this.currentGenre || this.currentPublisher 
              ? 'Prueba ajustando los filtros o el término de búsqueda.' 
              : 'Tu biblioteca está lista. Haz clic en "Agregar Libro" para cargar tus archivos PDF o ePub.'}
          </p>
          <button class="btn-primary" onclick="window.bookModal.openAddModal()">
            ${Icons.plus(18)} Agregar mi primer libro
          </button>
        </div>
      `;
      this.updateMiniPlayer();
      return;
    }

    this.booksContainer.className = this.currentViewMode === 'grid' ? 'books-grid' : 'books-list';
    this.booksContainer.innerHTML = '';

    if (this.currentViewMode === 'list' && books.length > 0) {
      const headerRow = document.createElement('div');
      headerRow.className = 'books-list-header';
      headerRow.innerHTML = `
        <span class="col-hdr-cover"></span>
        <span class="col-hdr-title">Título</span>
        <span class="col-hdr-author">Autor</span>
        <span class="col-hdr-extra">Editorial y Año</span>
        <span class="col-hdr-actions">Acciones</span>
      `;
      this.booksContainer.appendChild(headerRow);
    }

    for (const book of books) {
      const card = await this.createBookCard(book);
      this.booksContainer.appendChild(card);
    }

    this.updateMiniPlayer();
  }

  /**
   * Creates a single interactive book card
   */
  async createBookCard(book) {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.dataset.bookId = book.id;

    // Load cover
    let coverUrl = book.coverDataUrl || await window.storage.getCover(book.id) || '';
    const hasCover = Boolean(coverUrl);
    const bookmarksCount = (book.bookmarks || []).length;

    const coverImgHtml = hasCover
      ? `<img class="book-cover-img" src="${coverUrl}" alt="${book.title}" loading="lazy" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />`
      : '';

    const fallbackCoverHtml = `
      <div class="book-cover-fallback" style="${hasCover ? 'display: none;' : 'display: flex;'}">
        <div class="cover-fallback-icon">${Icons.book(26)}</div>
        <div class="cover-fallback-content">
          <div class="cover-fallback-title">${book.title || 'Sin Título'}</div>
          <div class="cover-fallback-author">${(book.authors || ['Autor']).join(', ')}</div>
        </div>
      </div>
    `;

    card.innerHTML = `
      <div class="book-cover-wrap">
        ${coverImgHtml}
        ${fallbackCoverHtml}
        <span class="card-badge">${book.genre || 'Libro'}</span>
        
        ${bookmarksCount > 0 ? `
          <span class="card-bookmark-indicator" title="${bookmarksCount} marcapáginas guardados">
            ${Icons.bookmark(12, true)} ${bookmarksCount}
          </span>` : ''}

        <button class="btn-quick-read" title="Continuar lectura">
          ${Icons.play(20)}
        </button>

        <div class="card-progress-bar">
          <div class="card-progress-fill" style="width: ${book.progressPercent || 0}%"></div>
        </div>
      </div>

      <div class="book-meta">
        <h4 class="book-title" title="${book.title}">${book.title}</h4>
        <p class="book-author" title="${(book.authors || []).join(', ')}">${(book.authors || []).join(', ')}</p>
        <div class="book-extra-info">
          <span class="book-genre-tag">${book.publisher || 'Editorial'}</span>
          <span class="book-year">${book.year || ''}</span>
        </div>
      </div>

      <div class="card-actions">
        <button class="card-favorite-btn ${book.isFavorite ? 'is-favorite' : ''}" title="${book.isFavorite ? 'Quitar de favoritos' : 'Marcar favorito'}">
          ${Icons.star(16, book.isFavorite)}
        </button>
        <button class="card-options-btn" title="Opciones">
          ${Icons.moreVertical(16)}
        </button>
      </div>
    `;

    // Card click -> Open reader
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-favorite-btn') || e.target.closest('.card-options-btn')) {
        return;
      }
      window.reader.openBook(book.id);
    });

    // Favorite button click
    const favBtn = card.querySelector('.card-favorite-btn');
    if (favBtn) {
      favBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const isFav = await window.storage.toggleFavorite(book.id);
        favBtn.classList.toggle('is-favorite', isFav);
        favBtn.innerHTML = Icons.star(16, isFav);
        window.app.showToast(isFav ? 'Añadido a Favoritos' : 'Eliminado de Favoritos');
      });
    }

    // Context options button click
    const optBtn = card.querySelector('.card-options-btn');
    if (optBtn) {
      optBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showBookContextMenu(book, optBtn);
      });
    }

    return card;
  }

  /**
   * Shows mini context menu for a book (Edit, Delete, Info)
   */
  showBookContextMenu(book, targetEl) {
    const existingMenu = document.getElementById('book-context-menu');
    if (existingMenu) existingMenu.remove();

    const rect = targetEl.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.id = 'book-context-menu';
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.style.backgroundColor = 'var(--bg-sidebar)';
    menu.style.border = '1px solid var(--border-subtle)';
    menu.style.borderRadius = 'var(--radius-md)';
    menu.style.boxShadow = 'var(--shadow-lg)';
    menu.style.padding = '6px';
    menu.style.display = 'flex';
    menu.style.flexDirection = 'column';
    menu.style.gap = '4px';
    menu.style.zIndex = '600';
    menu.style.minWidth = '180px';

    menu.innerHTML = `
      <button class="dropdown-item" id="menu-opt-edit">
        ${Icons.edit(16)} Editar información
      </button>
      <button class="dropdown-item" id="menu-opt-read">
        ${Icons.bookOpen(16)} Leer libro
      </button>
      <button class="dropdown-item" id="menu-opt-delete" style="color: #ef4444;">
        ${Icons.trash(16)} Eliminar de biblioteca
      </button>
    `;

    document.body.appendChild(menu);

    // Menu actions
    document.getElementById('menu-opt-edit').addEventListener('click', () => {
      menu.remove();
      window.bookModal.openEditModal(book.id);
    });

    document.getElementById('menu-opt-read').addEventListener('click', () => {
      menu.remove();
      window.reader.openBook(book.id);
    });

    document.getElementById('menu-opt-delete').addEventListener('click', () => {
      menu.remove();
      this.promptDeleteBook(book);
    });

    // Close menu when clicking outside
    const closeListener = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeListener);
      }
    };
    setTimeout(() => document.addEventListener('click', closeListener), 10);
  }

  /**
   * Updates Spotify-like Mini-Player Bar at bottom with current active or last read book
   */
  async updateMiniPlayer() {
    const playerBar = document.getElementById('mini-player-bar');
    if (!playerBar) return;

    const books = window.storage.libraryData.books || [];
    if (books.length === 0) {
      playerBar.classList.add('hidden');
      return;
    }

    // Find currently reading or last read book
    const sorted = [...books].sort((a, b) => new Date(b.lastRead || 0) - new Date(a.lastRead || 0));
    const activeBook = sorted[0];

    if (!activeBook) {
      playerBar.classList.add('hidden');
      return;
    }

    playerBar.classList.remove('hidden');

    // Thumb
    const coverUrl = await window.storage.getCover(activeBook.id) || '';
    const thumbImg = document.getElementById('player-cover-thumb');
    if (thumbImg) thumbImg.src = coverUrl;

    // Info
    const titleEl = document.getElementById('player-book-title');
    const authorEl = document.getElementById('player-book-author');
    if (titleEl) titleEl.textContent = activeBook.title;
    if (authorEl) authorEl.textContent = (activeBook.authors || []).join(', ');

    // Progress
    const progressBar = document.getElementById('player-progress-bar');
    const percentEl = document.getElementById('player-percent-text');
    const pageTag = document.getElementById('player-page-tag');

    const percent = activeBook.progressPercent || 0;
    if (progressBar) progressBar.style.width = `${percent}%`;
    const bmCount = (activeBook.bookmarks || []).length;
    if (percentEl) percentEl.textContent = `${percent}% leído`;
    if (pageTag) {
      pageTag.innerHTML = `Pág. ${activeBook.currentPage || 1} / ${activeBook.totalPages || 1}${bmCount > 0 ? ` &bull; <span style="color:var(--brand-green);display:inline-flex;align-items:center;gap:2px;">${Icons.bookmark(12, true)} ${bmCount}</span>` : ''}`;
    }

    // Play button click -> Open reader at current page
    const playBtn = document.getElementById('btn-player-play');
    if (playBtn) {
      playBtn.onclick = () => window.reader.openBook(activeBook.id);
    }
  }

  /**
   * Opens custom confirmation modal to delete a book
   */
  promptDeleteBook(book) {
    if (!book) return;
    this.bookPendingDelete = book;
    const titleEl = document.getElementById('delete-book-title-display');
    if (titleEl) {
      titleEl.textContent = `"${book.title}"`;
    }
    const overlay = document.getElementById('delete-book-modal-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      void overlay.offsetWidth;
      overlay.classList.add('active');
    }
  }

  /**
   * Closes the delete confirmation modal
   */
  closeDeleteBookModal() {
    this.bookPendingDelete = null;
    const overlay = document.getElementById('delete-book-modal-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => {
        if (!overlay.classList.contains('active')) {
          overlay.style.display = 'none';
        }
      }, 250);
    }
  }

  /**
   * Confirms and executes book deletion from library
   */
  async confirmDeleteBook() {
    if (!this.bookPendingDelete) return;
    const bookId = this.bookPendingDelete.id;
    this.closeDeleteBookModal();
    await window.storage.deleteBook(bookId);
    this.render();
    this.updateMiniPlayer();
    window.app.showToast('Libro eliminado de la biblioteca');
  }
}

window.catalog = new CatalogManager();
