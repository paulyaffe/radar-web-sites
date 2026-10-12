# Cuatro webs en Cloudflare Pages

Las cuatro webs se publicaron y se comprobaron el 12 de octubre de 2026.

- Cocina en gramos: https://cocina-en-gramos-paul.pages.dev
- Masa exacta: https://masa-exacta-paul.pages.dev
- Casa en vatios: https://casa-en-vatios-paul.pages.dev
- Marcador claro: https://marcador-claro-paul.pages.dev

Los logotipos PNG de 600 x 160 píxeles para los mensajes de AdSense están en
`assets/logo-cocina-en-gramos.png`, `assets/logo-masa-exacta.png`,
`assets/logo-casa-en-vatios.png` y `assets/logo-marcador-claro.png`.
Las actualizaciones conservan estos archivos en el alojamiento.

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
