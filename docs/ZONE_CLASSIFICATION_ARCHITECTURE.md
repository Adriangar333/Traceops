# 🌍 Sistema de Clasificación Geográfica Inteligente
## Arquitectura Enterprise para Optimización de Rutas

**Versión**: 1.0
**Fecha**: Febrero 2026
**Autor**: Adrian Garzón
**Empresa**: Traceops (Multinacional)

---

## 📋 Resumen Ejecutivo

Sistema híbrido de clasificación geográfica que combina:
- **Google Maps Geocoding API** (precisión máxima)
- **OpenStreetMap Overpass API** (datos de infraestructura)
- **Machine Learning K-Means** (clustering adaptativo)
- **Caching inteligente** (reducción de costos)

### ROI Esperado
| Métrica | Antes | Después | Mejora |
|---------|-------|---------|--------|
| Precisión ETA Rural | ±40% | ±10% | **75%** |
| Costos de combustible | Base | -15% | **$$$** |
| Entregas fallidas | 8% | 3% | **62.5%** |

---

## 🏗️ Arquitectura del Sistema

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        TRACEOPS ZONE INTELLIGENCE                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐            │
│  │   CAPA 1:       │   │   CAPA 2:       │   │   CAPA 3:       │            │
│  │   APIs Externas │   │   ML/Analytics  │   │   Cache/DB      │            │
│  └────────┬────────┘   └────────┬────────┘   └────────┬────────┘            │
│           │                     │                     │                      │
│  ┌────────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐            │
│  │ Google Geocode  │   │ K-Means Cluster │   │ PostgreSQL      │            │
│  │ • address_type  │   │ • Density Score │   │ • zone_cache    │            │
│  │ • locality      │   │ • Cluster ID    │   │ • 30-day TTL    │            │
│  │ • admin_level   │   │ • Distance      │   │                 │            │
│  └─────────────────┘   └─────────────────┘   └─────────────────┘            │
│           │                     │                     │                      │
│  ┌────────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐            │
│  │ OSM Overpass    │   │ Density Calc    │   │ Redis           │            │
│  │ • landuse       │   │ • POIs nearby   │   │ • Hot cache     │            │
│  │ • buildings     │   │ • Road density  │   │ • 24h TTL       │            │
│  │ • highways      │   │ • Building %    │   │                 │            │
│  └─────────────────┘   └─────────────────┘   └─────────────────┘            │
│           │                     │                     │                      │
│           └──────────┬──────────┴──────────┬──────────┘                      │
│                      │                     │                                 │
│              ┌───────▼─────────────────────▼───────┐                         │
│              │         ZONE CLASSIFIER             │                         │
│              │   Combina todas las señales para    │                         │
│              │   clasificar: URBAN/SUBURBAN/RURAL  │                         │
│              └─────────────────┬───────────────────┘                         │
│                                │                                             │
│              ┌─────────────────▼───────────────────┐                         │
│              │         ROUTE OPTIMIZER             │                         │
│              │   • Ajusta ETA según zona           │                         │
│              │   • Agrupa entregas por cluster     │                         │
│              │   • Prioriza densidad alta          │                         │
│              └─────────────────────────────────────┘                         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 🗺️ Clasificación de Zonas

### Tipos de Zona

| Tipo | Código | Características | ETA Ajuste | Velocidad Promedio |
|------|--------|-----------------|------------|-------------------|
| **Centro Urbano** | `URBAN_CORE` | Alta densidad, comercial | -5% | 20 km/h |
| **Urbano Residencial** | `URBAN_RES` | Barrios consolidados | Base | 30 km/h |
| **Suburbano** | `SUBURBAN` | Periferias, conjuntos | +10% | 40 km/h |
| **Rural Cercano** | `RURAL_NEAR` | Corregimientos, veredas | +25% | 50 km/h |
| **Rural Lejano** | `RURAL_FAR` | Fincas, zonas sin vías | +50% | 35 km/h |
| **Industrial** | `INDUSTRIAL` | Zonas francas, bodegas | +5% | 40 km/h |

### Señales para Clasificación

```javascript
// Ejemplo de payload de clasificación
{
  "coordinates": { "lat": 10.9878, "lng": -74.7889 },
  "signals": {
    "google": {
      "address_types": ["street_address", "route"],
      "locality": "Barranquilla",
      "admin_level_2": "Atlántico",
      "formatted_address": "Cra 43 #76-120, Barranquilla"
    },
    "osm": {
      "landuse": "residential",
      "building_density": 0.72,  // 72% del área tiene edificios
      "road_types": ["secondary", "residential"],
      "nearest_highway_km": 2.3,
      "pois_500m": 45  // Puntos de interés en 500m
    },
    "ml": {
      "cluster_id": 3,
      "cluster_name": "NORTE_BQUILLA",
      "density_score": 0.85,
      "distance_to_center": 4.2
    }
  },
  "classification": {
    "zone_type": "URBAN_RES",
    "confidence": 0.92,
    "eta_multiplier": 1.0,
    "speed_estimate_kmh": 30
  }
}
```

---

## 🔌 APIs y Proveedores

### 1. Google Maps Geocoding API

**Uso**: Clasificación primaria de direcciones
**Costo**: $0.005 USD/request (primeras 40,000/mes gratis con crédito)
**Rate Limit**: 50 QPS

```javascript
// Endpoint
GET https://maps.googleapis.com/maps/api/geocode/json
  ?latlng=10.9878,-74.7889
  &key=API_KEY
  &result_type=street_address|locality|administrative_area_level_2

// Campos útiles para clasificación
{
  "types": ["locality", "political"],  // Tipo de lugar
  "address_components": [
    { "types": ["locality"], "long_name": "Barranquilla" },
    { "types": ["administrative_area_level_2"], "long_name": "Atlántico" }
  ]
}
```

**Indicadores de zona**:
| `types` contiene | Clasificación probable |
|------------------|----------------------|
| `street_address` | URBAN |
| `route` + `locality` | URBAN/SUBURBAN |
| `political` + `administrative_area_level_3` | RURAL |
| Solo `administrative_area_level_2` | RURAL_FAR |

---

### 2. OpenStreetMap Overpass API

**Uso**: Datos de infraestructura y densidad
**Costo**: GRATIS
**Rate Limit**: 10,000/día recomendado

```javascript
// Query para obtener densidad de edificios en radio de 500m
[out:json][timeout:25];
(
  way["building"](around:500, 10.9878, -74.7889);
  way["landuse"](around:500, 10.9878, -74.7889);
  way["highway"](around:1000, 10.9878, -74.7889);
  node["amenity"](around:500, 10.9878, -74.7889);
);
out count;
```

**Métricas extraídas**:
- `building_count`: Cantidad de edificios
- `landuse_type`: residential, commercial, industrial, farmland
- `highway_types`: primary, secondary, residential, track
- `amenity_count`: POIs cercanos (tiendas, restaurantes, etc.)

---

### 3. K-Means Clustering (ML Local)

**Uso**: Clustering adaptativo por cliente
**Costo**: GRATIS (modelo local)
**Ventaja**: Aprende de TU data histórica

```python
# Entrenar modelo para Barranquilla
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

# Data de ejemplo (coordenadas de clientes)
coords = df[['lng', 'lat']].values

# Normalizar
scaler = StandardScaler()
coords_scaled = scaler.fit_transform(coords)

# Entrenar K-Means con clusters óptimos (Elbow method)
kmeans = KMeans(n_clusters=8, random_state=42, n_init=10)
kmeans.fit(coords_scaled)

# Guardar modelos
pickle.dump(kmeans, open('modelo_barranquilla.pkl', 'wb'))
pickle.dump(scaler, open('scaler_barranquilla.pkl', 'wb'))
```

---

## 📊 Algoritmo de Clasificación Híbrido

```python
def classify_zone(lat: float, lng: float) -> ZoneClassification:
    """
    Clasifica una coordenada en tipo de zona usando múltiples señales.
    
    Returns:
        ZoneClassification con tipo, confianza y parámetros de ruta
    """
    
    # 1. Verificar cache primero (Redis -> PostgreSQL)
    cached = cache.get(f"zone:{lat:.4f},{lng:.4f}")
    if cached:
        return cached
    
    # 2. Obtener señales de APIs (en paralelo)
    signals = await asyncio.gather(
        get_google_geocode(lat, lng),
        get_osm_density(lat, lng),
        get_ml_cluster(lat, lng)
    )
    
    google_signal, osm_signal, ml_signal = signals
    
    # 3. Calcular score de urbanización (0-1)
    urbanization_score = calculate_urbanization(
        google_types=google_signal.types,
        building_density=osm_signal.building_density,
        pois_nearby=osm_signal.pois_count,
        road_quality=osm_signal.highway_types,
        cluster_density=ml_signal.density_score
    )
    
    # 4. Clasificar según score
    if urbanization_score >= 0.8:
        zone_type = "URBAN_CORE" if osm_signal.landuse == "commercial" else "URBAN_RES"
    elif urbanization_score >= 0.6:
        zone_type = "SUBURBAN"
    elif urbanization_score >= 0.4:
        zone_type = "RURAL_NEAR"
    else:
        zone_type = "RURAL_FAR"
    
    # 5. Obtener parámetros de ruta
    route_params = ZONE_PARAMS[zone_type]
    
    result = ZoneClassification(
        zone_type=zone_type,
        confidence=calculate_confidence(signals),
        eta_multiplier=route_params.eta_multiplier,
        speed_estimate=route_params.speed_kmh,
        cluster_id=ml_signal.cluster_id
    )
    
    # 6. Guardar en cache (30 días para ubicaciones, son estables)
    cache.set(f"zone:{lat:.4f},{lng:.4f}", result, ttl=2592000)
    
    return result


def calculate_urbanization(google_types, building_density, pois_nearby, road_quality, cluster_density):
    """
    Combina múltiples señales en un score de urbanización.
    
    Pesos:
    - Google types: 25%
    - Building density: 25%
    - POIs nearby: 20%
    - Road quality: 15%
    - ML cluster density: 15%
    """
    
    # Google types score
    google_score = 0.0
    if "street_address" in google_types:
        google_score = 1.0
    elif "route" in google_types:
        google_score = 0.8
    elif "locality" in google_types:
        google_score = 0.6
    else:
        google_score = 0.2
    
    # Road quality score
    road_score = 0.0
    if "primary" in road_quality or "secondary" in road_quality:
        road_score = 1.0
    elif "tertiary" in road_quality or "residential" in road_quality:
        road_score = 0.7
    elif "track" in road_quality or "path" in road_quality:
        road_score = 0.3
    
    # POI score (normalizado, max 100 POIs = 1.0)
    poi_score = min(pois_nearby / 100, 1.0)
    
    # Combinar con pesos
    total = (
        google_score * 0.25 +
        building_density * 0.25 +
        poi_score * 0.20 +
        road_score * 0.15 +
        cluster_density * 0.15
    )
    
    return total
```

---

## 💰 Análisis de Costos

### Escenario: 10,000 entregas/mes en Barranquilla

| Componente | Requests/mes | Costo Unitario | Total |
|------------|--------------|----------------|-------|
| Google Geocoding | ~2,000 (con cache) | $0.005 | **$10** |
| OSM Overpass | ~2,000 | Gratis | **$0** |
| Redis Cache | - | ~$10/mes | **$10** |
| PostgreSQL | - | Ya incluido | **$0** |
| **TOTAL** | | | **$20/mes** |

### Optimización de Costos

1. **Cache Agresivo**: Las coordenadas no cambian. Cache de 30 días.
2. **Precisión reducida**: Redondear a 4 decimales (11m precisión)
3. **Batch Processing**: Clasificar waypoints en batch al crear ruta
4. **Fallback graceful**: Si Google falla, usar solo OSM + ML

---

## 🗄️ Modelo de Base de Datos

```sql
-- Tabla de cache de clasificaciones
CREATE TABLE zone_classifications (
    id SERIAL PRIMARY KEY,
    lat_rounded DECIMAL(8, 4) NOT NULL,  -- Precisión ~11 metros
    lng_rounded DECIMAL(8, 4) NOT NULL,
    zone_type VARCHAR(20) NOT NULL,
    confidence DECIMAL(3, 2),
    eta_multiplier DECIMAL(3, 2) DEFAULT 1.0,
    speed_estimate INTEGER DEFAULT 30,
    cluster_id INTEGER,
    google_data JSONB,
    osm_data JSONB,
    classified_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days',
    
    UNIQUE(lat_rounded, lng_rounded)
);

-- Índice espacial para búsquedas rápidas
CREATE INDEX idx_zone_coords ON zone_classifications(lat_rounded, lng_rounded);

-- Tabla de clusters por ciudad
CREATE TABLE city_clusters (
    id SERIAL PRIMARY KEY,
    city_code VARCHAR(10) NOT NULL,  -- 'BAQ', 'BOG', 'MED'
    cluster_id INTEGER NOT NULL,
    cluster_name VARCHAR(50),
    centroid_lat DECIMAL(10, 6),
    centroid_lng DECIMAL(10, 6),
    avg_density_score DECIMAL(3, 2),
    zone_type_predominant VARCHAR(20),
    delivery_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(city_code, cluster_id)
);

-- Historial para ML
CREATE TABLE delivery_zone_history (
    id SERIAL PRIMARY KEY,
    delivery_id UUID,
    lat DECIMAL(10, 6),
    lng DECIMAL(10, 6),
    predicted_zone VARCHAR(20),
    predicted_eta_minutes INTEGER,
    actual_eta_minutes INTEGER,
    zone_accuracy BOOLEAN,  -- Para reentrenar modelo
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🚀 Plan de Implementación

### Fase 1: MVP (Semana 1-2)
- [ ] Crear endpoint `/api/classify-zone`
- [ ] Integrar Google Geocoding API
- [ ] Implementar cache en PostgreSQL
- [ ] Ajustar ETA en optimizador

### Fase 2: Enriquecimiento (Semana 3-4)
- [ ] Añadir OSM Overpass API
- [ ] Entrenar K-Means para Barranquilla
- [ ] Implementar algoritmo híbrido
- [ ] Redis para cache hot

### Fase 3: Escala (Mes 2)
- [ ] Dashboard de zonas en frontend
- [ ] Mapa de calor de densidad
- [ ] Reportes por zona
- [ ] Modelo ML auto-mejorable

### Fase 4: Multinacional (Mes 3+)
- [ ] Soporte multi-ciudad
- [ ] Modelos por país
- [ ] APIs regionales (OSM regional mirrors)

---

## 📁 Estructura de Archivos

```
logistics-dashboard/
├── backend/
│   ├── services/
│   │   ├── zoneClassifier.js       # Servicio principal
│   │   ├── googleGeocoding.js      # Cliente Google API
│   │   ├── osmOverpass.js          # Cliente OSM
│   │   └── mlClustering.js         # Modelo K-Means
│   ├── models/
│   │   └── barranquilla/
│   │       ├── kmeans_model.pkl    # Modelo entrenado
│   │       └── scaler.pkl          # Scaler
│   └── routes/
│       └── zones.js                # Endpoints /api/zones/*
├── src/
│   └── components/
│       └── ZoneMap.jsx             # Visualización de clusters
└── docs/
    └── ZONE_CLASSIFICATION_ARCHITECTURE.md  # Este archivo
```

---

## ✅ Checklist de Implementación

- [ ] Obtener API Key de Google Maps (Geocoding API habilitada)
- [ ] Crear tabla `zone_classifications` en PostgreSQL
- [ ] Implementar `zoneClassifier.js`
- [ ] Modificar optimizador para usar clasificación
- [ ] Entrenar modelo K-Means con data de Barranquilla
- [ ] Crear visualización en frontend
- [ ] Tests de integración
- [ ] Monitoreo de costos de APIs

---

**¿Listo para empezar la implementación?** 🚀
