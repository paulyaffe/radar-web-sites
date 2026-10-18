# Cuatro webs en Cloudflare Pages

Las cuatro webs se publicaron y se comprobaron el 12 de octubre de 2026.

- Cocina en gramos: https://cocina-en-gramos-paul.pages.dev
- Masa exacta: https://masa-exacta-paul.pages.dev
- Casa en vatios: https://casa-en-vatios-paul.pages.dev
- La Jornada: https://marcador-claro-paul.pages.dev

Los logotipos PNG de 600 x 160 píxeles para los mensajes de AdSense están en
`assets/logo-cocina-en-gramos.png`, `assets/logo-masa-exacta.png`,
`assets/logo-casa-en-vatios.png` y `assets/logo-marcador-claro.png`.
Las actualizaciones conservan estos archivos en el alojamiento.

## Calendario de La Jornada

`/partidos/` permite elegir fecha y competición. Incluye las doce ligas,
Champions League, Europa League y catorce calendarios de selecciones masculinas:
amistosos, Mundial, Eurocopa, UEFA Nations League, seis clasificatorios del
Mundial, Copa América, Copa Oro, Copa Africana de Naciones y Copa Asiática.
Los escudos se muestran a 24 × 24 píxeles y las banderas a 24 × 16.
Fechas y horas: `dd/mm/aa hh:mm`, zona Europe/Madrid y cambios de hora incluidos.

`calendar_worker.mjs` se copia a `sites/deportes/dist/_worker.js` en cada
generación. `_routes.json` limita su ejecución a `/api/partidos`; los demás
archivos siguen siendo estáticos. El calendario consulta ESPN desde Cloudflare
sin cuentas ni claves adicionales, por lo que funciona con el PC apagado.
Agrupa las consultas en clubes y selecciones, reutiliza resultados unos quince
minutos y señala fallos parciales. No promete marcadores oficiales en directo.
Las copias periódicas de las páginas y de `deportes.json` siguen dependiendo
del publicador Windows, mientras GitHub no esté conectado.

Pruebas: `python -m unittest discover -s tests` y `node tests/calendar_worker.mjs`.

## Generar

Python 3.11 o posterior, sin paquetes externos:

```
python update.py --force
```

Los resultados aparecen en `sites/<perfil>/dist`. Incluyen el código de AdSense
(`pub-7901739911277041`) y el enlace para modificar el consentimiento mediante
la CMP de Google. El usuario confirmó la publicación de los mensajes y la
activación de los anuncios automáticos en Google. Los cuatro sitios siguen
en revisión con estado Preparando; instalar el código no confirma su aprobación
ni que Google esté sirviendo anuncios. Google controla la autorización final.
El generador exige confirmar el mensaje CMP antes de incluir el código.

## Publicar

Iniciar sesión en Cloudflare con Wrangler. Crear cada proyecto Pages con rama
de producción `main` y publicar su carpeta `dist`. El nombre definitivo que
devuelva Cloudflare debe coincidir con `base_url` en cada `site.json`; después
hay que regenerar los archivos para que canonical, robots y sitemap sean
correctos. No se cambia ni se elimina el alojamiento antiguo antes de comprobar
las cuatro direcciones nuevas.

## Automatización en la nube

El workflow preparado en `.github/workflows/actualizar.yml` ejecuta resultados
cada dos horas y cocina, pan y electricidad una vez por día UTC. Las tareas
programadas de GitHub pueden retrasarse; no se promete actualización en directo.
Conserva catálogos y últimos resultados en el repositorio y despliega únicamente
los perfiles actualizados. La ejecución manual permite comprobar el ciclo.

Para activarlo hace falta un repositorio del usuario y configurar en sus
secretos `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_API_TOKEN`. El token debe tener
solo el permiso Account > Cloudflare Pages > Edit para la cuenta elegida.
No debe pegarse en archivos, mensajes de chat ni comandos que lo registren.
Wrangler puede publicarlo localmente con OAuth, pero eso por sí solo no conecta
las tareas de GitHub. El workflow no publica si faltan los secretos.

Mientras se conecta GitHub, la tarea `RadarWeb_Cloudflare` del PC publica
resultados cada dos horas y el resto de sitios una vez al día UTC mediante
la sesión OAuth existente. Requiere que el PC esté encendido y la sesión del
usuario abierta. Se ejecuta sin ventana, con prioridad baja y sin concurrencia.
Los sitios siguen accesibles cuando el PC se apaga, con su última actualización.
La tarea local deja de publicar al activar el workflow de GitHub.

La fuente de fútbol no requiere cuentas ni claves. Se advierte de resultados
desactualizados y no se inventan marcadores. No hay servicios de IA de pago ni
dominios comprados. La ejecución usa runners Linux estándar, no runners de pago.

Referencias: https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
https://developers.cloudflare.com/pages/platform/limits/

## Ficha de clubes y selecciones

Al pulsar un equipo se abre `/equipo/`, con los cinco últimos partidos finalizados
y los cinco próximos publicados, entre todas sus competiciones en ESPN. La API
`/api/equipo` consulta resultados y calendario por separado, conserva resultados
0–0 reales y no asigna marcadores a partidos por disputar. Si faltan cinco
resultados al inicio de temporada, consulta también la temporada anterior.
No inventa próximos encuentros cuando la fuente publica menos de cinco.
Funciona en Cloudflare con el PC apagado y reutiliza consultas unos quince minutos.

Comprobaciones: `node tests/team_worker.mjs` (desde el paquete Cloudflare).

## Marcador dedicado al fútbol

La portada entra al calendario. Los enlaces a posiciones y goleadores aparecen
debajo del título de cada competición. Incluye siete ligas europeas, Champions League, Europa League,
MLS (Estados Unidos), Liga MX (México), Liga AUF Uruguaya, Liga Profesional
Argentina y Brasileirão Serie A, además de las competiciones de selecciones.
Las ligas nuevas se incluyen en los filtros, las fichas de equipos, la navegación
hasta la próxima fecha con partidos y las tablas disponibles en la fuente.
Posiciones conserva los grupos, conferencias o fases publicados por ESPN.

Se retiraron tenis y Fórmula 1 de la navegación, el sitemap, las APIs y las
consultas automáticas. Los enlaces antiguos de esas secciones redirigen a fútbol.
La regeneración también retira sus páginas antiguas de dist para que el
publicador no vuelva a subirlas. Las consultas se reutilizan unos quince minutos;
las copias periódicas siguen publicándose cada dos horas con el PC encendido.
Las tablas conservan su fecha real cuando se usa la última copia disponible.

Comprobaciones: Python unittest, tests/calendar_worker.mjs,
tests/team_worker.mjs y tests/sports_data_worker.mjs. Los créditos permanecen
en /metodo/; no se añaden avisos al calendario.

Las páginas de posiciones y goleadores abren directamente la competición del
enlace, sin selector ni botón Ver. La comprobación tests/sports_page.mjs ejecuta
el JavaScript de ambas páginas y verifica que se renderizan filas reales.
