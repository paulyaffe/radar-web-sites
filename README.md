# Cuatro webs en Cloudflare Pages

Paquete preparado para alojamiento gratuito. Los nombres de los proyectos
son propuestas y todavía no prueban que se haya publicado una web.

- Cocina en gramos: `cocina-en-gramos-paul`
- Masa exacta: `masa-exacta-paul`
- Casa en vatios: `casa-en-vatios-paul`
- Marcador claro: `marcador-claro-paul`

## Generar

Python 3.11 o posterior, sin paquetes externos:

```
python update.py --force
```

Los resultados aparecen en `sites/<perfil>/dist`. Incluyen AdSense
(`pub-7901739911277041`) como verificación; los anuncios siguen desactivados
hasta tener aprobación y consentimiento de Google.

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

La fuente de fútbol no requiere cuentas ni claves. Se advierte de resultados
desactualizados y no se inventan marcadores. No hay servicios de IA de pago ni
dominios comprados. La ejecución usa runners Linux estándar, no runners de pago.

Referencias: https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
https://developers.cloudflare.com/pages/platform/limits/
