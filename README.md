# LICBook - Tu Biblioteca Personal Local-First 📚✨

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Manual de Usuario](https://img.shields.io/badge/Manual-HTML%20Oficial-success.svg)](manual.html)
[![Portable App](https://img.shields.io/badge/Windows-Portable%20App-blue.svg)](#-opción-1-ejecutable-portable-recomendado-para-windows)
[![Local First](https://img.shields.io/badge/Architecture-Local--First-blue.svg)](#características-principales)
[![Offline Ready](https://img.shields.io/badge/Offline-100%25%20Ready-success.svg)](#tecnologías-y-dependencias)

**LICBook** es una aplicación web moderna, privada e interactiva diseñada para gestionar tu biblioteca digital y leer libros en formato **PDF** y **ePub** directamente en el navegador. Construida bajo la filosofía **Local-First**, tus libros, apuntes y progreso permanecen siempre en tu dispositivo y bajo tu control.

---

## 🌟 Características Principales

### 📖 Motor de Lectura Avanzado
- **3 Modos de Visualización:**
  - 📜 **Desplazamiento Vertical Continuo:** Ideal para documentos, apuntes y lectura fluida en pantalla.
  - 📄 **Paginación Horizontal:** Lectura clásica página a página con navegación precisa.
  - 📖 **Efecto de Libro 3D:** Experiencia inmersiva con animación de volteo de página realista.
- **Búsqueda Interna (`Ctrl + F`):** Localiza términos al instante dentro de libros PDF y ePub con resaltado visual y navegación entre coincidencias.
- **Marcapáginas e Historial:** Guarda automáticamente la última página leída y permite marcar fragmentos destacados.

### 📝 Libreta de Apuntes Integrada (Estilo Obsidian)
- Toma notas en tiempo real vinculadas a cada libro.
- Editor con soporte y renderizado de sintaxis **Markdown**.
- Funciones para **Descargar** tus apuntes en formato `.md` o **Anexar texto** directamente al cuaderno.

### 🗄️ Gestión de Biblioteca y Almacenamiento Local-First
- **Vincular Carpeta Local:** Integración con la *File System Access API* para sincronizar directorios de tu equipo sin subir archivos a la nube.
- **Persistencia en IndexedDB:** Conserva portadas, metadatos, estado de lectura y notas sin límites de almacenamiento convencional.
- **Importar / Exportar Catálogo:** Respalda y restaura tu biblioteca en formato JSON con un solo clic.
- **Vistas Intercambiables:** Alterna entre vista de **Cuadrícula** (estantería con portadas visuales) y vista de **Lista Detallada**.
- **Filtros Dinámicos:** Clasifica por estado (*Todos*, *Leyendo*, *Favoritos*, *Leídos*), género y editorial.
- **Búsqueda Global Instantánea:** Encuentra cualquier libro por título, autor, editorial, año o género.
- **Editor de Metadatos:** Asigna o reemplaza portadas personalizadas y edita sinopsis, autores, categorías y fechas.

### 🎨 8 Temas de Color Exclusivos
Personaliza la interfaz con paletas armonizadas y contrastes accesibles:
- 🟢 **Cyber Emerald** *(Predeterminado)*
- 🍦 **Lemon Ice-Cream**
- 🌑 **Obsidian Dark**
- 🔴 **Iron-Man**
- ☀️ **Clean Light**
- Y más combinaciones adaptadas tanto a la biblioteca como al visor de lectura.

### 🧭 Recorrido Guiado Interactivo (Tour)
- Asistente integrado que explica las herramientas principales a los nuevos usuarios.
- Posicionamiento inteligente con adaptación al tamaño de pantalla y navegación por teclado (`Enter`, flechas y `Esc`).

### 🎵 Mini-Reproductor Persistente
- Barra inferior estilo reproductor que muestra el libro activo, porcentaje de lectura y botón directo para continuar donde te quedaste.

---

## 🚀 Inicio Rápido

Dado que la aplicación utiliza tecnologías web modernas como la *File System Access API* e *IndexedDB* para la lectura fluida de PDF y ePub, debe ejecutarse a través de un servidor HTTP local.

### ⚡ Opción 1: Ejecutable Portable (Recomendado para Windows)
Solo haz **doble clic** en **`LICBookEdu.exe`**:
- **Cero dependencias:** No requiere instalar Python, Node.js ni ningún otro runtime externo.
- **100% Oculto:** El servidor HTTP se inicia en segundo plano en `http://localhost:8080/` sin consolas negras ni ventanas de comando.
- **Experiencia de Escritorio:** Abre Microsoft Edge automáticamente en modo aplicación (`--app=http://localhost:8080/`), sin barras de navegación innecesarias.
- **Persistencia garantizada:** Conserva tus libros, notas y datos de lectura en tu perfil local de usuario.
- **Auto-cierre inteligente:** Al cerrar la ventana de LICBookEdu, el servidor se detiene automáticamente y libera el puerto.

```text
LICBookEdu.exe
    ↓ doble clic
┌────────────────────────┐
│ inicia servidor        │
│ localhost:8080 (oculto)│
│ abre Edge en modo app  │
└────────────────────────┘
    ↓
📚 LICBookEdu
```

### Opción 2: Con Python
```bash
python -m http.server 8080
```
Abre tu navegador en: `http://localhost:8080`

### Opción 3: Con Node.js / npx
```bash
npx serve .
```

### Opción 4: Con VS Code
Instala la extensión **Live Server**, haz clic derecho sobre `index.html` y selecciona **"Open with Live Server"**.

---

## 📂 Estructura del Proyecto

```text
LICBook/
├── LICBookEdu.exe           # Servidor portable y lanzador nativo de Windows (sin dependencias)
├── launcher/
│   └── Program.cs           # Código fuente en C# del servidor portable y lanzador
├── assets/                  # Logotipo, app.ico, manual y recursos gráficos
├── css/
│   └── styles.css           # Sistema de diseño, 8 temas de color y estilos responsivos
├── js/
│   ├── app.js               # Punto de entrada y orquestador principal
│   ├── bookModal.js         # Ventana modal para agregar y editar metadatos
│   ├── catalog.js           # Renderizado del catálogo, filtros y reproductor inferior
│   ├── icons.js             # Definición y catálogo de iconos SVG en línea
│   ├── reader.js            # Motor del visor (PDF/ePub, modos 3D/scroll y libreta)
│   ├── storage.js           # Capa de datos (IndexedDB y File System Access API)
│   └── tour.js              # Gestor del recorrido guiado para nuevos usuarios
├── vendor/                  # Dependencias locales para funcionamiento 100% offline
│   ├── epub.min.js          # Motor de renderizado para archivos ePub
│   ├── jszip.min.js         # Descompresión para lectura de archivos ePub
│   ├── pdf.min.js           # Motor de renderizado PDF.js
│   └── pdf.worker.min.js    # Worker en segundo plano para PDF.js
├── index.html               # Estructura principal y contenedores de la app
├── manual.html              # Manual de usuario profesional interactivo
├── LICENSE                  # Licencia de código abierto MIT
└── README.md                # Documentación del proyecto
```

---

## ⌨️ Atajos de Teclado

| Atajo | Acción |
| :--- | :--- |
| `Ctrl + F` / `Cmd + F` | Abrir barra de búsqueda interna dentro del libro abierto |
| `Esc` | Cerrar modales, libreta de notas o salir del recorrido guiado |
| `Flecha Derecha` / `Enter` | Avanzar al siguiente paso del recorrido guiado |
| `Flecha Izquierda` | Retroceder al paso anterior del recorrido guiado |

---

## 🔒 Privacidad y Filosofía Local-First

1. **Sin servidores externos:** La aplicación no transmite tus libros, notas ni metadatos a ningún servidor remoto.
2. **Tus archivos se quedan en tu disco:** La vinculación de carpetas lee los archivos localmente a través de la API del navegador.
3. **Totalmente utilizable sin conexión:** Todos los scripts de terceros (`pdf.js`, `epub.js`, `jszip.js`) están empaquetados localmente en la carpeta `vendor/`, permitiendo utilizar la app sin acceso a Internet.

---

## 📄 Licencia

Este proyecto está bajo la Licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.
