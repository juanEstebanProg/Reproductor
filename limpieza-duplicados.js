// HERRAMIENTA DE LIMPIEZA DE DUPLICADOS
// Ejecuta esto en la consola del navegador (F12 > Console) para limpiar duplicados

async function limpiarDuplicados() {
    console.log('🧹 Iniciando limpieza de duplicados...');
    
    // Esperar a que se inicialice la base de datos
    if (!db) {
        console.log('⏳ Esperando inicialización de base de datos...');
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    try {
        // Obtener todas las canciones
        const savedSongs = await getAllSongsFromDB();
        console.log(`📊 Encontradas ${savedSongs.length} canciones en la base de datos`);
        
        // Agrupar por hash para encontrar duplicados
        const songsByHash = {};
        savedSongs.forEach(song => {
            const hash = song.fileHash || `${song.name}_${song.size}_${song.type}`;
            if (!songsByHash[hash]) {
                songsByHash[hash] = [];
            }
            songsByHash[hash].push(song);
        });
        
        // Identificar duplicados
        const duplicados = Object.values(songsByHash).filter(group => group.length > 1);
        const totalDuplicados = duplicados.reduce((total, group) => total + (group.length - 1), 0);
        
        if (totalDuplicados === 0) {
            console.log('✅ No se encontraron duplicados');
            return;
        }
        
        console.log(`🔍 Encontrados ${totalDuplicados} duplicados en ${duplicados.length} grupos`);
        
        // Confirmar eliminación
        if (confirm(`Se encontraron ${totalDuplicados} duplicados. ¿Proceder con la limpieza?`)) {
            
            // Eliminar duplicados, mantener solo el primero de cada grupo
            let eliminados = 0;
            for (let group of duplicados) {
                // Mantener el primero, eliminar el resto
                const aEliminar = group.slice(1);
                
                for (let song of aEliminar) {
                    try {
                        await deleteSongFromDB(song.id);
                        eliminados++;
                        console.log(`🗑️ Eliminado duplicado: ${song.name}`);
                    } catch (error) {
                        console.error(`Error al eliminar ${song.name}:`, error);
                    }
                }
            }
            
            console.log(`✅ Limpieza completada. ${eliminados} duplicados eliminados.`);
            
            // Limpiar memoria
            playlist = [];
            localStorage.removeItem('musicPlayerPlaylist');
            
            alert(`✅ Limpieza completada!\n\n${eliminados} duplicados eliminados.\nRecarga la página para ver los cambios.`);
        }
        
    } catch (error) {
        console.error('Error durante la limpieza:', error);
        alert('❌ Error durante la limpieza: ' + error.message);
    }
}

// Ejecutar limpieza automáticamente
limpiarDuplicados();