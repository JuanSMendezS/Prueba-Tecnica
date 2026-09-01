# AI_CONTEXT

## Objetivo usado para construir la base

Crear una aplicación de reservas de canchas deportivas donde el criterio principal sea demostrar cero doble reserva ante condiciones de carrera.

## Prompts y criterios guía

- Priorizar primero el modelo de datos, transacciones y validación de concurrencia.
- Usar PostgreSQL como autoridad de integridad mediante rangos temporales y constraint `EXCLUDE`.
- Dejar un comando único para levantar todo el sistema.
- Incluir una prueba automatizada que compita por el mismo recurso y slot horario.

## Validaciones aplicadas

- Compilación TypeScript de la API.
- Diseño de script `npm run test:concurrency` que exige 1 éxito y `N-1` conflictos.
