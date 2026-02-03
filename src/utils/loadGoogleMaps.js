// Dynamically load Google Maps API with environment variable
let isLoading = false;
let isLoaded = false;
const callbacks = [];

export const loadGoogleMaps = () => {
    return new Promise((resolve, reject) => {
        // Already loaded
        if (isLoaded && window.google?.maps) {
            resolve(window.google.maps);
            return;
        }

        // Add to queue if currently loading
        if (isLoading) {
            callbacks.push({ resolve, reject });
            return;
        }

        isLoading = true;
        callbacks.push({ resolve, reject });

        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        console.log('[DEBUG] Loading Google Maps...');
        console.log('[DEBUG] API Key present:', !!apiKey);
        if (apiKey) console.log('[DEBUG] API Key length:', apiKey.length);

        if (!apiKey) {
            console.error('[DEBUG] VITE_GOOGLE_MAPS_API_KEY is missing!');
            const error = new Error('VITE_GOOGLE_MAPS_API_KEY is not defined');
            callbacks.forEach(cb => cb.reject(error));
            callbacks.length = 0;
            isLoading = false;
            return;
        }

        const scriptUrl = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
        console.log('[DEBUG] Script URL:', scriptUrl);

        const script = document.createElement('script');
        script.src = scriptUrl;
        script.async = true;
        script.defer = true;

        script.onload = () => {
            isLoaded = true;
            isLoading = false;
            callbacks.forEach(cb => cb.resolve(window.google.maps));
            callbacks.length = 0;
        };

        script.onerror = (e) => {
            isLoading = false;
            const error = new Error('Failed to load Google Maps');
            callbacks.forEach(cb => cb.reject(error));
            callbacks.length = 0;
        };

        document.head.appendChild(script);
    });
};

// Auto-load on import
loadGoogleMaps().catch(err => console.warn('Google Maps preload:', err.message));
