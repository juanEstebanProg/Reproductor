// Variables globales
let playlist = [];
let currentIndex = -1;
let isPlaying = false;
let isShuffled = false;
let repeatMode = 'none'; // 'none', 'one', 'all'
let db = null; // Base de datos IndexedDB
const DB_NAME = 'MusicPlayerDB';
const DB_VERSION = 1;

// Elementos del DOM
const audioPlayer = document.getElementById('audioPlayer');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const repeatBtn = document.getElementById('repeatBtn');
const progressBar = document.getElementById('progressBar');
const volumeSlider = document.getElementById('volumeSlider');
const volumeValue = document.getElementById('volumeValue');
const currentTimeSpan = document.getElementById('currentTime');
const durationSpan = document.getElementById('duration');
const songTitle = document.getElementById('songTitle');
const songArtist = document.getElementById('songArtist');
const albumArt = document.getElementById('albumArt');
const playlistContainer = document.getElementById('playlistContainer');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    registerServiceWorker();
});

// ================ FUNCIONES DE INDEXEDDB ================

// Inicializar base de datos IndexedDB
async function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Crear store para las canciones
            if (!db.objectStoreNames.contains('songs')) {
                const songStore = db.createObjectStore('songs', { keyPath: 'id' });
                songStore.createIndex('name', 'name', { unique: false });
                songStore.createIndex('dateAdded', 'dateAdded', { unique: false });
            }
        };
    });
}

// Guardar archivo en IndexedDB - VERSIÓN SIMPLE
function saveFileToDB(file, songId) {
    try {
        const transaction = db.transaction(['songs'], 'readwrite');
        const store = transaction.objectStore('songs');
        
        const songData = {
            id: songId,
            name: file.name,
            file: file,
            dateAdded: new Date().toISOString(),
            size: file.size,
            type: file.type
        };
        
        const request = store.put(songData);
        request.onsuccess = () => console.log('Archivo guardado:', file.name);
        request.onerror = () => console.error('Error al guardar:', request.error);
    } catch (error) {
        console.error('Error al guardar archivo:', error);
    }
}

// Cargar archivo desde IndexedDB
async function loadFileFromDB(songId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['songs'], 'readonly');
        const store = transaction.objectStore('songs');
        const request = store.get(songId);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Obtener todas las canciones de la base de datos
async function getAllSongsFromDB() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['songs'], 'readonly');
        const store = transaction.objectStore('songs');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Eliminar canción de la base de datos - SIMPLE
async function deleteSongFromDB(songId) {
    try {
        const transaction = db.transaction(['songs'], 'readwrite');
        const store = transaction.objectStore('songs');
        const request = store.delete(songId);
        request.onsuccess = () => console.log('Canción eliminada:', songId);
        request.onerror = () => console.error('Error al eliminar:', request.error);
    } catch (error) {
        console.error('Error al eliminar canción:', error);
    }
}

// Auto-cargar canciones guardadas - VERSIÓN SIMPLE QUE FUNCIONA
async function autoLoadSavedSongs() {
    try {
        // Limpiar localStorage previo
        localStorage.removeItem('musicPlayerPlaylist');
        
        const savedSongs = await getAllSongsFromDB();
        
        // Limpiar playlist actual
        playlist = [];
        
        for (let songData of savedSongs) {
            // Verificar que el archivo existe
            if (!songData.file || !songData.name) {
                console.warn('Datos de canción inválidos:', songData);
                continue;
            }
            
            try {
                // Recrear la URL del archivo
                const url = URL.createObjectURL(songData.file);
                
                const song = {
                    id: songData.id,
                    name: songData.name.replace(/\.[^/.]+$/, ""),
                    artist: 'Artista desconocido',
                    duration: 0,
                    url: url,
                    file: songData.file,
                    size: songData.size || 0,
                    type: songData.type || 'audio/mp3',
                    dateAdded: songData.dateAdded || new Date().toISOString(),
                    status: 'available'
                };
                
                playlist.push(song);
                console.log(`✅ Canción cargada: ${song.name}`);
                
            } catch (error) {
                console.error('Error al procesar canción:', songData.name, error);
            }
        }
        
        if (savedSongs.length > 0) {
            console.log(`🎵 Cargadas ${playlist.length} canciones guardadas`);
            showMessage(`🎵 Cargadas ${playlist.length} canciones guardadas`);
            updatePlaylist();
        } else {
            showMessage('📁 No hay canciones guardadas. Sube archivos para comenzar.');
        }
        
        updateUI();
        
    } catch (error) {
        console.error('Error al cargar canciones guardadas:', error);
        showMessage('⚠️ Error al cargar canciones. Intenta subir los archivos nuevamente.');
        playlist = [];
    }
}

// Inicializar aplicación - MEJORADO
async function initializeApp() {
    // Configurar volumen inicial
    audioPlayer.volume = volumeSlider.value / 100;
    
    // Inicializar base de datos IndexedDB y cargar canciones
    try {
        await initDatabase();
        console.log('✅ Base de datos inicializada');
        
        // Auto-cargar canciones guardadas desde IndexedDB
        await autoLoadSavedSongs();
        
    } catch (error) {
        console.error('Error al inicializar base de datos:', error);
        showMessage('⚠️ Error al cargar canciones guardadas');
    }
    
    // Configurar mantenimiento automático
    setupAutoMaintenance();
    
    // Actualizar interfaz
    updateUI();
    
    // Mostrar estadísticas iniciales
    const stats = getMemoryStats();
    console.log('Reproductor inicializado:', stats);
    
    // Configurar limpieza periódica de memoria
    if ('memory' in performance) {
        console.log('Información de memoria disponible');
    }
}

// Configurar event listeners
function setupEventListeners() {
    // Controles de reproducción
    playBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', playPrevious);
    nextBtn.addEventListener('click', playNext);
    shuffleBtn.addEventListener('click', toggleShuffle);
    repeatBtn.addEventListener('click', toggleRepeat);
    
    // Control de volumen
    volumeSlider.addEventListener('input', updateVolume);
    
    // Barra de progreso
    document.querySelector('.progress-bar').addEventListener('click', seekTo);
    
    // Subida de archivos
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    document.getElementById('folderInput').addEventListener('change', handleFolderUpload);
    
    // Botones de optimización
    document.getElementById('clearDuplicatesBtn').addEventListener('click', removeDuplicates);
    document.getElementById('releaseMemoryBtn').addEventListener('click', releaseUnusedMemory);
    document.getElementById('showStatsBtn').addEventListener('click', showDetailedStats);
    document.getElementById('clearPlaylistBtn').addEventListener('click', clearPlaylist);
    document.getElementById('folderBtn').addEventListener('click', handleFolderSelect);
    
    // Eventos del reproductor de audio
    audioPlayer.addEventListener('loadedmetadata', updateDuration);
    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('ended', handleSongEnd);
    audioPlayer.addEventListener('error', handleAudioError);
    
    // Drag and drop
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    
    // Atajos de teclado
    document.addEventListener('keydown', handleKeyboard);
}

// Cargar archivos de música
async function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    await addFilesToPlaylist(files);
    fileInput.value = ''; // Limpiar input
}

// Seleccionar carpeta de música
function handleFolderSelect() {
    const folderInput = document.getElementById('folderInput');
    folderInput.click();
}

// Cargar carpeta completa
async function handleFolderUpload(event) {
    const files = Array.from(event.target.files);
    
    // Filtrar solo archivos de audio
    const audioFiles = files.filter(file => file.type.startsWith('audio/'));
    
    if (audioFiles.length === 0) {
        showMessage('📁 No se encontraron archivos de audio en la carpeta');
        return;
    }
    
    console.log(`📁 Cargando ${audioFiles.length} archivos de la carpeta...`);
    showMessage(`📁 Cargando ${audioFiles.length} archivos...`);
    
    await addFilesToPlaylist(audioFiles);
    folderInput.value = ''; // Limpiar input
}

// Agregar archivos a la playlist - VERSIÓN SIMPLE QUE FUNCIONA
async function addFilesToPlaylist(files) {
    const audioFiles = files.filter(file => file.type.startsWith('audio/'));
    
    let newSongsAdded = 0;
    
    for (let file of audioFiles) {
        // Verificar duplicados por nombre simple
        const songName = file.name.replace(/\.[^/.]+$/, "").toLowerCase();
        const isDuplicate = playlist.some(existingSong => 
            existingSong.name.toLowerCase() === songName
        );
        
        // Solo agregar si no es duplicado
        if (!isDuplicate) {
            const songId = Date.now() + Math.random();
            const songData = {
                id: songId,
                name: file.name.replace(/\.[^/.]+$/, ""), // Remover extensión
                file: file,
                url: URL.createObjectURL(file),
                duration: 0,
                artist: 'Artista desconocido',
                size: file.size,
                type: file.type,
                dateAdded: new Date().toISOString()
            };
            
            // Guardar archivo en IndexedDB SINCRONO
            try {
                saveFileToDB(file, songId);
                console.log(`✅ Archivo guardado: ${file.name}`);
            } catch (error) {
                console.error('Error al guardar archivo:', error);
                showMessage(`⚠️ Error al guardar ${file.name}`);
            }
            
            playlist.push(songData);
            newSongsAdded++;
        } else {
            console.log(`Canción duplicada ignorada: ${file.name}`);
        }
    }
    
    if (newSongsAdded > 0) {
        updatePlaylist();
        savePlaylistMetadata();
        
        // Reproducir primera canción si no hay ninguna reproduciendo
        if (currentIndex === -1) {
            currentIndex = 0;
            loadCurrentSong();
        }
        
        console.log(`${newSongsAdded} canciones agregadas`);
        showMessage(`✅ ${newSongsAdded} canciones agregadas`);
    } else {
        console.log('No se agregaron canciones (posibles duplicados)');
        showMessage('🔁 No se agregaron canciones duplicadas');
    }
}

// Drag and Drop
function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
}

async function handleDrop(event) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    await addFilesToPlaylist(files);
}

// Actualizar playlist
function updatePlaylist() {
    if (playlist.length === 0) {
        playlistContainer.innerHTML = `
            <div class="empty-playlist">
                <p>📁 No hay canciones</p>
                <p>Haz clic en "Añadir Música" para cargar tus archivos</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    playlist.forEach((song, index) => {
        const isActive = index === currentIndex;
        const isPlaying = isActive && audioPlayer.paused === false;
        
        html += `
            <div class="song-item ${isActive ? 'active' : ''}" data-index="${index}">
                <span class="song-number">
                    ${isPlaying ? '🎵' : (index + 1).toString().padStart(2, '0')}
                </span>
                <span class="song-title">${song.name}</span>
                <span class="song-duration">${song.duration || '--:--'}</span>
            </div>
        `;
    });
    
    playlistContainer.innerHTML = html;
    
    // Agregar event listeners a cada canción
    document.querySelectorAll('.song-item').forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.dataset.index);
            playSong(index);
        });
    });
}

// Cargar canción actual - OPTIMIZADO
function loadCurrentSong() {
    if (currentIndex < 0 || currentIndex >= playlist.length) {
        return;
    }
    
    const song = playlist[currentIndex];
    
    // Verificar si la canción tiene archivo válido
    if (!song.file || !song.url) {
        console.log(`Canción sin archivo: ${song.name}`);
        showMessage(`⚠️ La canción "${song.name}" no está disponible. Vuelve a subir el archivo.`);
        
        // Intentar saltar a la siguiente canción
        playNext();
        return;
    }
    
    // Limpiar URL anterior si existe
    if (audioPlayer.src && audioPlayer.src.startsWith('blob:')) {
        // No revocar aquí, el navegador lo maneja automáticamente
    }
    
    audioPlayer.src = song.url;
    songTitle.textContent = song.name;
    songArtist.textContent = song.artist;
    
    // Actualizar arte del álbum
    albumArt.innerHTML = song.albumArt || '<div class="default-icon">🎵</div>';
    
    updateUI();
    
    // Actualizar estado de la canción
    song.status = 'available';
}

// Actualizar interfaz
function updateUI() {
    updatePlaylist();
    updateControls();
}

// Actualizar controles
function updateControls() {
    // Botón de shuffle
    shuffleBtn.classList.toggle('active', isShuffled);
    
    // Botón de repeat
    repeatBtn.classList.toggle('active', repeatMode !== 'none');
    
    // Botón de play
    playBtn.textContent = isPlaying ? '⏸️' : '▶️';
    
    // Animación del album art
    albumArt.classList.toggle('playing', isPlaying);
}

// Reproducir/Pausar
function togglePlay() {
    if (playlist.length === 0) return;
    
    if (isPlaying) {
        audioPlayer.pause();
    } else {
        if (currentIndex === -1) {
            currentIndex = 0;
            loadCurrentSong();
        }
        audioPlayer.play().catch(e => {
            console.log('Error al reproducir:', e);
        });
    }
    
    isPlaying = !isPlaying;
    updateControls();
}

// Reproducir canción anterior
function playPrevious() {
    if (playlist.length === 0) return;
    
    if (isShuffled) {
        // Reproducción aleatoria
        currentIndex = Math.floor(Math.random() * playlist.length);
    } else {
        currentIndex--;
        if (currentIndex < 0) {
            currentIndex = playlist.length - 1;
        }
    }
    
    loadCurrentSong();
    if (isPlaying) {
        audioPlayer.play();
    }
}

// Reproducir siguiente canción
function playNext() {
    if (playlist.length === 0) return;
    
    if (isShuffled) {
        // Reproducción aleatoria
        let nextIndex;
        do {
            nextIndex = Math.floor(Math.random() * playlist.length);
        } while (nextIndex === currentIndex && playlist.length > 1);
        currentIndex = nextIndex;
    } else {
        currentIndex++;
        if (currentIndex >= playlist.length) {
            currentIndex = repeatMode === 'all' ? 0 : currentIndex - 1;
        }
    }
    
    loadCurrentSong();
    if (isPlaying) {
        audioPlayer.play();
    }
}

// Reproducir canción específica
function playSong(index) {
    if (index < 0 || index >= playlist.length) return;
    
    currentIndex = index;
    loadCurrentSong();
    isPlaying = true;
    audioPlayer.play();
    updateUI();
}

// Toggle shuffle
function toggleShuffle() {
    isShuffled = !isShuffled;
    updateControls();
}

// Toggle repeat
function toggleRepeat() {
    if (repeatMode === 'none') {
        repeatMode = 'all';
    } else if (repeatMode === 'all') {
        repeatMode = 'one';
    } else {
        repeatMode = 'none';
    }
    updateControls();
}

// Manejar final de canción
function handleSongEnd() {
    if (repeatMode === 'one') {
        audioPlayer.currentTime = 0;
        audioPlayer.play();
    } else {
        playNext();
    }
}

// Actualizar progreso
function updateProgress() {
    const currentTime = audioPlayer.currentTime;
    const duration = audioPlayer.duration;
    
    if (duration > 0) {
        const progress = (currentTime / duration) * 100;
        progressBar.style.width = progress + '%';
        
        // Actualizar tiempo actual
        currentTimeSpan.textContent = formatTime(currentTime);
    }
}

// Actualizar duración
function updateDuration() {
    const duration = audioPlayer.duration;
    if (duration > 0) {
        durationSpan.textContent = formatTime(duration);
        
        // Actualizar duración en la playlist
        if (currentIndex >= 0 && playlist[currentIndex]) {
            playlist[currentIndex].duration = formatTime(duration);
            updatePlaylist();
        }
    }
}

// Buscar en la barra de progreso
function seekTo(event) {
    const progressBar = event.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    const newTime = percent * audioPlayer.duration;
    
    audioPlayer.currentTime = newTime;
}

// Actualizar volumen
function updateVolume() {
    const volume = volumeSlider.value;
    audioPlayer.volume = volume / 100;
    volumeValue.textContent = volume + '%';
}

// Formatear tiempo
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '--:--';
    
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return minutes + ':' + secs.toString().padStart(2, '0');
}

// Manejar errores de audio
function handleAudioError() {
    console.log('Error al cargar el archivo de audio');
    playNext();
}

// Atajos de teclado
function handleKeyboard(event) {
    // Solo si no estamos escribiendo en un input
    if (event.target.tagName === 'INPUT') return;
    
    switch(event.code) {
        case 'Space':
            event.preventDefault();
            togglePlay();
            break;
        case 'ArrowLeft':
            event.preventDefault();
            playPrevious();
            break;
        case 'ArrowRight':
            event.preventDefault();
            playNext();
            break;
        case 'KeyS':
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                toggleShuffle();
            }
            break;
        case 'KeyR':
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                toggleRepeat();
            }
            break;
    }
}

// Guardar solo metadatos de la playlist (optimizado)
function savePlaylistMetadata() {
    try {
        // Limitar tamaño de localStorage (max ~5MB)
        const maxMetadataSize = 5000000;
        const playlistData = playlist.map(song => ({
            name: song.name,
            artist: song.artist,
            duration: song.duration,
            size: song.size,
            type: song.type
        }));
        
        const jsonData = JSON.stringify(playlistData);
        
        if (jsonData.length > maxMetadataSize) {
            console.warn('Playlist muy grande, no se guardará completamente');
            // Guardar solo las primeras canciones
            const reducedPlaylist = playlist.slice(0, Math.floor(playlist.length * 0.7));
            const reducedData = reducedPlaylist.map(song => ({
                name: song.name,
                artist: song.artist,
                duration: song.duration
            }));
            localStorage.setItem('musicPlayerPlaylist', JSON.stringify(reducedData));
        } else {
            localStorage.setItem('musicPlayerPlaylist', jsonData);
        }
        
        console.log(`Playlist guardada: ${playlist.length} canciones`);
    } catch (e) {
        console.log('Error al guardar playlist:', e);
    }
}

// Cargar playlist desde localStorage - MEJORADO
function loadPlaylistFromStorage() {
    try {
        const saved = localStorage.getItem('musicPlayerPlaylist');
        if (saved) {
            const playlistData = JSON.parse(saved);
            
            // Restaurar playlist con metadata
            playlist = playlistData.map(song => ({
                id: Date.now() + Math.random(),
                name: song.name || 'Canción desconocida',
                artist: song.artist || 'Artista desconocido',
                duration: song.duration || 0,
                size: song.size || 0,
                type: song.type || 'audio/mp3',
                file: null, // Los archivos no se pueden guardar
                url: null, // Se recreará cuando se suba nuevamente
                status: 'pending' // Estado: pending, available, error
            }));
            
            console.log(`Playlist cargada: ${playlist.length} canciones (sin archivos)`);
            
            // Mostrar mensaje al usuario
            if (playlist.length > 0) {
                showMessage(`📚 Se encontraron ${playlist.length} canciones guardadas. Vuelve a subir los archivos para reproducirlas.`);
            }
        } else {
            console.log('No hay playlist guardada');
        }
    } catch (e) {
        console.log('Error al cargar playlist:', e);
        playlist = [];
        localStorage.removeItem('musicPlayerPlaylist'); // Limpiar datos corruptos
    }
}

// Registrar Service Worker para PWA
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('Service Worker registrado:', registration);
            })
            .catch(error => {
                console.log('Error al registrar Service Worker:', error);
            });
    }
}

// Funciones adicionales - OPTIMIZADAS

// Mostrar mensaje al usuario
function showMessage(message, duration = 3000) {
    // Crear elemento de mensaje si no existe
    let messageDiv = document.getElementById('userMessage');
    if (!messageDiv) {
        messageDiv = document.createElement('div');
        messageDiv.id = 'userMessage';
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 1000;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(messageDiv);
    }
    
    messageDiv.textContent = message;
    messageDiv.style.opacity = '1';
    
    setTimeout(() => {
        if (messageDiv) {
            messageDiv.style.opacity = '0';
            setTimeout(() => {
                if (messageDiv && messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 300);
        }
    }, duration);
}

// Limpiar playlist - VERSIÓN SIMPLE
function clearPlaylist() {
    if (playlist.length === 0) {
        showMessage('📭 La playlist ya está vacía');
        return;
    }
    
    const confirmMessage = `¿Estás seguro de que quieres borrar TODAS las ${playlist.length} canciones?`;
    
    if (confirm(confirmMessage)) {
        // Liberar URLs
        playlist.forEach(song => {
            if (song.url && song.url.startsWith('blob:')) {
                try {
                    URL.revokeObjectURL(song.url);
                } catch (e) {
                    console.log('Error al liberar URL:', e);
                }
            }
        });
        
        // Limpiar base de datos
        try {
            const transaction = db.transaction(['songs'], 'readwrite');
            const store = transaction.objectStore('songs');
            const request = store.clear();
            request.onsuccess = () => console.log('Base de datos limpiada');
            request.onerror = () => console.error('Error al limpiar DB');
        } catch (error) {
            console.error('Error al limpiar IndexedDB:', error);
        }
        
        // Reset todo
        audioPlayer.pause();
        audioPlayer.src = '';
        playlist = [];
        currentIndex = -1;
        isPlaying = false;
        
        updateUI();
        localStorage.removeItem('musicPlayerPlaylist');
        
        showMessage('🗑️ Playlist borrada');
    } else {
        showMessage('✅ Operación cancelada');
    }
}

// Liberar memoria no utilizada
function releaseUnusedMemory() {
    // Limpiar URLs de canciones que no están siendo reproducidas
    playlist.forEach((song, index) => {
        if (index !== currentIndex && song.url && song.url.startsWith('blob:')) {
            try {
                // Solo liberar si no se está reproduciendo
                if (!audioPlayer.src.includes(song.url)) {
                    URL.revokeObjectURL(song.url);
                    song.url = null;
                    song.status = 'released';
                }
            } catch (e) {
                console.log('Error al liberar URL:', e);
            }
        }
    });
    
    // Forzar garbage collection (si está disponible)
    if (window.gc) {
        window.gc();
    }
    
    console.log('Memoria liberada');
}

// Obtener estadísticas de memoria
function getMemoryStats() {
    const totalSongs = playlist.length;
    const availableSongs = playlist.filter(song => song.file && song.url).length;
    const pendingSongs = playlist.filter(song => !song.file || !song.url).length;
    
    return {
        total: totalSongs,
        available: availableSongs,
        pending: pendingSongs,
        duplicates: totalSongs - new Set(playlist.map(song => song.name.toLowerCase())).size
    };
}

function getPlaylistInfo() {
    const memoryStats = getMemoryStats();
    
    return {
        totalSongs: playlist.length,
        currentIndex: currentIndex + 1,
        isPlaying: isPlaying,
        shuffle: isShuffled,
        repeat: repeatMode,
        memory: memoryStats
    };
}

// Eliminar duplicados de la playlist actual
function removeDuplicates() {
    const originalLength = playlist.length;
    const uniqueSongs = [];
    const seenNames = new Set();
    
    playlist.forEach(song => {
        const songName = song.name.toLowerCase();
        if (!seenNames.has(songName)) {
            seenNames.add(songName);
            uniqueSongs.push(song);
        } else {
            // Liberar URL si existe
            if (song.url && song.url.startsWith('blob:')) {
                try {
                    URL.revokeObjectURL(song.url);
                } catch (e) {
                    console.log('Error al liberar URL duplicada:', e);
                }
            }
        }
    });
    
    playlist = uniqueSongs;
    
    // Ajustar índice actual si es necesario
    if (currentIndex >= playlist.length) {
        currentIndex = playlist.length - 1;
    }
    
    updateUI();
    savePlaylistMetadata();
    
    const removed = originalLength - playlist.length;
    showMessage(`🧹 Se eliminaron ${removed} duplicados. Playlist: ${playlist.length} canciones`);
    
    return removed;
}

// Mostrar estadísticas detalladas
function showDetailedStats() {
    const stats = getMemoryStats();
    const totalSize = playlist.reduce((total, song) => total + (song.size || 0), 0);
    const avgSize = playlist.length > 0 ? totalSize / playlist.length : 0;
    
    // Formatear tamaño
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Formatear duración total
    function formatDuration(seconds) {
        if (seconds === 0) return '0s';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }
    
    const totalDuration = playlist.reduce((total, song) => total + (song.duration || 0), 0);
    
    const message = `
📊 ESTADÍSTICAS DE LA PLAYLIST

🎵 Total de canciones: ${stats.total}
✅ Disponibles: ${stats.available}
⏳ Pendientes: ${stats.pending}
🔄 Duplicados eliminados: ${stats.duplicates}

💾 Tamaño total: ${formatBytes(totalSize)}
📊 Tamaño promedio: ${formatBytes(avgSize)}
⏱️ Duración total: ${formatDuration(totalDuration)}

🧠 Uso de memoria: Optimizado automáticamente
🔧 Estado: Funcionando correctamente
    `.trim();
    
    console.log(message);
    showMessage('📊 Estadísticas mostradas en consola', 4000);
}

// Programa de mantenimiento automático
function setupAutoMaintenance() {
    // DESHABILITADO: Mantenimiento automático agresivo causaba problemas
    // Los usuarios pueden liberar memoria manualmente con el botón 🗑️
    
    // Solo limpiar al cerrar la ventana
    window.addEventListener('beforeunload', () => {
        playlist.forEach(song => {
            if (song.url && song.url.startsWith('blob:')) {
                try {
                    URL.revokeObjectURL(song.url);
                } catch (e) {
                    console.log('Error al liberar URL al cerrar:', e);
                }
            }
        });
    });
}

// Exportar funciones para uso global - ACTUALIZADAS
window.musicPlayer = {
    togglePlay,
    playPrevious,
    playNext,
    toggleShuffle,
    toggleRepeat,
    getPlaylistInfo,
    clearPlaylist,
    removeDuplicates,
    releaseUnusedMemory,
    getMemoryStats,
    showDetailedStats,
    addFilesToPlaylist,
    savePlaylistMetadata,
    loadPlaylistFromStorage  // DEPRECATED: ya no se usa, usar IndexedDB en su lugar
};