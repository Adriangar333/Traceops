
let googleMapsPromise = null;

export const loadGoogleMaps = () => {
    if (googleMapsPromise) return googleMapsPromise;

    googleMapsPromise = new Promise((resolve, reject) => {
        if (typeof window !== 'undefined' && window.google && window.google.maps) {
            resolve(window.google.maps);
            return;
        }

        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            reject(new Error('Google Maps API Key not found in environment variables (VITE_GOOGLE_MAPS_API_KEY)'));
            return;
        }

        const existingScript = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
        if (existingScript) {
            // Check periodically if loaded
            const interval = setInterval(() => {
                if (window.google && window.google.maps) {
                    clearInterval(interval);
                    resolve(window.google.maps);
                }
            }, 100);
            return;
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
        script.async = true;
        script.defer = true;
        script.id = 'google-maps-script';

        script.onload = () => {
            if (window.google && window.google.maps) {
                resolve(window.google.maps);
            } else {
                // Sometimes it takes a moment after onload
                const interval = setInterval(() => {
                    if (window.google && window.google.maps) {
                        clearInterval(interval);
                        resolve(window.google.maps);
                    }
                }, 50);
            }
        };

        script.onerror = (error) => {
            reject(new Error('Failed to load Google Maps API: ' + (error.message || 'script error')));
            googleMapsPromise = null;
        };

        document.head.appendChild(script);
    });

    return googleMapsPromise;
};
