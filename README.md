# 🚚 RouteAssigner - Sistema de Gestión y Optimización de Rutas de Entrega

[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=white)](https://reactjs.org/)
[![Google Maps](https://img.shields.io/badge/Google%20Maps-API-4285F4?logo=googlemaps&logoColor=white)](https://developers.google.com/maps)
[![License](https://img.shields.io/badge/License-Academic-green.svg)]()

## 📋 Información del Proyecto

**Título:** Desarrollo de un aplicativo web y móvil para la gestión y optimización de rutas de entrega en pequeñas y medianas empresas de Barranquilla.

**Institución:** Universidad Popular del Cesar Aguachica (UPCA)  
**Programas:** Ingeniería y Tecnología en Desarrollo de Software

### 👥 Autores

| Nombre | Rol |
|--------|-----|
| José Andrés Domínguez Peñaloza | Desarrollador |
| Keyler David Guerra Urdaneta | Desarrollador |
| Daniel Andrés Mejía de la Hoz | Desarrollador |

---

## 🎯 Planteamiento del Problema

Las PYMES distribuidoras en Barranquilla utilizan métodos manuales y empíricos para planificar sus rutas de entrega, lo que genera:

- **Altos costos operativos:** Mientras la meta nacional de costo logístico es del 12.9%, en Colombia el promedio es del 17.9%, elevándose hasta el **24.3% en pequeñas empresas**.
- **Mayor consumo de combustible** por rutas no optimizadas.
- **Pérdida de control** sobre los conductores y tiempos de entrega.
- **Errores humanos** en la planificación manual.

---

## 💡 Propuesta de Solución

Sistema integral (web y móvil) que facilita la **planificación, optimización y monitoreo en tiempo real** de rutas de entrega en un entorno B2B.

### 🛠️ Tecnologías Clave

| Tecnología | Uso |
|------------|-----|
| **Google Maps API** | Trazado de rutas, geocodificación, Places API |
| **Google Gemini AI** | Optimización inteligente de rutas con IA |
| **n8n** | Automatización de tareas administrativas y notificaciones |
| **React + Vite** | Interfaz de usuario moderna y responsiva |
| **MapLibre GL** | Visualización de mapas interactivos |

### ✨ Funcionalidades Principales

- ✅ **Registro de direcciones** con autocompletado inteligente
- ✅ **Generación de rutas eficientes** con optimización por IA
- ✅ **Asignación de conductores** con notificación automática
- ✅ **Vista de conductor móvil** con progreso de entregas
- ✅ **Dashboard de métricas** para análisis de rendimiento
- ✅ **Importación masiva** de direcciones
- ✅ **Chat IA (RouteBot)** para agregar lugares por búsqueda

---

## 🎯 Objetivos del Proyecto

### Objetivo General
Desarrollar un sistema digital para **reducir costos logísticos** y **aumentar la eficiencia operativa** de las PYMES distribuidoras en Barranquilla.

### Objetivos Específicos

1. 📊 **Diagnosticar** la situación logística actual de las PYMES seleccionadas.
2. 🎨 **Diseñar** la arquitectura e interfaz (UI/UX) del sistema.
3. 💻 **Desarrollar** los módulos de gestión, optimización y monitoreo.
4. 🧪 **Implementar** pruebas piloto en entornos reales.
5. 📈 **Evaluar** el impacto comparando indicadores de eficiencia antes y después de la implementación.

---

## 📐 Metodología

| Aspecto | Descripción |
|---------|-------------|
| **Enfoque** | Mixto (cuantitativo para medir costos/tiempos, cualitativo para usabilidad) |
| **Diseño** | Cuasi-experimental y longitudinal |
| **Población** | 5 a 10 PYMES colombianas con flota propia sin sistemas de optimización |
| **Cronograma** | Desarrollo y pruebas entre finales de 2025 y principios de 2026 |

---

## 🌟 Justificación e Impacto

El proyecto busca llenar un **vacío de conocimiento** en logística aplicada específicamente a las PYMES, que a menudo carecen de los recursos para adoptar tecnologías de grandes industrias.

### Impacto Esperado

- 💰 **Reducción de costos logísticos** en las empresas participantes
- 🛒 **Impacto positivo en precios finales** al consumidor
- 🌱 **Disminución de emisiones de carbono** al optimizar el kilometraje recorrido
- ⏱️ **Ahorro de tiempo** en planificación de rutas

---

## 🚀 Instalación y Configuración

### Prerrequisitos

- Node.js 18+ 
- npm o yarn
- Cuenta de Google Cloud con APIs habilitadas:
  - Maps JavaScript API
  - Places API
  - Directions API
  - Geocoding API
- Cuenta de Google AI Studio (para Gemini API)
- Instancia de n8n (opcional, para automatizaciones)

### Pasos de Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/logistics-dashboard.git
cd logistics-dashboard

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus API keys

# 4. Iniciar en modo desarrollo
npm run dev
```

### Variables de Entorno

```env
# Google Maps API Key
VITE_GOOGLE_MAPS_API_KEY

# Google Gemini AI API Key
VITE_GEMINI_API_KEY

# n8n Webhook URL (opcional)
VITE_N8N_WEBHOOK_URL

# URL pública de la aplicación (para links de conductor)
VITE_APP_URL=http://tu-ip-o-dominio:5173
```

---

## 📱 Uso de la Aplicación

### Panel de Administración (Web)

1. **Agregar direcciones:** Usa el buscador o haz clic en el mapa
2. **Optimizar ruta:** El sistema sugiere la ruta más eficiente
3. **Asignar conductor:** Selecciona un agente y asigna la ruta
4. **Monitorear:** Observa el progreso en tiempo real

### Vista de Conductor (Móvil)

1. El conductor recibe un link único por email/SMS
2. Abre la aplicación en su celular
3. Ve la lista de paradas ordenadas
4. Marca las entregas como completadas
5. Navega usando Google Maps

---

## 📁 Estructura del Proyecto

```
logistics-dashboard/
├── public/
│   ├── manifest.json      # Configuración PWA
│   └── sw.js              # Service Worker
├── src/
│   ├── components/
│   │   ├── AdminDashboard.jsx    # Componente principal admin
│   │   ├── Sidebar.jsx           # Panel lateral con controles
│   │   ├── MapComponent.jsx      # Mapa interactivo
│   │   ├── AgentsPanel.jsx       # Gestión de conductores
│   │   ├── Dashboard.jsx         # Métricas y estadísticas
│   │   └── DriverView.jsx        # Vista móvil conductor
│   ├── utils/
│   │   ├── geocodingService.js   # Servicios de Google Maps
│   │   ├── geminiService.js      # Integración con Gemini AI
│   │   ├── googleDirectionsService.js
│   │   ├── n8nService.js         # Webhooks y automatización
│   │   └── metricsService.js     # Tracking de métricas
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── .env                   # Variables de entorno
├── package.json
└── vite.config.js
```

---

## 🧪 Pruebas

```bash
# Ejecutar en modo desarrollo con hot reload
npm run dev

# Construir para producción
npm run build

# Preview de producción
npm run preview
```

---

## 📊 Capturas de Pantalla

> *Las capturas de pantalla se agregarán durante la fase de documentación final del proyecto.*

---

## 🔮 Roadmap

- [x] Módulo de gestión de rutas
- [x] Integración con Google Maps
- [x] Optimización con IA (Gemini)
- [x] Vista de conductor móvil
- [x] Panel de agentes/conductores
- [x] Dashboard de métricas
- [ ] Tracking GPS en tiempo real (seguimiento de conductores)
- [ ] Notificaciones SMS (Plivo/Twilio)
- [ ] Exportación de reportes PDF
- [ ] Integración con sistemas ERP

---

## 📄 Licencia

Este proyecto es desarrollado como **trabajo de grado** para la Universidad Popular del Cesar Aguachica (UPCA). 

Todos los derechos reservados © 2025-2026

---

## 🤝 Contacto

Para más información sobre este proyecto, contactar a los autores a través de la institución educativa.

---

<p align="center">
  <strong>UPCA</strong> - Programas de Ingeniería y Tecnología en Desarrollo de Software<br>
  <em>Barranquilla, Colombia</em>
</p>
