# 📘 Manual de Usuario: Sistema de Logística Inteligente (Route Assigner)

¡Bienvenido al manual oficial de **Route Assigner**! 
Este documento es una guía completa diseñada para que domines todas las funcionalidades de la plataforma, desde la planeación básica hasta la optimización avanzada de rutas con Inteligencia Artificial.

---

## 📑 Tabla de Contenidos

1.  [Introducción y Roles](#1-introducción-y-roles)
2.  [Interfaz Principal](#2-interfaz-principal)
3.  [Gestión de Direcciones y Paradas](#3-gestión-de-direcciones-y-paradas)
4.  [Configuración de la Ruta](#4-configuración-de-la-ruta)
5.  [⚡ Optimización de Rutas (El Corazón del Sistema)](#5-optimización-de-rutas)
6.  [Asignación a Conductores](#6-asignación-a-conductores)
7.  [📱 Guía del Conductor (Móvil)](#7-guía-del-conductor-móvil)
8.  [Preguntas Frecuentes (FAQ)](#8-preguntas-frecuentes-faq)

---

## 1. Introducción y Roles

**Route Assigner** es una plataforma web para empresas de logística que necesitan planear repartos eficientes en la ciudad.

### Roles del Sistema:
*   **👨‍💻 Planificador (Administrador):** Persona que usa el computador/tablet para organizar las rutas. Decide qué camión va a dónde.
*   **🚚 Conductor:** Persona en la calle que recibe la lista de entregas en su celular y ejecuta el recorrido.

---

## 2. Interfaz Principal

La pantalla se divide en dos grandes áreas:

### A. El Mapa Interactivo 🗺️
Ocupa toda la pantalla y es tu lienzo de trabajo.
*   **Controles (Derecha):**
    *   `+` / `-`: Acercar o alejar.
    *   🚗 **Tráfico:** Muestra el tráfico en tiempo real (verde/rojo).
    *   📍 **Modo Agregar Puntos:** Activa un cursor para tocar el mapa y agregar paradas manualmente.
    *   🗺️ **Capas:** Cambia entre mapa Oscuro, Satélite, Híbrido o Terreno.
    *   📦 **3D:** Activa la vista tridimensional de edificios.
    *   🗑️ **Papelera:** Borra toda la ruta actual (solo visible si hay puntos).

### B. El Panel Lateral (Sidebar) 🗄️
Tu centro de mando a la izquierda (o abajo en celulares). Tiene pestañas rápidas arriba:
*   ⚙️ **Config:** Define inicio y fin.
*   📁 **Rutas:** Carga rutas guardadas previamente.
*   📥 **Importar:** Pega listas masivas de Excel/Texto.
*   🤖 **Bot IA:** Asistente inteligente.

---

## 3. Gestión de Direcciones y Paradas

Hay **4 formas** de agregar destinos a tu ruta:

### 1. Búsqueda Inteligente (Recomendada) 🔍
Usa la barra **"Agregar Entrega"**. Escribe el nombre del negocio o la dirección (ej: "Centro Comercial Viva").
*   El sistema te sugerirá lugares con iconos azules.
*   Al seleccionar, el mapa volará a ese punto.

### 2. Asistente con IA (Chat) 🤖
Haz clic en el icono 🤖. Puedes hablarle natural:
> *"Necesito ir al Homecenter del norte y luego a la Plaza de la Paz"*
El bot entenderá tus intenciones, buscará las coordenadas y las agregará a la ruta automáticamente.

### 3. Click en el Mapa (Visual) 📍
Si no sabes la dirección exacta pero conoces el lugar:
1.  En el mapa (derecha), activa el botón **Pin (📍)**.
2.  El cursor cambiará a una cruz.
3.  Toca cualquier edificio o calle. La dirección se autocompletará.

### 4. Importación Masiva 📋
Ideal si tienes las direcciones en un Excel o WhatsApp.
1.  Clic en icono **Importar (📥)**.
2.  Pega la lista (una dirección por línea).
3.  Clic en "Procesar". El sistema geocodificará todas a la vez.

---

## 4. Configuración de la Ruta

Antes de calcular, configura las reglas del juego en el icono **Engranaje (⚙️)**:

*   **🏠 Inicio Fijo:** ¿Tus camiones salen siempre de una bodega? Configúrala aquí. Si no lo pones, el sistema asumirá que el primer punto de tu lista es el inicio.
*   **🏁 Fin Fijo:** ¿Deben terminar en un lugar específico (ej: garaje)?
*   **🔄 Regresar al Inicio (Round Trip):** Marca esta casilla si el camión debe volver a la bodega al final (ruta circular).

---

## 5. Optimización de Rutas

Aquí ocurre la magia. Cuando tengas tus paradas, pulsa el botón verde **"⚡ Optimizar"**.
Se te presentarán 3 algoritmos. Elige según tu necesidad:

### 🟢 1. Vecino Más Cercano (Rápido)
*   **Logica:** Desde donde estoy, voy al punto más cerca. Repito.
*   **¿Cuándo usarlo?** Rutas sencillas, pocos puntos, o cuando la lógica visual es obvia.
*   **Ventaja:** Muy rápido de calcular.

### 🔵 2. Algoritmo Genético 2-Opt (Equilibrado)
*   **Logica:** Dibuja una ruta y luego intenta "desenredar" los cruces innecesarios. Simula miles de combinaciones.
*   **¿Cuándo usarlo?** Rutas de reparto complejas en ciudad donde el "Vecino más cercano" falla.
*   **Ventaja:** Encuentra atajos inteligentes que un humano no vería.

### ⭐ 3. Google Maps TSP (Premium)
*   **Logica:** Usa la inteligencia de Google. Considera tráfico en vivo, sentido de las calles, giros prohibidos.
*   **¿Cuándo usarlo?** Entregas críticas con hora de llegada.
*   **Ventaja:** Es la ruta que realmente harías conduciendo. Da tiempos ultra-realistas.

> **💡 Tip:** Pasea el mouse por las opciones. Verás una **Línea Verde Punteada** en el mapa prediciendo cómo quedaría la ruta ANTES de aplicarla.

---

## 6. Asignación a Conductores

Una vez tengas la ruta perfecta (Línea Azul solida):

1.  Ve a la sección **"👤 Asignar Ruta"** (abajo en el panel).
2.  Selecciona un conductor del menú desplegable. (Puedes crear nuevos en el botón "Agentes").
3.  Clic en **"▶ INICIAR RUTA"**.

El sistema:
*   Guardará la ruta en la base de datos.
*   Generará un enlace único para el conductor.
*   (Opcional) Enviará un WhatsApp/Email al conductor automáticamente.

---

## 7. 📱 Guía del Conductor (Móvil)

El conductor NO necesita instalar ninguna App. Solo abre el enlace recibido.

### Vista "Modo Conductor":
1.  **Lista de Paradas:** Verá las tarjetas ordenadas (1, 2, 3...).
2.  **Botón Navegar (↗️):** Al tocarlo, se abre **Waze o Google Maps** automáticamente con la ruta hacia ESE punto.
3.  **Botón Check (✅):** Al llegar, el conductor marca la entrega.
    *   La tarjeta se vuelve verde.
    *   Se actualiza en tiempo real en el Dashboard del Administrador.
    *   Se habilita la siguiente parada.

---

## 8. Preguntas Frecuentes (FAQ)

**P: ¿Por qué la ruta optimizada cambia el orden que yo puse?**
R: Porque el sistema calcula que tu orden original gasta más gasolina o tiempo. Si es OBLIGATORIO seguir tu orden, no uses el botón "Optimizar".

**P: ¿Qué significan los colores de los pines?**
*   🟢 **Verde:** Inicio.
*   🔴 **Rojo:** Fin.
*   🔵 **Azul:** Paradas intermedias (con número de orden).
*   🌗 **Verde/Rojo (Mitad):** Inicio y Fin son el mismo punto (Ruta Circular).

**P: ¿Funciona sin internet?**
R: El administrador necesita internet. El conductor necesita internet para recibir la ruta y marcar entregas, pero la navegación GPS (Waze/Google Maps) depende de los datos de su celular.

---
*Documentación generada automáticamente para el proyecto Route Assigner.*
