# Dirección anterior de La Jornada

El proyecto gratuito `marcador-claro-paul` se conserva para redirigir los enlaces
existentes a `https://lajornada.pages.dev`. La regla estática devuelve HTTP 301
y conserva rutas y parámetros de consulta. No ejecuta el Worker de fútbol.

Para volver a publicar esta redirección desde la raíz del repositorio:

```sh
npx wrangler pages deploy redirects/marcador-claro-paul --project-name=marcador-claro-paul --branch=main
```

La web completa se publica exclusivamente en el proyecto `lajornada`, usando
`sites/deportes/dist` y la configuración de `sites/deportes/site.json`.
No elimines el proyecto anterior mientras quieras conservar los enlaces.
