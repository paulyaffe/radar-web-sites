"""Original, maintained explanations of La Jornada's football tools."""
from html import escape


GUIDES = [
    {
        "id": "seguir-jugadores-por-pais",
        "title": "Cómo seguir a los jugadores de tu país",
        "description": "Distingue entre el país de un jugador, la plantilla de su equipo y la convocatoria de un partido para usar bien los resaltados.",
        "sections": [
            ("Empieza por el país, después por la competición", [
                "El selector de la cabecera cambia el país que quieres seguir. Puedes escribir el principio del nombre en español: al escribir «ur» encontrarás Uruguay. Confirma una opción de la lista para aplicarla. La selección se recuerda en ese navegador, de modo que puedes abrir otro partido sin elegirla de nuevo.",
                "Elegir un país no cambia la competición del calendario. Puedes seguir a jugadores uruguayos en la liga española, la MLS o una competición de selecciones. Usa el filtro de competición y la fecha para decidir qué jornada quieres consultar; usa el país para identificar a los jugadores que te interesan dentro de ella.",
            ]),
            ("Qué significa el fondo de un equipo", [
                "El fondo junto al nombre y el escudo indica que el primer equipo tiene jugadores del país elegido en su plantilla. La comprobación se hace por separado para el local y el visitante. Si ambos cumplen el criterio, se destacan los dos nombres; el marcador continúa mostrando el resultado del encuentro.",
                "Pertenecer a la plantilla no equivale a estar convocado. Un jugador lesionado o que se quede fuera de un partido puede seguir haciendo que su equipo aparezca resaltado. Para saber quién fue titular o estuvo en el banquillo, abre el resultado y consulta la alineación publicada para ese encuentro.",
            ]),
            ("Cuándo usar «Solo país»", [
                "El botón toma el nombre del país seleccionado, por ejemplo «Solo Uruguay». Al activarlo, conserva los partidos en los que alguno de los equipos tiene jugadores de ese país en el primer equipo. Pulsarlo otra vez recupera la jornada completa. La preferencia continúa activa cuando cambias de fecha o de competición.",
                "Imagina dos partidos: Azul–Rojo y Verde–Blanco. Si Azul tiene un jugador del país elegido, el primer partido cumple el filtro aunque ese futbolista no haya sido convocado. El segundo solo aparecerá si Verde o Blanco también cumple la condición. Este ejemplo describe el funcionamiento del filtro; no representa plantillas reales.",
            ]),
            ("La bandera y los datos que faltan", [
                "Dentro de una plantilla, una alineación o un listado de goleadores, el fondo del jugador y la bandera junto al nombre permiten localizarlo. El color suave representa la camiseta habitual de la selección; no pretende reproducir la equipación concreta que se usa ese día.",
                "La nacionalidad procede de la ficha disponible del jugador. No se deduce por su apellido, su lugar de nacimiento ni el país del club. Una plantilla incompleta puede impedir confirmar si un partido cumple el filtro: comprueba el aviso del calendario antes de interpretar una lista vacía como ausencia de jugadores. La opción «Sin resaltar» desactiva el marcado y el filtro por país.",
            ]),
        ],
    },
    {
        "id": "entender-alineaciones-y-banquillo",
        "title": "Cómo leer el campo y el banquillo",
        "description": "Interpreta la formación inicial, los dorsales y los cambios sin confundir la posición de salida con la posición habitual de un jugador.",
        "sections": [
            ("El dibujo representa el once inicial", [
                "Al abrir un partido, el campo organiza a los titulares según la formación publicada. En un 4-3-3 aparecen el portero, una línea de cuatro defensas, tres centrocampistas y tres atacantes. En un 3-5-2, las líneas de campo son de tres, cinco y dos jugadores. El portero se muestra por separado de esas cifras.",
                "La imagen sirve para entender la disposición de salida. No sigue los movimientos de los jugadores ni reproduce todos los cambios tácticos del encuentro. Un futbolista puede aparecer en una posición distinta de la que ocupa habitualmente porque ese fue su papel en el once inicial que publicó la fuente.",
            ]),
            ("Qué hacer si aparece una lista en lugar del campo", [
                "Para dibujar una formación hacen falta un esquema válido, once titulares identificados y posiciones suficientes para ordenarlos. Si la información publicada no permite hacerlo, La Jornada presenta a los titulares en una lista. Así puedes consultar los nombres sin atribuirles una ubicación inventada.",
                "La disponibilidad se comprueba para cada equipo. Por eso un encuentro puede tener un campo para un club y una lista para el otro si sus datos son distintos. Si todavía no se ha publicado la alineación, la ficha lo indica y conserva los datos del partido que sí están disponibles.",
            ]),
            ("Cómo interpretar el banquillo", [
                "El banquillo reúne a los convocados que no salieron como titulares. El número está en el icono del dorsal. Debajo del nombre aparece su posición habitual: portero, defensa, centrocampista o delantero. Esta etiqueta ayuda a comparar opciones de recambio; no indica necesariamente la función táctica que desempeñó al entrar.",
                "Figurar en el banquillo no demuestra que un jugador participara. Busca la flecha de entrada y el minuto correspondiente para identificar un cambio registrado. Si falta su posición habitual, se indica que no está disponible. El dorsal o el nombre no se utilizan para adivinarla.",
            ]),
            ("Goles, tarjetas y sustituciones", [
                "El balón identifica un gol, la flecha hacia arriba una entrada y la flecha hacia abajo una salida. La flecha diagonal corresponde a una asistencia. Las tarjetas amarilla y roja conservan sus colores. Los minutos acompañan al suceso cuando la fuente los publica; varios iconos pueden referirse al mismo jugador.",
                "Una anotación como 90+4′ sitúa un suceso en el tiempo añadido de la segunda parte. Las etiquetas de penalti y propia puerta aclaran cómo se produjo un gol cuando ese dato está disponible. Para revisar el resultado, mira también el listado de goleadores de la cabecera: reúne los goles por equipo y facilita distinguirlos de otros sucesos de una alineación.",
            ]),
        ],
    },
    {
        "id": "fechas-horarios-y-resultados",
        "title": "Fechas, horarios y estados de los partidos",
        "description": "Encuentra la jornada que buscas y entiende qué significan los horarios, los resultados pendientes y los avisos de disponibilidad.",
        "sections": [
            ("La fecha se interpreta en hora peninsular", [
                "La Jornada presenta los horarios en la zona de España peninsular. La fecha del calendario corresponde a esa misma zona. Un partido disputado de noche en América puede aparecer en el día siguiente en España; consulta juntos la fecha y la hora antes de compararlo con una programación local.",
                "El nombre del país que eliges en la cabecera no cambia el huso horario. Ese selector controla los resaltados y el filtro de jugadores. Para buscar un encuentro concreto, usa la fecha que corresponde a su inicio en la hora que muestra la web, aunque estés siguiendo a un país de otra región.",
            ]),
            ("Anterior, hoy y siguiente", [
                "Puedes introducir una fecha y pulsar «Ver», o seleccionar otra competición. «Hoy» vuelve a la fecha actual. En el calendario, «Anterior» y «Siguiente» buscan otra fecha con partidos dentro de la competición o del grupo de competiciones elegido; pueden saltar varios días si no hay encuentros entre medias.",
                "El filtro de país se aplica sobre esa jornada. Si «Solo país» está activo y no quedan partidos visibles, desactívalo para comprobar la lista completa o elige otra fecha. El salto de fechas busca partidos de la competición; no garantiza que en la siguiente fecha haya un equipo que cumpla el filtro de nacionalidad.",
            ]),
            ("Un guion no es un empate a cero", [
                "Un encuentro programado puede aparecer sin resultado confirmado. Un guion o «vs» no equivale a un 0–0: señala que no se está mostrando un marcador disponible. El estado junto al horario permite distinguir un partido programado de uno finalizado o de uno que la fuente marca como en curso.",
                "Cuando hay una tanda de penaltis disponible, se muestra aparte del resultado del partido. Los goles de esa tanda no se añaden al listado normal de goleadores. Revisa el estado y las anotaciones del resultado antes de comparar dos equipos o de interpretar quién avanzó en una eliminatoria.",
            ]),
            ("Cómo leer una jornada incompleta", [
                "Que no haya partidos en una fecha es distinto de que una fuente no haya respondido. Los avisos de disponibilidad explican cuándo falta información de alguna competición. Si se conserva una copia anterior, su fecha sigue identificándola: una consulta fallida no convierte esa copia en una actualización nueva.",
                "Los horarios pueden cambiar y la cobertura depende de cada competición. Usa los enlaces al partido para ampliar la información publicada y los enlaces de créditos para identificar las fuentes. La Jornada es una herramienta de consulta; los estados mostrados dependen de la información que se ha podido obtener en cada actualización.",
            ]),
        ],
    },
    {
        "id": "leer-clasificaciones-y-goleadores",
        "title": "Cómo leer las tablas de posiciones y goleadores",
        "description": "Compara puntos, partidos y goles sin mezclar grupos, fases o competiciones distintas.",
        "sections": [
            ("Empieza por identificar la competición y la fase", [
                "Las tablas se abren desde la competición que estás consultando. Comprueba el nombre de la cabecera y la temporada antes de comparar equipos. Una clasificación puede dividirse en grupos, conferencias o fases; cada bloque conserva el orden publicado para ese contexto.",
                "Estar en la primera fila de un grupo no significa encabezar todos los grupos. Tampoco conviene juntar puntos de una fase regular y de una eliminatoria como si pertenecieran a la misma tabla. Si necesitas interpretar una posición concreta, empieza por el bloque en el que aparece ese equipo.",
            ]),
            ("Qué significa cada columna", [
                "Pts son los puntos; PJ, los partidos jugados; G, E y P corresponden a victorias, empates y derrotas. GF y GC recogen los goles a favor y en contra, y DG muestra la diferencia entre ambos. La columna de posición indica el orden de la clasificación publicada.",
                "Dos equipos con los mismos puntos pueden ocupar filas distintas por los criterios de su competición. La Jornada conserva el orden de la fuente. La diferencia de goles aporta contexto, pero por sí sola no explica todos los desempates. Consulta las normas de la competición cuando necesites saber por qué un equipo está delante de otro.",
            ]),
            ("Compara también los partidos disputados", [
                "Un total de puntos resulta más fácil de interpretar cuando se lee junto a PJ. Un equipo con dos partidos menos no ha tenido las mismas oportunidades de sumar que otro. De la misma forma, GF y GC son acumulados: observa cuánto ha jugado cada equipo antes de comparar sus totales.",
                "Por ejemplo, si dos equipos tienen diez goles a favor, uno en cinco partidos y otro en diez, el total coincide pero el contexto es distinto. Este es un ejemplo de lectura de la tabla, no una previsión del resultado de su próximo partido. Ninguna de esas cifras determina por sí sola cómo terminará un encuentro.",
            ]),
            ("La tabla de goleadores tiene su propio alcance", [
                "El listado de goleadores corresponde a los registros publicados para esa competición. No representa automáticamente todos los goles de la temporada del jugador entre liga, copas y selección. Comprueba la competición antes de comparar ese total con otra página o con el historial de su club.",
                "Los jugadores empatados a goles comparten posición en el listado. Las columnas de equipo y partidos aportan contexto cuando están disponibles. Si una competición no publica cobertura de goleadores, la web lo indica en lugar de construir un ranking a partir de datos incompletos. El resaltado por país sirve para localizar jugadores, no para cambiar el orden de la tabla.",
            ]),
        ],
    },
]


def guide_url(guide):
    return '/guias/'+guide['id']+'/'


AD_GUIDE_PATHS = frozenset(guide_url(guide) for guide in GUIDES)
PRIVACY_GUIDE_URL = guide_url(GUIDES[0])+'#opciones-de-privacidad'


def guide_cards():
    return '<div class="football-guide-cards">'+''.join(
        '<a href="'+guide_url(guide)+'"><h3>'+escape(guide['title'])+'</h3><p>'+escape(guide['description'])+'</p></a>' for guide in GUIDES
    )+'</div>'


def guides_teaser():
    return '<section class="football-help"><h2>Entender la jornada</h2><p>Aprende a usar el país, interpretar una alineación y comparar los datos de una competición.</p>'+guide_cards()+'</section>'


def guides_index():
    return '<section class="football-help"><a class="back-link" href="/">← Partidos</a><h1 class="sport-title">Guías de La Jornada</h1><p>Explicaciones prácticas para consultar los partidos y entender qué representa cada dato.</p>'+guide_cards()+'</section>'


def guide_body(guide):
    body='<article class="reading football-guide"><a href="/guias/">← Guías</a><h1>'+escape(guide['title'])+'</h1><p class="guide-intro">'+escape(guide['description'])+'</p>'
    for title, paragraphs in guide['sections']:
        body+='<h2>'+escape(title)+'</h2>'+''.join('<p>'+escape(text)+'</p>' for text in paragraphs)
    body+='<p class="guide-byline">La Jornada · Publicado el 30 de octubre de 2026</p><p><a href="/partidos/">Abrir el calendario de partidos</a> · <a href="/metodo/">Cómo trabajamos y de dónde proceden los datos</a></p>'
    body+='<h2>Sigue consultando</h2><ul>'+''.join('<li><a href="'+guide_url(other)+'">'+escape(other['title'])+'</a></li>' for other in GUIDES if other['id']!=guide['id'])+'</ul></article>'
    return body


def method_body():
    return '''<article class="reading football-guide"><h1>Sobre La Jornada y sus datos</h1>
<p>La Jornada es una herramienta independiente para consultar fútbol por fecha, competición, equipo y país de los jugadores. Reúne calendarios, resultados, plantillas, alineaciones y tablas cuando las fuentes ofrecen esos datos.</p>
<h2>Cómo organizamos la información</h2><p>La web utiliza la identidad del partido y de sus equipos para relacionar resultados, alineaciones y plantillas. El país se toma de la ficha del jugador. El fondo de un equipo se decide por su primer equipo actual; el campo y el banquillo describen la convocatoria publicada para cada encuentro.</p>
<p>Las guías explican estas diferencias y el funcionamiento de los controles de la web. Los ejemplos de lectura se identifican como ejemplos y no se presentan como resultados, pronósticos o plantillas reales.</p>
<h2>Actualizaciones y cobertura</h2><p>El calendario consulta información de la fecha elegida en hora peninsular española. El detalle de un partido se vuelve a consultar mientras la página permanece visible. La disponibilidad de una alineación, un gol o una tabla depende de la competición y de la fuente.</p>
<p>Una información ausente se señala como no disponible. Si una consulta falla y existe una copia anterior utilizable, se conserva su fecha. El esquema del campo requiere una formación y posiciones suficientes; en los demás casos se presenta una lista de jugadores.</p>
<h2>Fuentes y créditos</h2><p>Datos deportivos y escudos: <a href="https://www.espn.com/soccer/scoreboard">ESPN</a>. Datos complementarios: <a href="https://github.com/openfootball/football.json">OpenFootball</a> (CC0 1.0) y <a href="https://www.openligadb.de/">OpenLigaDB</a> (<a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a>).</p>
<p>Banderas: ESPN y FlagCDN. Nombres de países: Unicode CLDR (<a href="/assets/COUNTRY-DATA-LICENSE.txt">licencia</a>). Puedes consultar <a href="/deportes.json">los datos y las atribuciones de las copias periódicas</a>.</p>
<h2>Publicidad y privacidad</h2><p>La publicidad se reserva a las guías completas. El calendario, las fichas de equipos y partidos, las tablas y las páginas de error se pueden consultar sin anuncios. La página de <a href="/privacidad/">privacidad</a> explica las estadísticas y las opciones de consentimiento.</p>
<p><a href="/guias/">Leer las guías</a> · <a href="/partidos/">Consultar partidos</a></p></article>'''
