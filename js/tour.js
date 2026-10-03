/**
 * LICBook - Interactive Guided Tour System
 * Provides a rich, beautiful onboarding experience for new and existing users.
 * Features:
 * - Dynamic SVG spotlight cutout with animated glowing halo
 * - Auto-scrolling to highlighted elements with collision-aware popover placement
 * - Interactive step navigation, progress dots, and keyboard shortcuts (Arrow / Esc)
 * - Automatic welcome invitation for first-time visitors
 * - Seamless integration with all 8 color themes
 */

class TourManager {
  constructor() {
    this.currentStep = 0;
    this.isActive = false;
    this.resizeHandler = null;
    this.scrollHandler = null;
    this.keyHandler = null;
    this.storageKey = 'licbook_tour_seen';

    this.steps = [
      {
        id: 'repo',
        target: '#btn-sync-directory',
        fallbackTarget: '.sidebar-storage-box',
        title: '📁 Vincula tu Carpeta Local',
        description: 'Conecta la carpeta donde guardas tus libros PDF y ePub. LICBook sincronizará automáticamente tu colección sin subirlos a internet, garantizando máxima velocidad y total privacidad.',
        placement: 'right'
      },
      {
        id: 'search',
        target: '.search-input-wrap',
        fallbackTarget: '#catalog-search-input',
        title: '🔍 Búsqueda y Filtros Rápidos',
        description: 'Encuentra cualquier título, autor o editorial en tiempo real. También puedes filtrar tus libros por favoritos, lecturas activas o géneros literarios.',
        placement: 'bottom'
      },
      {
        id: 'themes',
        target: '#btn-theme-modal',
        title: '🎨 8 Temas de Color Exclusivos',
        description: 'Elige tu estética favorita: Cyber Emerald, Lemon Ice-Cream, Obsidian Dark, Iron-Man y más. Toda la aplicación adapta sus colores y contrastes armónicamente.',
        placement: 'bottom'
      },
      {
        id: 'add-book',
        target: '#btn-add-book-header',
        title: '➕ Agregar Libros y Metadatos',
        description: 'Añade libros individuales desde tu navegador, asigna portadas personalizadas y edita títulos, autores y datos editoriales con el formulario integrado.',
        placement: 'bottom'
      },
      {
        id: 'view-mode',
        target: '.view-mode-toggle',
        title: '📑 Cuadrícula o Lista Detallada',
        description: 'Cambia entre la vista en estantería con portadas visuales o la vista en lista compacta con progreso y datos detallados de cada obra.',
        placement: 'bottom'
      },
      {
        id: 'reader-player',
        target: '#books-catalog-container',
        fallbackTarget: '.book-card',
        secondFallbackTarget: '#mini-player-bar',
        title: '📖 Lector Avanzado y Libreta',
        description: 'Abre cualquier libro para leer con desplazamiento vertical, horizontal o 3D, búsqueda interna (Ctrl+F) y apuntes con formato Markdown tipo Obsidian.',
        placement: 'top'
      }
    ];
  }

  init() {
    this.bindEvents();
    this.checkFirstVisit();
  }

  bindEvents() {
    // Header "?" help button
    const btnTour = document.getElementById('btn-start-tour');
    if (btnTour) {
      btnTour.addEventListener('click', () => {
        this.closeWelcomeModal();
        this.startTour();
      });
    }

    // Welcome modal buttons
    const btnStartWelcome = document.getElementById('btn-tour-start-welcome');
    if (btnStartWelcome) {
      btnStartWelcome.addEventListener('click', () => {
        this.closeWelcomeModal();
        this.startTour();
      });
    }

    const btnSkipWelcome = document.getElementById('btn-tour-skip-welcome');
    if (btnSkipWelcome) {
      btnSkipWelcome.addEventListener('click', async () => {
        this.markTourAsSeen();
        this.closeWelcomeModal();
        if (window.storage && typeof window.storage.removeSampleBooks === 'function') {
          await window.storage.removeSampleBooks();
        }
        if (window.catalog && typeof window.catalog.render === 'function') {
          await window.catalog.render();
        }
      });
    }

    // Popover buttons
    const btnClose = document.getElementById('btn-tour-close');
    if (btnClose) btnClose.addEventListener('click', () => this.endTour(false));

    const btnSkip = document.getElementById('btn-tour-skip');
    if (btnSkip) btnSkip.addEventListener('click', () => this.endTour(false));

    const btnPrev = document.getElementById('btn-tour-prev');
    if (btnPrev) btnPrev.addEventListener('click', () => this.prevStep());

    const btnNext = document.getElementById('btn-tour-next');
    if (btnNext) btnNext.addEventListener('click', () => this.nextStep());
  }

  checkFirstVisit() {
    try {
      const hasSeen = localStorage.getItem(this.storageKey);
      if (!hasSeen) {
        setTimeout(() => {
          this.openWelcomeModal();
        }, 800);
      }
    } catch (e) {
      console.warn('TourManager: Could not read localStorage', e);
    }
  }

  openWelcomeModal() {
    const modal = document.getElementById('tour-welcome-modal');
    if (modal) {
      modal.style.display = 'flex';
      void modal.offsetWidth;
      modal.classList.add('active');
    }
  }

  closeWelcomeModal() {
    const modal = document.getElementById('tour-welcome-modal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => {
        if (!modal.classList.contains('active')) {
          modal.style.display = 'none';
        }
      }, 250);
    }
  }

  markTourAsSeen() {
    try {
      localStorage.setItem(this.storageKey, 'true');
    } catch (e) {}
  }

  startTour() {
    this.currentStep = 0;
    this.isActive = true;

    const overlay = document.getElementById('tour-overlay');
    const popover = document.getElementById('tour-popover');

    if (overlay) overlay.style.display = 'block';
    if (popover) popover.style.display = 'block';

    // Add listeners
    this.resizeHandler = () => {
      if (this.isActive) this.updateSpotlightAndPosition();
    };
    window.addEventListener('resize', this.resizeHandler);

    this.scrollHandler = () => {
      if (this.isActive) this.updateSpotlightAndPosition();
    };
    window.addEventListener('scroll', this.scrollHandler, true);

    this.keyHandler = (e) => {
      if (!this.isActive) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        this.nextStep();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prevStep();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.endTour(false);
      }
    };
    document.addEventListener('keydown', this.keyHandler);

    this.renderStep();
  }

  renderStep() {
    const step = this.steps[this.currentStep];
    if (!step) {
      this.endTour(true);
      return;
    }

    // Step counter
    const counterEl = document.getElementById('tour-step-counter');
    if (counterEl) {
      counterEl.textContent = `Paso ${this.currentStep + 1} de ${this.steps.length}`;
    }

    // Title & Description
    const titleEl = document.getElementById('tour-step-title');
    if (titleEl) titleEl.textContent = step.title;

    const descEl = document.getElementById('tour-step-desc');
    if (descEl) descEl.textContent = step.description;

    // Progress dots
    const dotsContainer = document.getElementById('tour-progress-dots');
    if (dotsContainer) {
      dotsContainer.innerHTML = '';
      this.steps.forEach((_, idx) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = `tour-dot ${idx === this.currentStep ? 'active' : ''}`;
        dot.title = `Ir al paso ${idx + 1}`;
        dot.addEventListener('click', () => this.goToStep(idx));
        dotsContainer.appendChild(dot);
      });
    }

    // Buttons
    const btnPrev = document.getElementById('btn-tour-prev');
    if (btnPrev) {
      btnPrev.style.display = this.currentStep === 0 ? 'none' : 'inline-flex';
    }

    const btnNext = document.getElementById('btn-tour-next');
    if (btnNext) {
      btnNext.innerHTML = this.currentStep === this.steps.length - 1
        ? '<span>¡Empezar!</span>'
        : '<span>Siguiente</span>';
    }

    // Scroll to target element smoothly if not visible
    const targetEl = this.getTargetElement(step);
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const inView = (
        rect.top >= 50 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) - 50
      );
      if (!inView) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        setTimeout(() => this.updateSpotlightAndPosition(), 220);
        return;
      }
    }

    this.updateSpotlightAndPosition();
  }

  isElementVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.classList.contains('hidden') || el.classList.contains('d-none')) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  getTargetElement(step) {
    const targets = [step.target, step.fallbackTarget, step.secondFallbackTarget].filter(Boolean);
    for (const sel of targets) {
      try {
        const el = document.querySelector(sel);
        if (el && this.isElementVisible(el)) {
          return el;
        }
      } catch (e) {
        console.warn('Invalid selector in tour step:', sel, e);
      }
    }
    return null;
  }

  updateSpotlightAndPosition() {
    const step = this.steps[this.currentStep];
    if (!step) return;

    const targetEl = this.getTargetElement(step);
    const cutout = document.getElementById('tour-spotlight-cutout');
    const ring = document.getElementById('tour-highlight-ring');
    const popover = document.getElementById('tour-popover');
    const arrow = document.getElementById('tour-popover-arrow');

    if (!cutout || !ring || !popover) return;

    // Viewport dimensions & margins
    const winW = window.innerWidth || document.documentElement.clientWidth;
    const winH = window.innerHeight || document.documentElement.clientHeight;
    const margin = 16;

    // Ensure popover is visible so actual dimensions can be measured
    popover.style.display = 'block';
    const popoverWidth = popover.offsetWidth || 380;
    const popoverHeight = popover.offsetHeight || 220;

    if (!targetEl) {
      // Fallback: Center popover on screen if target element not found
      ring.style.display = 'none';
      cutout.setAttribute('width', 0);
      cutout.setAttribute('height', 0);
      popover.style.top = `${Math.round(Math.max(margin, (winH - popoverHeight) / 2))}px`;
      popover.style.left = `${Math.round(Math.max(margin, (winW - popoverWidth) / 2))}px`;
      if (arrow) arrow.className = 'tour-popover-arrow arrow-none';
      return;
    }

    ring.style.display = 'block';
    const rect = targetEl.getBoundingClientRect();
    const pad = 6;
    const x = Math.max(0, rect.left - pad);
    const y = Math.max(0, rect.top - pad);
    const width = rect.width + (pad * 2);
    const height = rect.height + (pad * 2);
    const radius = Math.min(14, Math.round(rect.height / 2));

    // Update SVG Spotlight Cutout
    cutout.setAttribute('x', x);
    cutout.setAttribute('y', y);
    cutout.setAttribute('width', width);
    cutout.setAttribute('height', height);
    cutout.setAttribute('rx', radius);
    cutout.setAttribute('ry', radius);

    // Update Highlight Ring
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.width = `${width}px`;
    ring.style.height = `${height}px`;
    ring.style.borderRadius = `${radius}px`;

    // Available space around target element
    const spaceAbove = rect.top;
    const spaceBelow = winH - rect.bottom;
    const spaceLeft = rect.left;
    const spaceRight = winW - rect.right;

    let preferred = step.placement || 'bottom';
    let actualPlacement = preferred;

    if (preferred === 'top') {
      if (spaceAbove >= popoverHeight + margin) {
        actualPlacement = 'top';
      } else if (spaceBelow >= popoverHeight + margin) {
        actualPlacement = 'bottom';
      } else {
        actualPlacement = spaceAbove >= spaceBelow ? 'top' : 'bottom';
      }
    } else if (preferred === 'bottom') {
      if (spaceBelow >= popoverHeight + margin) {
        actualPlacement = 'bottom';
      } else if (spaceAbove >= popoverHeight + margin) {
        actualPlacement = 'top';
      } else {
        actualPlacement = spaceBelow >= spaceAbove ? 'bottom' : 'top';
      }
    } else if (preferred === 'right') {
      if (spaceRight >= popoverWidth + margin) {
        actualPlacement = 'right';
      } else if (spaceBelow >= popoverHeight + margin) {
        actualPlacement = 'bottom';
      } else if (spaceAbove >= popoverHeight + margin) {
        actualPlacement = 'top';
      } else {
        actualPlacement = spaceBelow >= spaceAbove ? 'bottom' : 'top';
      }
    } else if (preferred === 'left') {
      if (spaceLeft >= popoverWidth + margin) {
        actualPlacement = 'left';
      } else if (spaceRight >= popoverWidth + margin) {
        actualPlacement = 'right';
      } else {
        actualPlacement = spaceBelow >= spaceAbove ? 'bottom' : 'top';
      }
    }

    let top = 0;
    let left = 0;
    let arrowClass = 'arrow-top';

    if (actualPlacement === 'top') {
      top = rect.top - popoverHeight - margin;
      left = rect.left + (rect.width / 2) - (popoverWidth / 2);
      arrowClass = 'arrow-bottom';
    } else if (actualPlacement === 'bottom') {
      top = rect.bottom + margin;
      left = rect.left + (rect.width / 2) - (popoverWidth / 2);
      arrowClass = 'arrow-top';
    } else if (actualPlacement === 'right') {
      left = rect.right + margin;
      top = rect.top + (rect.height / 2) - (popoverHeight / 2);
      arrowClass = 'arrow-left';
    } else if (actualPlacement === 'left') {
      left = rect.left - popoverWidth - margin;
      top = rect.top + (rect.height / 2) - (popoverHeight / 2);
      arrowClass = 'arrow-right';
    }

    // STRICT VIEWPORT CLAMPING: Popover is guaranteed to never overflow any edge!
    const minTop = margin;
    const maxTop = Math.max(margin, winH - popoverHeight - margin);
    const clampedTop = Math.max(minTop, Math.min(top, maxTop));

    const minLeft = margin;
    const maxLeft = Math.max(margin, winW - popoverWidth - margin);
    const clampedLeft = Math.max(minLeft, Math.min(left, maxLeft));

    popover.style.top = `${Math.round(clampedTop)}px`;
    popover.style.left = `${Math.round(clampedLeft)}px`;

    // Dynamic arrow positioning based on target center vs clamped popover
    if (arrow) {
      arrow.className = `tour-popover-arrow ${arrowClass}`;
      if (arrowClass === 'arrow-top' || arrowClass === 'arrow-bottom') {
        const targetCenterX = rect.left + (rect.width / 2);
        const arrowX = Math.max(20, Math.min(targetCenterX - clampedLeft, popoverWidth - 20));
        arrow.style.left = `${Math.round(arrowX)}px`;
        arrow.style.marginLeft = '-7px';
        arrow.style.top = '';
        arrow.style.marginTop = '';
      } else if (arrowClass === 'arrow-left' || arrowClass === 'arrow-right') {
        const targetCenterY = rect.top + (rect.height / 2);
        const arrowY = Math.max(20, Math.min(targetCenterY - clampedTop, popoverHeight - 20));
        arrow.style.top = `${Math.round(arrowY)}px`;
        arrow.style.marginTop = '-7px';
        arrow.style.left = '';
        arrow.style.marginLeft = '';
      } else {
        arrow.style.left = '';
        arrow.style.top = '';
      }
    }
  }

  nextStep() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.renderStep();
    } else {
      this.endTour(true);
    }
  }

  prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.renderStep();
    }
  }

  goToStep(index) {
    if (index >= 0 && index < this.steps.length) {
      this.currentStep = index;
      this.renderStep();
    }
  }

  endTour(completed = true) {
    this.isActive = false;
    this.markTourAsSeen();

    const overlay = document.getElementById('tour-overlay');
    const popover = document.getElementById('tour-popover');

    if (overlay) overlay.style.display = 'none';
    if (popover) popover.style.display = 'none';

    // Remove listeners
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    if (this.scrollHandler) window.removeEventListener('scroll', this.scrollHandler, true);
    if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);

    if (completed && window.app && window.app.showToast) {
      window.app.showToast('✨ ¡Recorrido completado! Disfruta de tu lectura en LICBook');
    }
  }
}

window.tour = new TourManager();
