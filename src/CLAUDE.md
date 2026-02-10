# Contexto: Problema de Visualización en Auditoría de Orden (SCRC)

## Problema Reportado
El usuario reportó que en el modal de "Auditoría de Orden":
1.  **Firma**: Decía "Firma del Cliente" cuando debería ser "Firma del Técnico".
2.  **Ubicación**: No aparecía (campo vacío).
3.  **Observaciones**: Aparecía "Sin observaciones" o no se mostraba lo que escribió el técnico.
4.  **Fotos**: Aparecía "no disponible" aunque en la base de datos sí existían.
5.  **Tipo y Lectura**: Aparecían como "N/A" o "No registrada".

## Causa Identificada
El componente `SCRCAuditModal.jsx` espera recibir los campos `address`, `neighborhood`, `orderType` y `meterReading` dentro del objeto `order`. Sin embargo, la *query* GraphQL `GET_SCRC_ORDERS` en el componente padre `SCRCAuditPanel.jsx` **no estaba solicitando estos campos** al servidor.

## Solución Aplicada
1.  **`SCRCAuditPanel.jsx`**: Se actualizó la query `GET_SCRC_ORDERS` para incluir:
    ```graphql
    address
    neighborhood
    orderType
    meterReading
    ```
2.  **`SCRCAuditModal.jsx`**: Se cambió la etiqueta visual de "Firma del Cliente" a "Firma del Técnico".

## Estado Actual
Con estos cambios, la data debería fluir correctamente desde el backend hasta el modal, resolviendo los campos vacíos y la etiqueta incorrecta.
