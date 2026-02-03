// Google Gemini Service for route assistance
// Handles addresses, coordinates, and route optimization commands
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const SYSTEM_PROMPT = `Eres RouteBot, un asistente de rutas experto para Colombia. Tu misión es ayudar al usuario a gestionar sus rutas, encontrar lugares y optimizar entregas.
Tu salida debe ser SIEMPRE un JSON válido.

TIPOS DE ACCIÓN (action):

1. "chat" -> Para saludos, agradecimientos, preguntas generales o cuando no se requiere una acción del mapa.
   Ejemplo: "Hola" -> {"action": "chat", "response": "¡Hola! ¿A dónde quieres ir hoy?"}
   Ejemplo: "¿Qué puedes hacer?" -> {"action": "chat", "response": "Puedo agregar direcciones, buscar lugares, optimizar rutas y más."}

2. "search_places" -> Cuando el usuario busca un lugar pero no una dirección específica.
   Ejemplo: "Busca un restaurante" -> {"action": "search_places", "query": "restaurante"}
   Ejemplo: "Encuentra una gasolinera cerca" -> {"action": "search_places", "query": "gasolinera"}

3. "add_address" -> Cuando el usuario da una dirección Específica o un lugar conocido para ir.
   Ejemplo: "Vamos a Plaza de Bolívar" -> {"action": "add_address", "address": "Plaza de Bolívar, Colombia"}
   Ejemplo: "Agrega Cra 7 #72" -> {"action": "add_address", "address": "Carrera 7 #72, Colombia"}

4. "add_coordinates" -> Para coordenadas lat,lng.
   Ejemplo: "10.96, -74.78" -> {"action": "add_coordinates", "coordinates": [{"lat": 10.96, "lng": -74.78}], "optimize": true}

5. "optimize" -> Para optimizar la ruta actual.
   Ejemplo: "Optimiza la ruta" -> {"action": "optimize"}

6. "clear_route" -> Para borrar todo.
   Ejemplo: "Borra la ruta" -> {"action": "clear_route"}

FORMATO DE RESPUESTA OBLIGATORIO:
{
  "action": "tipo_de_accion",
  // campos adicionales según el tipo
}

IMPORTANTE: 
- Si el usuario solo saluda ("hola", "buenos días"), USA "action": "chat". NO INVENTES DIRECCIONES.
- Si buscas un tipo de sitio ("restaurante", "hospital"), USA "action": "search_places".
- Añade ", Colombia" a las direcciones si no lo tienen.`;

export const sendToGemini = async (message, context = '') => {
    if (!GEMINI_API_KEY) {
        console.error('Gemini API key not configured');
        return { success: false, error: 'API key no configurada' };
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: SYSTEM_PROMPT }]
                },
                contents: [{
                    parts: [{ text: message }]
                }],
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.1
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Gemini API Error:', JSON.stringify(errorData, null, 2));
            return { success: false, error: errorData.error?.message || 'API Error' };
        }

        const data = await response.json();

        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const responseText = data.candidates[0].content.parts[0].text;
            console.log('Gemini response:', responseText);

            try {
                const action = JSON.parse(responseText);
                return { success: true, response: responseText, action };
            } catch (e) {
                console.error('JSON parse error:', e);
                // Try to detect coordinates in the original message
                const coords = parseCoordinatesFromText(message);
                if (coords.length > 0) {
                    return {
                        success: true,
                        response: 'Coordenadas detectadas',
                        action: { action: 'add_coordinates', coordinates: coords, optimize: true }
                    };
                }
                return {
                    success: true,
                    response: responseText,
                    action: { action: 'add_address', address: message + ', Colombia' }
                };
            }
        }

        return { success: false, error: 'Respuesta inesperada' };
    } catch (error) {
        console.error('Gemini API error:', error);
        return { success: false, error: error.message };
    }
};

// Helper function to parse coordinates from text
const parseCoordinatesFromText = (text) => {
    const coords = [];
    // Match patterns like: 10.96854, -74.78132 or 10.96854,-74.78132
    const regex = /(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const num1 = parseFloat(match[1]);
        const num2 = parseFloat(match[2]);

        // Validate it looks like lat/lng (lat: -90 to 90, lng: -180 to 180)
        if (Math.abs(num1) <= 90 && Math.abs(num2) <= 180) {
            coords.push({ lat: num1, lng: num2 });
        }
    }

    return coords;
};
