// Geocoding service using Google Maps APIs
// Uses Places API for autocomplete, Geocoding API for address lookup

let userLocation = null;

export const setUserLocation = (lat, lng) => {
    userLocation = { lat, lng };
    console.log('User location set:', userLocation);
};

import { loadGoogleMaps } from './loadGoogleMaps';

// Wait for Google Maps to be loaded
const waitForGoogle = async () => {
    await loadGoogleMaps();
};

// Search for address suggestions using Google Places Autocomplete
export const searchAddressSuggestions = async (query, limit = 5) => {
    if (!query || query.length < 3) return [];

    try {
        await waitForGoogle();

        return new Promise((resolve) => {
            const service = new window.google.maps.places.AutocompleteService();

            const request = {
                input: query,
                componentRestrictions: { country: 'co' },
                types: ['geocode', 'establishment'],
            };

            if (userLocation) {
                // Use locationBias (Circle object) instead of deprecated location/radius
                request.locationBias = {
                    radius: 50000,
                    center: { lat: userLocation.lat, lng: userLocation.lng }
                };
            } else {
                // Default bias to Barranquilla
                request.locationBias = {
                    radius: 50000,
                    center: { lat: 10.9685, lng: -74.7813 }
                };
            }

            service.getPlacePredictions(request, (predictions, status) => {
                if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
                    const suggestions = predictions.slice(0, limit).map(p => ({
                        placeId: p.place_id,
                        displayName: p.description,
                        shortName: p.structured_formatting?.main_text || p.description.split(',')[0],
                        type: p.types?.[0] || 'address'
                    }));
                    resolve(suggestions);
                } else {
                    console.log('Autocomplete status:', status);
                    resolve([]);
                }
            });
        });
    } catch (error) {
        console.error('Address search error:', error);
        return [];
    }
};

// Geocode address using Google Geocoder
export const geocodeAddress = async (address) => {
    if (!address || !address.trim()) {
        return { success: false, error: 'Empty address' };
    }

    console.log('Geocoding:', address);

    try {
        await waitForGoogle();

        return new Promise((resolve) => {
            const geocoder = new window.google.maps.Geocoder();

            const request = {
                address: address,
                region: 'co'
            };

            if (userLocation) {
                request.bounds = new window.google.maps.LatLngBounds(
                    { lat: userLocation.lat - 0.5, lng: userLocation.lng - 0.5 },
                    { lat: userLocation.lat + 0.5, lng: userLocation.lng + 0.5 }
                );
            }

            geocoder.geocode(request, (results, status) => {
                if (status === 'OK' && results && results[0]) {
                    const result = results[0];
                    const location = result.geometry.location;

                    resolve({
                        success: true,
                        lat: location.lat(),
                        lng: location.lng(),
                        displayName: result.formatted_address,
                        name: result.formatted_address.split(',')[0]
                    });
                } else {
                    console.error('Geocoder failed:', status);
                    resolve({ success: false, error: 'No se encontró la dirección' });
                }
            });
        });
    } catch (error) {
        console.error('Geocoding error:', error);
        return { success: false, error: error.message };
    }
};

// Geocode by Place ID (for autocomplete suggestions)
export const geocodeByPlaceId = async (placeId) => {
    try {
        await waitForGoogle();

        return new Promise((resolve) => {
            const geocoder = new window.google.maps.Geocoder();

            geocoder.geocode({ placeId: placeId }, (results, status) => {
                if (status === 'OK' && results && results[0]) {
                    const result = results[0];
                    const location = result.geometry.location;

                    resolve({
                        success: true,
                        lat: location.lat(),
                        lng: location.lng(),
                        displayName: result.formatted_address,
                        name: result.formatted_address.split(',')[0]
                    });
                } else {
                    resolve({ success: false, error: 'Place not found' });
                }
            });
        });
    } catch (error) {
        console.error('Geocode by placeId error:', error);
        return { success: false, error: error.message };
    }
};

// Reverse geocoding using Google Geocoder
export const reverseGeocode = async (lat, lng) => {
    setUserLocation(lat, lng);

    try {
        await waitForGoogle();

        return new Promise((resolve) => {
            const geocoder = new window.google.maps.Geocoder();

            geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                if (status === 'OK' && results && results[0]) {
                    const result = results[0];
                    const components = result.address_components;

                    const route = components.find(c => c.types.includes('route'))?.short_name || '';
                    const number = components.find(c => c.types.includes('street_number'))?.short_name || '';
                    const locality = components.find(c => c.types.includes('locality'))?.short_name ||
                        components.find(c => c.types.includes('administrative_area_level_2'))?.short_name || '';

                    resolve({
                        success: true,
                        address: result.formatted_address,
                        shortAddress: number ? `${route} #${number}, ${locality}` : `${route}, ${locality}`,
                        city: locality
                    });
                } else {
                    resolve({
                        success: true,
                        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
                        shortAddress: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
                        city: 'Colombia'
                    });
                }
            });
        });
    } catch (error) {
        console.error('Reverse geocode error:', error);
        return {
            success: true,
            address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            shortAddress: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            city: 'Colombia'
        };
    }
};

// Search for places using Google Places TextSearch (for queries like "restaurant", "gas station")
export const searchPlaces = async (query, limit = 5) => {
    try {
        await waitForGoogle();

        return new Promise((resolve) => {
            // PlacesService requires a map or a node. We use a dummy node.
            const dummyNode = document.createElement('div');
            const service = new window.google.maps.places.PlacesService(dummyNode);

            const request = {
                query: query,
            };

            // Use locationBias as recommended, falling back to Barranquilla if no user location
            const biasLocation = userLocation
                ? new window.google.maps.LatLng(userLocation.lat, userLocation.lng)
                : new window.google.maps.LatLng(10.9685, -74.7813); // Default Barranquilla

            request.location = biasLocation;
            request.radius = 5000;

            service.textSearch(request, (results, status) => {
                if (status === window.google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
                    // Return the top N results with more info
                    const suggestions = results.slice(0, limit).map(result => {
                        const photoUrl = result.photos && result.photos.length > 0
                            ? result.photos[0].getUrl({ maxWidth: 400 })
                            : null;

                        // Determine open status text
                        let openStatus = null;
                        if (result.opening_hours) {
                            openStatus = result.opening_hours.isOpen?.() ? 'Abierto' : 'Cerrado';
                        }

                        // Price level translation
                        const priceLevels = ['Gratis', '$', '$$', '$$$', '$$$$'];
                        const priceText = result.price_level !== undefined
                            ? priceLevels[result.price_level]
                            : null;

                        return {
                            placeId: result.place_id,
                            name: result.name,
                            displayName: result.formatted_address,
                            vicinity: result.vicinity || result.formatted_address?.split(',')[0],
                            lat: result.geometry.location.lat(),
                            lng: result.geometry.location.lng(),
                            rating: result.rating || 0,
                            user_ratings_total: result.user_ratings_total || 0,
                            photoUrl: photoUrl,
                            openStatus: openStatus,
                            priceLevel: priceText,
                            types: result.types?.slice(0, 2) || []
                        };
                    });

                    resolve({
                        success: true,
                        places: suggestions
                    });
                } else {
                    console.error('Places Search failed:', status);
                    resolve({ success: false, error: 'No se encontraron lugares.' });
                }
            });
        });
    } catch (error) {
        console.error('Search places error:', error);
        return { success: false, error: error.message };
    }
};

// Get place details including reviews
export const getPlaceDetails = async (placeId) => {
    try {
        await waitForGoogle();

        return new Promise((resolve) => {
            const dummyNode = document.createElement('div');
            const service = new window.google.maps.places.PlacesService(dummyNode);

            const request = {
                placeId: placeId,
                fields: [
                    'name', 'formatted_address', 'formatted_phone_number',
                    'opening_hours', 'website', 'rating', 'reviews',
                    'photos', 'price_level', 'geometry', 'types'
                ]
            };

            service.getDetails(request, (place, status) => {
                if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
                    const reviews = place.reviews?.slice(0, 3).map(r => ({
                        author: r.author_name,
                        rating: r.rating,
                        text: r.text?.substring(0, 150) + (r.text?.length > 150 ? '...' : ''),
                        time: r.relative_time_description
                    })) || [];

                    const hours = place.opening_hours?.weekday_text || [];

                    resolve({
                        success: true,
                        details: {
                            name: place.name,
                            address: place.formatted_address,
                            phone: place.formatted_phone_number,
                            website: place.website,
                            rating: place.rating,
                            reviews: reviews,
                            hours: hours,
                            isOpenNow: place.opening_hours?.isOpen?.() || null,
                            lat: place.geometry?.location.lat(),
                            lng: place.geometry?.location.lng()
                        }
                    });
                } else {
                    resolve({ success: false, error: 'No se encontraron detalles' });
                }
            });
        });
    } catch (error) {
        console.error('Get place details error:', error);
        return { success: false, error: error.message };
    }
};
