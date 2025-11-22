// Service Worker para Mi Reproductor de Música
const CACHE_NAME = 'mi-reproductor-v1.0.0';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// Instalar Service Worker
self.addEventListener('install', function(event) {
    console.log('Service Worker: Instalando...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('Service Worker: Abriendo caché');
                return cache.addAll(urlsToCache);
            })
            .then(function() {
                console.log('Service Worker: Archivos en caché');
                return self.skipWaiting();
            })
            .catch(function(error) {
                console.log('Service Worker: Error al hacer caché', error);
            })
    );
});

// Activar Service Worker
self.addEventListener('activate', function(event) {
    console.log('Service Worker: Activando...');
    
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Eliminando caché antiguo', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(function() {
            console.log('Service Worker: Activado');
            return self.clients.claim();
        })
    );
});

// Interceptar requests
self.addEventListener('fetch', function(event) {
    // Solo manejar requests GET
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Estrategia de caché: Cache First con Network Fallback
    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                // Si encontramos el archivo en caché, lo devolvemos
                if (response) {
                    console.log('Service Worker: Sirviendo desde caché', event.request.url);
                    return response;
                }
                
                // Si no está en caché, lo buscamos en la red
                return fetch(event.request)
                    .then(function(response) {
                        // Verificar que es una respuesta válida
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // Clonar la respuesta para guardarla en caché
                        const responseToCache = response.clone();
                        
                        caches.open(CACHE_NAME)
                            .then(function(cache) {
                                cache.put(event.request, responseToCache);
                            });
                        
                        console.log('Service Worker: Guardando en caché', event.request.url);
                        return response;
                    })
                    .catch(function(error) {
                        console.log('Service Worker: Error en la red', error);
                        
                        // Para archivos de audio, mostrar mensaje de error
                        if (event.request.url.includes('.mp3') || 
                            event.request.url.includes('.wav') || 
                            event.request.url.includes('.ogg')) {
                            return new Response(
                                JSON.stringify({
                                    error: 'No se puede cargar el archivo de audio',
                                    offline: true
                                }),
                                {
                                    headers: { 'Content-Type': 'application/json' }
                                }
                            );
                        }
                        
                        // Para otros archivos, intentar servir la página principal
                        if (event.request.mode === 'navigate') {
                            return caches.match('/');
                        }
                        
                        // Si no hay conexión y no es navegación, devolver error
                        return new Response(
                            'Sin conexión a internet',
                            { 
                                status: 503,
                                statusText: 'Service Unavailable'
                            }
                        );
                    });
            })
    );
});

// Manejar mensajes del cliente
self.addEventListener('message', function(event) {
    console.log('Service Worker: Mensaje recibido', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.delete(CACHE_NAME).then(function() {
                console.log('Service Worker: Caché eliminado');
                event.ports[0].postMessage({ success: true });
            })
        );
    }
});

// Manejar notificaciones push (para futura funcionalidad)
self.addEventListener('push', function(event) {
    console.log('Service Worker: Notificación push recibida');
    
    const options = {
        body: event.data ? event.data.text() : 'Nueva funcionalidad disponible',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'Explorar',
                icon: '/icons/icon-192.png'
            },
            {
                action: 'close',
                title: 'Cerrar',
                icon: '/icons/icon-192.png'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('Mi Música', options)
    );
});

// Manejar clicks en notificaciones
self.addEventListener('notificationclick', function(event) {
    console.log('Service Worker: Click en notificación', event);
    
    event.notification.close();
    
    if (event.action === 'explore') {
        event.waitUntil(
            clients.openWindow('/')
        );
    } else if (event.action === 'close') {
        // Simplemente cerrar la notificación
        return;
    } else {
        // Click en la notificación (sin action específica)
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Manejar actualizaciones de la aplicación
self.addEventListener('updatefound', function(event) {
    console.log('Service Worker: Actualización encontrada');
    
    const newWorker = event.registration.installing;
    
    newWorker.addEventListener('statechange', function() {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Nueva versión disponible
            console.log('Service Worker: Nueva versión instalada');
            
            // Mostrar notificación de actualización
            self.registration.showNotification('Actualización disponible', {
                body: 'Una nueva versión de la aplicación está disponible. Recarga para actualizar.',
                icon: '/icons/icon-192.png',
                tag: 'update-available'
            });
        }
    });
});

// Funciones auxiliares para caché
function cacheAudioFile(url) {
    return fetch(url)
        .then(response => {
            if (response.ok) {
                return caches.open(CACHE_NAME)
                    .then(cache => cache.put(url, response));
            }
            throw new Error('No se pudo cachear el archivo');
        });
}

function clearAudioCache() {
    return caches.open(CACHE_NAME)
        .then(cache => {
            return cache.keys()
                .then(requests => {
                    const audioRequests = requests.filter(request => 
                        request.url.includes('.mp3') || 
                        request.url.includes('.wav') || 
                        request.url.includes('.ogg')
                    );
                    return Promise.all(
                        audioRequests.map(request => cache.delete(request))
                    );
                });
        });
}