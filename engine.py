"""Motor gratuito: señales RSS, cola editorial y exportación HTML estática.

No copia cuerpos de noticias ni llama a servicios de IA de pago. Las visitas
reales solo pueden conocerse con las analíticas del sitio. Los titulares RSS
se usan para elegir temas, nunca como evidencia de que una receta funciona.
"""
from __future__ import annotations

import argparse
import copy
import datetime as dt
import gzip
import hashlib
import html
import json
import math
import re
import threading
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

UTC = dt.timezone.utc
LOCK = threading.RLock()
MAX_FEED_BYTES = 2_000_000
SOURCE_BAKING = "https://www.kingarthurbaking.com/pro/reference/bakers-percentage"
SOURCE_ENERGY = "https://www.energy.gov/energysaver/estimating-appliance-and-home-electronic-energy-use"
LEAGUES = {
    "PD": ("liga-espanola", "España", "La Liga", 2014),
    "SA": ("serie-a", "Italia", "Serie A", 2019),
    "PL": ("premier-league", "Inglaterra", "Premier League", 2021),
    "FL1": ("ligue-1", "Francia", "Ligue 1", 2015),
    "DED": ("eredivisie", "Países Bajos", "Eredivisie", 2003),
    "PPL": ("primeira-liga", "Portugal", "Primeira Liga", 2017),
    "BL1": ("bundesliga", "Alemania", "Bundesliga", 2002),
    "CL": ("champions-league", "Europa", "Champions League", 2001),
    "EL": ("europa-league", "Europa", "Europa League", None),
}
NATIONAL_COMPETITIONS = {
    "FRIENDLY": "Amistosos internacionales", "WORLD": "Mundial", "EURO": "Eurocopa",
    "NATIONS": "UEFA Nations League", "WQ_EU": "Clasificación Mundial · Europa",
    "WQ_SA": "Clasificación Mundial · Sudamérica", "WQ_NA": "Clasificación Mundial · Concacaf",
    "WQ_AF": "Clasificación Mundial · África", "WQ_AS": "Clasificación Mundial · Asia",
    "WQ_OC": "Clasificación Mundial · Oceanía", "COPA": "Copa América", "GOLD": "Copa Oro",
    "AFCON": "Copa Africana de Naciones", "ASIAN": "Copa Asiática",
}
PROFILES = {
    "deportes": {
        "title": "Marcador claro", "eyebrow": "FÚTBOL · FÓRMULA 1 · DATOS ABIERTOS",
        "heading": "El resultado.\nLa fuente. La fecha.",
        "description": "Partidos por fecha, siete ligas europeas, Champions League, Europa League, selecciones y Fórmula 1. Horarios, resultados y fuentes visibles.",
        "color": "#3759a0", "background": "#f2f4f7", "icon": "sport",
        "query": "futbol bundesliga formula 1 resultados",
        "topics": {"futbol": ["futbol", "bundesliga"], "formula-1": ["formula 1", "f1", "gran premio"]},
        "tools": [],
        "seo_title": "Resultados de fútbol europeo y Fórmula 1",
    },
    "cocina": {
        "title": "Cocina en gramos", "eyebrow": "RECETAS · PROPORCIONES · COCINA COTIDIANA",
        "heading": "Una pizca de intuición.\nEl resto, en gramos.",
        "description": "Recetas claras y herramientas pequeñas para cocinar a tu medida. Ajusta las raciones, cambia el molde y empieza por lo que tienes en casa.",
        "color": "#bd4c32", "background": "#fbf6ec", "icon": "bowl",
        "query": "recetas cocina bizcocho tortilla ensalada galletas",
        "topics": {"bizcocho": ["bizcocho", "molde", "reposteria"], "tortitas": ["tortitas", "pancake"], "garbanzos": ["garbanzo", "ensalada"], "tortilla": ["tortilla", "huevo"], "galletas": ["galleta", "cookie"]},
        "tools": [("raciones", "Ajustar una receta", "De dos a seis personas sin hacer cuentas a mano."), ("moldes", "Cambiar de molde", "Conserva la altura al pasar de un molde redondo a otro.")],
        "seo_title": "Recetas en gramos y calculadoras de raciones y moldes",
    },
    "masa": {
        "title": "Masa exacta", "eyebrow": "PAN · PIZZA · PORCENTAJES PANADEROS",
        "heading": "Tu próxima masa\nempieza aquí.",
        "description": "Harina, agua y unas cuentas bien hechas. Calcula tus bolas de pizza, entiende la hidratación y descuenta la harina y el agua de la masa madre.",
        "color": "#a65429", "background": "#faf4e9", "icon": "bread",
        "query": "masa pizza pan hidratacion masa madre focaccia",
        "topics": {"pizza": ["pizza", "pizzaiolo"], "pan": ["pan casero", "panader", "hacer pan"], "hidratacion": ["hidratacion", "hidratación"], "masa-madre": ["masa madre", "sourdough"], "focaccia": ["focaccia"]},
        "tools": [("masa", "Calculadora de masa", "Elige cuántas piezas quieres y cuánto pesará cada una."), ("madre", "Contar la masa madre", "Descuenta su harina y su agua de la fórmula total.")],
        "seo_title": "Calculadoras de masa de pizza, pan y masa madre",
    },
    "energia": {
        "title": "Casa en vatios", "eyebrow": "CONSUMO · COSTE · DECISIONES CON NÚMEROS",
        "heading": "Lo que enchufas\ntambién cuenta.",
        "description": "Convierte los vatios en euros y compara tus opciones. Tus datos se quedan en el navegador: tú pones la potencia, las horas y el precio de la energía.",
        "color": "#246a5d", "background": "#f4f6ee", "icon": "energy",
        "query": "consumo electricidad electrodomesticos ahorro energia servidor",
        "topics": {"servidor": ["servidor", "nas", "ordenador", "pc gaming"], "standby": ["standby", "stand-by", "espera"], "electrodomesticos": ["electrodomestico", "lavadora", "frigorifico", "secadora"], "amortizacion": ["amortiz", "eficiencia", "ahorro"], "vatios": ["vatios", "kwh", "kilovatio", "consumo"]},
        "tools": [("consumo", "De vatios a euros", "Un aparato, sus horas de uso y el coste de cada kWh."), ("ahorro", "¿Compensa cambiarlo?", "Compara dos consumos y el tiempo para recuperar la inversión.")],
        "seo_title": "Calculadora de consumo eléctrico y coste en euros",
    },
}


def now_iso():
    return dt.datetime.now(UTC).isoformat(timespec="seconds")


def normal(value):
    return "".join(c for c in unicodedata.normalize("NFKD", str(value).lower()) if not unicodedata.combining(c))


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", normal(value)).strip("-")[:85] or "articulo"


def read_json(path, default=None):
    if not path.exists():
        return copy.deepcopy(default)
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with LOCK:
        temp = path.with_name(path.name + ".tmp")
        temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(path)


def numeric(value, low, high, name):
    number = float(value)
    if not math.isfinite(number) or not low <= number <= high:
        raise ValueError(f"{name}: usa un número entre {low} y {high}.")
    return number


def dough(pieces=4, weight=250, hydration=65, salt=2, oil=2, yeast=0.2):
    pieces = numeric(pieces, 1, 100, "Piezas")
    if pieces != int(pieces):
        raise ValueError("El número de piezas debe ser entero.")
    weight = numeric(weight, 20, 2000, "Peso")
    h, s, o, y = [numeric(v, 0, limit, name) for v, limit, name in [(hydration, 150, "Hidratación"), (salt, 10, "Sal"), (oil, 50, "Aceite"), (yeast, 10, "Levadura")]]
    flour = pieces * weight / (1 + (h + s + o + y) / 100)
    return {"Harina": flour, "Agua": flour*h/100, "Sal": flour*s/100, "Aceite": flour*o/100, "Levadura seca": flour*y/100}


def starter(flour=500, hydration=70, fermented=20, starter_hydration=100):
    flour = numeric(flour, 1, 100000, "Harina")
    hydration = numeric(hydration, 0, 150, "Hidratación")
    fermented = numeric(fermented, 0, 100, "Harina prefermentada")
    starter_hydration = numeric(starter_hydration, 0, 200, "Hidratación de masa madre")
    inside_flour = flour*fermented/100
    inside_water = inside_flour*starter_hydration/100
    water = flour*hydration/100 - inside_water
    if water < -1e-8:
        raise ValueError("La masa madre aporta más agua que la hidratación objetivo.")
    return {"Harina por añadir": flour-inside_flour, "Agua por añadir": max(0, water), "Masa madre": inside_flour+inside_water}


def power_cost(watts=100, hours=8, days=30, price=0.2):
    w = numeric(watts, 0, 100000, "Vatios")
    h = numeric(hours, 0, 24, "Horas al día")
    d = numeric(days, 0, 366, "Días")
    p = numeric(price, 0, 10, "Precio kWh")
    kwh = w*h*d/1000
    return {"kwh": kwh, "cost": kwh*p}


def fetch(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in {"trends.google.com", "news.google.com"}:
        raise ValueError("Fuente no autorizada.")
    request = urllib.request.Request(url, headers={"User-Agent": "RadarWeb/1.0 (+RSS; personal editorial research)"})
    with urllib.request.urlopen(request, timeout=20) as response:
        result = response.read(MAX_FEED_BYTES + 1)
    if len(result) > MAX_FEED_BYTES:
        raise ValueError("El RSS supera el tamaño máximo.")
    return result


def parse_feed(data, source):
    if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise ValueError("RSS con entidades externas no admitidas.")
    root = ET.fromstring(data)
    results = []
    for item in root.findall("./channel/item")[:150]:
        fields = {e.tag.rsplit("}", 1)[-1]: e.text or "" for e in item}
        title = re.sub(r"\s+", " ", fields.get("title", "")).strip()[:350]
        if not title:
            continue
        link = fields.get("link", "")
        if urllib.parse.urlparse(link).scheme not in {"http", "https"}:
            link = ""
        traffic = fields.get("approx_traffic", "")
        searches = None
        if traffic:
            match = re.search(r"([\d.,]+)\s*([KMB]?)", traffic.upper())
            if match:
                number = float(match[1].replace(",", ""))
                searches = int(number * {"": 1, "K": 1000, "M": 1000000, "B": 1000000000}[match[2]])
        date = fields.get("pubDate", "")
        try:
            date = parsedate_to_datetime(date).astimezone(UTC).isoformat()
        except (ValueError, TypeError, OverflowError):
            date = ""
        results.append({"title": title, "url": link, "date": date, "source": source, "searches_lower_bound": searches, "traffic_label": traffic})
    return results


def rank(items, profile):
    grouped = {}
    for item in items:
        text = normal(item["title"])
        for topic, words in PROFILES[profile]["topics"].items():
            if not any(re.search(r"\b" + re.escape(normal(word)), text) for word in words):
                continue
            row = grouped.setdefault(topic, {"topic": topic, "sources": [], "news_count": 0, "searches_lower_bound": None, "score": 0.0})
            identity = item["url"] or item["title"]
            if any((e["url"] or e["title"]) == identity for e in row["sources"]):
                continue
            row["sources"].append(item)
            if item["source"] == "Google Trends":
                volume = item["searches_lower_bound"]
                if volume is not None:
                    row["searches_lower_bound"] = max(volume, row["searches_lower_bound"] or 0)
                    row["score"] += 30 + min(40, math.log10(max(1, volume))*7)
            else:
                row["news_count"] += 1
                recent = False
                if item["date"]:
                    age = (dt.datetime.now(UTC)-dt.datetime.fromisoformat(item["date"])).total_seconds()/86400
                    recent = 0 <= age < 7
                row["score"] += 3 if recent else 1
    return sorted(grouped.values(), key=lambda r: (-r["score"], r["topic"]))


def scan(profile, country="ES"):
    if profile not in PROFILES or not re.fullmatch(r"[A-Z]{2}", country):
        raise ValueError("Tema o país no válidos.")
    query = urllib.parse.quote(PROFILES[profile]["query"])
    urls = [(f"https://trends.google.com/trending/rss?geo={country}", "Google Trends"), (f"https://news.google.com/rss/search?q={query}&hl=es&gl={country}&ceid={country}:es", "Google News")]
    items, errors = [], []
    for url, source in urls:
        try:
            items.extend(parse_feed(fetch(url), source))
        except Exception as exc:
            errors.append(f"{source}: {type(exc).__name__}")
    if not items:
        raise RuntimeError("No se han podido leer las fuentes. Se conserva el último ranking.")
    return {"updated": now_iso(), "country": country, "profile": profile, "ranking": rank(items, profile), "errors": errors, "raw_count": len(items), "meaning": "Prioridad editorial estimada. Google Trends mide búsquedas en auge; el recuento de noticias no mide búsquedas ni visitas."}


def guide(identifier, title, description, sections, topic="", sources=None):
    return {"id": identifier, "title": title, "description": description, "kind": "guide", "topic": topic or identifier, "status": "published", "created": now_iso(), "sections": sections, "sources": sources or [], "origin": "Contenido original con fórmulas comprobables"}


def recipe(identifier, title, description, servings, ingredients, steps, notes):
    return {"id": identifier, "title": title, "description": description, "kind": "recipe", "topic": identifier, "status": "published", "created": now_iso(), "servings": servings, "ingredients": [{"amount": a, "unit": u, "name": n} for a, u, n in ingredients], "steps": steps, "sections": [("Antes de empezar", notes)], "sources": [], "origin": "Receta base orientativa; sin pruebas de cocina documentadas", "tested": False}


def library(profile):
    if profile == "deportes":
        return []
    if profile == "masa":
        return [
            guide("porcentajes-panaderos", "El porcentaje panadero, sin misterio", "La harina es el 100 %. Aprende a leer una fórmula y a cambiar su tamaño sin perder las proporciones.", [("La referencia es la harina", "En el porcentaje panadero cada ingrediente se compara con la harina, no con el peso total de masa. Para 500 g de harina, un 65 % de hidratación corresponde a 325 g de agua."), ("Por qué los porcentajes suman más de cien", "La harina ya representa el 100 %. Al añadir un 65 % de agua y un 2 % de sal, la suma alcanza el 167 %. No es un error: describe el peso de una fórmula respecto a su harina."), ("El peso total", "Con 500 g de harina, 325 g de agua y 10 g de sal obtienes 835 g de masa antes de las pérdidas de manipulación y horneado. La calculadora añade también el aceite y la levadura que indiques."), ("Cómo utilizarlo", "Si cambias la cantidad de harina, conserva los porcentajes de los demás ingredientes. Cambiar las cantidades no determina el tiempo de fermentación: también influyen temperatura, harina y levadura.")], sources=[SOURCE_BAKING]),
            guide("pizza", "Calcula la harina para tus bolas de pizza", "Una fórmula para preparar el peso de masa que necesitas, con el agua, la sal, el aceite y la levadura incluidos.", [("Empieza por el peso de las piezas", "Cuatro bolas de 250 g requieren 1000 g de masa total. Ese peso se reparte entre todos los ingredientes, no solo entre harina y agua."), ("Un ejemplo calculado", "Con hidratación del 65 %, sal del 2 %, aceite del 2 % y levadura seca del 0,2 %, necesitas aproximadamente 591,0 g de harina, 384,2 g de agua, 11,8 g de sal, 11,8 g de aceite y 1,2 g de levadura seca."), ("La cuenta", "Harina = masa total ÷ [1 + (hidratación + sal + aceite + levadura) ÷ 100]. Cada cantidad restante se obtiene multiplicando la harina por su porcentaje."), ("Lo que debes ajustar", "Los valores de la herramienta son ejemplos editables. La cantidad de levadura y los tiempos deben adaptarse a tu proceso. La calculadora no estima fermentación ni garantiza un estilo de pizza.")], topic="pizza", sources=[SOURCE_BAKING]),
            guide("masa-madre", "Cuenta el agua y la harina de la masa madre", "Tu masa madre también contiene harina y agua. Inclúyelas para conservar la hidratación que buscas.", [("Define la harina total", "Si tu fórmula tiene 500 g de harina total y el 20 % está prefermentado, habrá 100 g de harina dentro de la masa madre."), ("Una masa madre al cien por cien", "Con hidratación del 100 %, esos 100 g de harina van acompañados de 100 g de agua: necesitas 200 g de masa madre."), ("Qué queda por añadir", "Para una hidratación final del 70 %, el agua total es 350 g. Añade 400 g de harina y 250 g de agua, además de los 200 g de masa madre. La sal y otros ingredientes se calculan aparte sobre los 500 g de harina total."), ("Evita un error habitual", "El porcentaje de harina prefermentada no es el porcentaje de peso de masa madre. La herramienta usa harina prefermentada y permite cambiar la hidratación de tu cultivo.")], topic="masa-madre", sources=[SOURCE_BAKING]),
            guide("hidratacion", "Qué significa una masa al 70 % de hidratación", "Relaciona el peso del agua con el de la harina y compara fórmulas con la misma referencia.", [("Una relación de pesos", "Hidratación = agua ÷ harina × 100. Con 350 g de agua y 500 g de harina, la hidratación es del 70 %. Usa una báscula y una misma unidad de peso."), ("Incluye los prefermentos", "La harina y el agua de una masa madre cuentan dentro de la fórmula total. Si las ignoras, el porcentaje calculado no corresponde a la masa real."), ("No describe toda la textura", "Dos masas con el mismo porcentaje pueden comportarse de forma distinta por el tipo de harina y el proceso. El aceite se contabiliza por separado en nuestras calculadoras."), ("Ponlo en práctica", "Cambia solo la hidratación en la calculadora y observa cómo se reparte un mismo peso de masa entre harina y agua. Mantén constantes los demás porcentajes para comparar.")], sources=[SOURCE_BAKING]),
            guide("pan", "Escala una fórmula de pan sin cambiar sus proporciones", "De una hogaza pequeña a varias piezas: utiliza un factor de escala y conserva la fórmula.", [("El factor de escala", "Divide el peso de masa que quieres por el peso de tu fórmula inicial. Si tienes una fórmula de 800 g y quieres 1200 g, el factor es 1,5. Multiplica cada ingrediente por ese valor."), ("Comprueba la suma", "El peso objetivo corresponde a masa antes del horno. El pan horneado perderá agua; no puede deducirse su peso final solamente con los porcentajes."), ("El proceso también importa", "El mismo factor no se aplica a los tiempos de fermentación o al tiempo de horno. El tamaño de la pieza y las condiciones de trabajo exigen observación."), ("Usa las calculadoras", "La calculadora de masa reparte un peso total entre ingredientes. Si trabajas con masa madre, descuenta además la harina y el agua de tu cultivo.")], sources=[SOURCE_BAKING]),
            guide("focaccia", "Cuánta masa necesitas para tu bandeja de focaccia", "Usa la superficie del molde para escalar una fórmula que ya conoces.", [("Parte de una bandeja de referencia", "Si una fórmula te funciona en un molde de 20 × 30 cm, su superficie es 600 cm². En uno de 30 × 40 cm, la superficie es 1200 cm²: el doble."), ("Conserva la altura", "Multiplica todos los ingredientes por la relación entre las superficies. Esto conserva la cantidad de masa por centímetro cuadrado, siempre que el molde tenga altura suficiente."), ("No escales el reloj", "Duplicar la masa no significa duplicar el horneado. La geometría, el material del molde y el horno afectan al proceso."), ("Anota tu resultado", "Registra la cantidad de masa, las medidas de la bandeja y la altura obtenida. Una fórmula propia documentada es una referencia mejor que atribuir una textura a una cantidad sin probarla.")], sources=[SOURCE_BAKING]),
        ]
    if profile == "energia":
        return [
            guide("vatios", "De vatios a kWh: entiende la cuenta", "Convierte una potencia media y un tiempo de uso en energía consumida.", [("Potencia y energía", "Los vatios expresan potencia. Los kilovatios hora expresan energía. Un aparato que consume de media 100 W durante 10 horas utiliza 1 kWh."), ("La fórmula", "Energía en kWh = vatios × horas ÷ 1000. Coste de energía = kWh × precio por kWh. Para 30 días, multiplica las horas de uso diario por 30."), ("Un ejemplo", "Con 100 W, 8 horas al día y 30 días, el consumo es 24 kWh. Con un precio introducido de 0,20 €/kWh, el coste de esa energía es 4,80 €. Es un ejemplo, no una tarifa actual."), ("Qué incluye el resultado", "La herramienta estima el término de energía con el precio que escribas. No añade potencia contratada, alquiler de contador, impuestos ni otros conceptos. Si tu precio ya los incluye, no los vuelvas a sumar."), ("Mide si puedes", "La potencia de una etiqueta no siempre es el consumo medio. Los aparatos con ciclos o varios modos necesitan una medición representativa para una estimación útil.")], sources=[SOURCE_ENERGY]),
            guide("servidor", "El coste de un servidor encendido las 24 horas", "Una pequeña potencia sostenida durante todo el mes puede sumar un consumo apreciable.", [("Usa un consumo medido", "Un servidor no utiliza de forma constante la potencia máxima de su fuente. Para hacer la cuenta, introduce una medición media representativa del equipo completo."), ("Treinta días completos", "Un consumo medio de 40 W durante 24 horas al día y 30 días suma 28,8 kWh. Con el precio de ejemplo de 0,20 €/kWh, la energía cuesta 5,76 €."), ("Qué equipos estás contando", "Si mides la torre, no incluyas también ese valor como consumo de sus discos internos. Puedes medir por separado un SAI, un switch o un monitor si no estaban incluidos."), ("Comparar antes de comprar", "Introduce el consumo del equipo actual y del nuevo en la herramienta de amortización. El ahorro depende de las horas de funcionamiento y del precio de energía que realmente pagues.")], sources=[SOURCE_ENERGY]),
            guide("standby", "Cuánto suma el consumo en espera", "Haz una estimación con los vatios medidos en standby y las horas de ese estado.", [("Un ejemplo pequeño pero continuo", "Cinco vatios durante 24 horas al día y 30 días son 3,6 kWh. A un precio de ejemplo de 0,20 €/kWh, equivalen a 0,72 € de energía."), ("Evita contar dos veces", "Si un aparato funciona 4 horas y queda en espera las 20 restantes, calcula cada estado con su potencia y su duración. No uses 24 horas para ambos."), ("Haz una medición estable", "Algunos aparatos despiertan de forma periódica o cambian de modo. Un valor instantáneo puede no representar la media de todo el día."), ("Prioriza con números", "Compara costes de energía antes de decidir cambios. La conveniencia de desconectar un equipo depende también de sus funciones y necesidades de continuidad.")], sources=[SOURCE_ENERGY]),
            guide("amortizacion", "¿Se paga solo un aparato más eficiente?", "Calcula cuánto tarda un ahorro de energía en recuperar una inversión inicial.", [("La diferencia de consumo", "Resta la potencia media del equipo nuevo a la del actual. Multiplica la diferencia por las horas, los días y el precio por kWh."), ("Un ejemplo de cálculo", "Reducir un consumo de 80 W a 20 W, durante 24 horas al día y 365 días, ahorra 525,6 kWh al año. A un precio de ejemplo de 0,20 €/kWh son 105,12 € anuales."), ("Recuperar la inversión", "Si el cambio cuesta 250 € netos, la recuperación simple sería de unos 28,5 meses. Este cálculo mantiene constantes el precio y el uso, sin considerar financiación, mantenimiento ni vida útil."), ("Cuándo no hay recuperación", "Si el coste anual nuevo no es menor, no hay ahorro de energía con el que recuperar la inversión. La herramienta lo muestra en lugar de devolver un plazo negativo.")], sources=[SOURCE_ENERGY]),
            guide("electrodomesticos", "Estimar un electrodoméstico con ciclos de consumo", "Distingue la potencia máxima de la energía de un ciclo completo.", [("La etiqueta y el uso real", "Un calentador o un compresor no funciona necesariamente durante todo el tiempo que el aparato está encendido. Potencia máxima por horas encendido puede sobreestimar su consumo."), ("Si conoces los kWh por ciclo", "Multiplica la energía medida de un ciclo por el número de ciclos del mes y por el precio por kWh. No necesitas volver a convertir desde vatios."), ("Si utilizas nuestra calculadora", "Introduce una potencia media correspondiente al tiempo de uso, obtenida de una medición representativa. No presentes una estimación como una lectura de contador."), ("Compara condiciones parecidas", "Para comparar dos aparatos, utiliza un mismo tipo de uso. Carga, programa y temperatura pueden cambiar la energía consumida.")], sources=[SOURCE_ENERGY]),
        ]
    return [
        recipe("tortitas", "Tortitas sencillas para una mañana tranquila", "Una receta base con harina, leche y huevo. Ajusta las cantidades al número de raciones que necesitas.", 4, [(200, "g", "harina de trigo"), (250, "g", "leche"), (1, "unidad", "huevo"), (20, "g", "azúcar"), (8, "g", "impulsor químico"), (20, "g", "aceite suave"), (1, "g", "sal")], ["Mezcla la harina, el azúcar, el impulsor y la sal en un bol.", "Bate el huevo con la leche y el aceite. Incorpora los ingredientes secos hasta obtener una mezcla uniforme, sin batir en exceso.", "Deja reposar la mezcla unos diez minutos. Calienta una sartén a fuego medio y engrásala ligeramente.", "Vierte pequeñas porciones. Cuando aparezcan burbujas y los bordes empiecen a cuajar, gira cada tortita.", "Termina de cocinar hasta que el centro esté cuajado. Ajusta el fuego si el exterior se dora antes que el interior."], "Contiene trigo, leche y huevo. La absorción de la harina y el tamaño del huevo pueden cambiar la textura. Al escalar, ajusta los huevos con criterio: una fracción de huevo se puede pesar después de batirlo. Los tiempos son orientativos; comprueba la cocción."),
        recipe("garbanzos", "Ensalada de garbanzos con limón", "Legumbres ya cocidas, verduras y un aliño sencillo. Una receta fácil de ajustar por raciones.", 2, [(400, "g", "garbanzos cocidos y escurridos"), (200, "g", "tomate"), (150, "g", "pepino"), (50, "g", "cebolla"), (20, "g", "aceite de oliva"), (15, "g", "zumo de limón"), (2, "g", "sal")], ["Lava las verduras y corta tomate, pepino y cebolla en trozos pequeños.", "Escurre los garbanzos ya cocidos. Si son de conserva, puedes aclararlos antes de escurrirlos.", "Mezcla aceite, limón y sal en un recipiente pequeño.", "Reúne garbanzos y verduras en un bol. Añade el aliño, mezcla y prueba antes de ajustar la sal.", "Sirve o guarda la preparación tapada en el frigorífico hasta consumirla."], "Usa garbanzos ya cocidos, no legumbres secas. La cantidad de sal y la acidez son ajustables. Si empleas ingredientes envasados, revisa sus alérgenos."),
        recipe("tortilla", "Tortilla francesa: una receta de dos huevos", "Una base corta para preparar una tortilla y adaptar la cantidad a otras raciones.", 1, [(2, "unidades", "huevos"), (5, "g", "aceite de oliva"), (0.5, "g", "sal")], ["Casca los huevos en un bol, añade la sal y bátelos hasta integrar clara y yema.", "Calienta una sartén antiadherente a fuego medio con el aceite.", "Vierte el huevo y mueve suavemente al principio para repartirlo.", "Cuando la base se sostenga, dobla la tortilla. Termina de cocinar hasta que el huevo esté cuajado, sin dejar partes líquidas.", "Sirve enseguida. Si preparas varias raciones, cocina tortillas separadas para controlar mejor la cocción."], "Contiene huevo. Usa huevos en buen estado y evita el contacto de las cáscaras con la preparación. La herramienta escala ingredientes, no tiempos ni tamaño de sartén."),
        guide("bizcocho", "Cómo adaptar una receta a otro molde redondo", "Compara las superficies de dos moldes para mantener una altura de masa parecida.", [("Mide el diámetro interior", "Para dos moldes redondos de igual altura de llenado, el factor de escala es (diámetro nuevo ÷ diámetro original)². Cambiar de 20 a 24 cm requiere un factor de 1,44."), ("Multiplica todos los ingredientes", "Si tu receta emplea 200 g de harina, la cantidad escalada es 288 g. Aplica el mismo factor al resto de los ingredientes, incluidos los huevos medidos por peso si necesitas fracciones."), ("Comprueba la capacidad", "La comparación presupone una altura de masa similar. No llenes un molde por encima de la capacidad apropiada para tu receta; necesita espacio para crecer."), ("El horno no se escala", "El tiempo no se multiplica por 1,44. El material del molde, el horno y la geometría afectan a la cocción. Vigila el resultado y utiliza los criterios de cocción de tu receta.")], topic="bizcocho"),
        guide("galletas", "Escalar ingredientes sin multiplicar los tiempos", "El factor de raciones cambia las cantidades. El proceso necesita su propia comprobación.", [("Usa un único factor", "Divide las raciones deseadas por las originales y multiplica cada cantidad por ese valor. De 4 a 6 raciones, el factor es 1,5."), ("Pesa las fracciones", "Para ingredientes como el huevo, una fracción se mide con más consistencia después de batirlo. La herramienta muestra la cantidad matemática; no decide el redondeo por ti."), ("Controla las tandas", "Si haces más galletas del mismo tamaño, suele aumentar el número de tandas, no el tiempo de cada tanda. Sigue las señales de cocción de la receta que estés utilizando."), ("Anota cambios reales", "Registra el tamaño de cada pieza y las condiciones del horno. No atribuyas un resultado a una receta antes de comprobarlo.")]),
    ]


def initialize(root, profile, base_url):
    root.mkdir(parents=True, exist_ok=True)
    if not (root/"site.json").exists():
        write_json(root/"site.json", {"profile": profile, "base_url": base_url.rstrip("/"), "country": "ES", "max_new_per_day": 1, "auto_publish_math": True})
    if not (root/"catalog.json").exists():
        initial = library(profile)
        # Tres recetas + guía de moldes; tres guías de pan; dos de energía.
        count = 4 if profile == "cocina" else 3 if profile == "masa" else 2
        write_json(root/"catalog.json", {"articles": initial[:count], "last_generation_date": "", "generated_today": 0})


def cycle(root, do_scan=True):
    config = read_json(root/"site.json")
    profile = config["profile"]
    if profile == "deportes":
        data = update_sports(root) if do_scan else read_json(root/"sports.json", {})
        return {"profile": profile, "pages": render(root), "added": [], "ranking": 0, "errors": data.get("errors", [])}
    result = None
    if do_scan:
        result = scan(profile, config.get("country", "ES"))
        write_json(root/"ranking.json", result)
    else:
        result = read_json(root/"ranking.json", {"ranking": []})
    catalog = read_json(root/"catalog.json", {"articles": [], "generated_today": 0})
    today = dt.datetime.now(UTC).date().isoformat()
    if catalog.get("last_generation_date") != today:
        catalog["last_generation_date"], catalog["generated_today"] = today, 0
    known = {a["topic"] for a in catalog["articles"]}
    available = {a["topic"]: a for a in library(profile)}
    added = []
    limit = min(2, max(0, int(config.get("max_new_per_day", 1))))
    for row in result.get("ranking", []):
        topic = row["topic"]
        if topic in known or catalog["generated_today"] >= limit:
            continue
        if topic not in available:
            # No inventar una receta para cubrir una tendencia no soportada.
            continue
        article = copy.deepcopy(available[topic])
        article["trigger"] = {"topic": topic, "detected": result.get("updated", ""), "score": round(row["score"], 1), "meaning": "Señal editorial; no visitas"}
        auto = article["kind"] == "guide" and config.get("auto_publish_math", True)
        article["status"] = "published" if auto else "draft"
        article["created"] = now_iso()
        catalog["articles"].append(article)
        known.add(topic)
        catalog["generated_today"] += 1
        added.append(article["id"])
    write_json(root/"catalog.json", catalog)
    rendered = render(root)
    return {"profile": profile, "added": added, "pages": rendered, "ranking": len(result.get("ranking", [])), "errors": result.get("errors", [])}


def esc(text):
    return html.escape(str(text), quote=True)


def match_date(value):
    try:
        if len(value) == 10:
            return dt.date.fromisoformat(value).strftime("%d/%m/%y") + " · Hora sin confirmar"
        date = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if date.tzinfo is None:
            date = date.replace(tzinfo=UTC)
        return date.astimezone(ZoneInfo("Europe/Madrid")).strftime("%d/%m/%y %H:%M")
    except (ValueError, TypeError, AttributeError):
        return "Fecha sin confirmar"


def page(profile, base_url, path, title, description, body, schema=None, adsense=None):
    p = PROFILES[profile]
    canonical = base_url.rstrip("/") + path
    graph = [schema] if schema else []
    if path != "/":
        graph.append({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": p["title"], "item": base_url+"/"}, {"@type": "ListItem", "position": 2, "name": title, "item": canonical}]})
    structured = json.dumps(graph, ensure_ascii=False).replace("<", "\\u003c") if graph else ""
    ads = adsense or {}
    pub = ads.get("publisher_id", "").removeprefix("ca-")
    if pub and not re.fullmatch(r"pub-\d{16}", pub):
        raise ValueError("ID de editor AdSense no válido.")
    adtags = f'<meta name="google-adsense-account" content="ca-{pub}">' if pub else ""
    if ads.get("enabled"):
        if not pub or not ads.get("google_cmp_ready"):
            raise ValueError("Para integrar AdSense falta el ID o confirmar el mensaje CMP de Google.")
        adtags += f'<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-{pub}" crossorigin="anonymous"></script>'
    privacy_control = ""
    if ads.get("enabled"):
        adtags += '<script src="/assets/consent.js" defer></script>'
        privacy_control = '<a href="/privacidad/" id="privacy-options" hidden>Opciones de privacidad</a>'
    nav = '<a href="/">Inicio</a>' + ('<a href="/partidos/">Partidos por fecha</a><a href="/metodo/">Fuentes</a>' if profile == "deportes" else '<a href="/#herramientas">Calculadoras</a><a href="/#lecturas">' + ("Recetas y guías" if profile == "cocina" else "Guías") + '</a>')
    return f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} | {esc(p['title'])}</title><meta name="description" content="{esc(description)}"><link rel="canonical" href="{esc(canonical)}"><meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(description)}"><meta property="og:type" content="website"><meta property="og:url" content="{esc(canonical)}"><meta property="og:image" content="{esc(base_url)}/assets/{p['icon']}.svg"><link rel="icon" href="/assets/{p['icon']}.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/style.css"><script src="/assets/tools.js" defer></script>{adtags}{'<script type="application/ld+json">'+structured+'</script>' if structured else ''}</head><body style="--accent:{p['color']};--paper:{p['background']}"><a class="skip" href="#contenido">Ir al contenido</a><header class="site-header"><a class="brand" href="/"><img src="/assets/{p['icon']}.svg" width="38" height="38" alt="">{esc(p['title'])}<span class="brand-dot">.</span></a><nav aria-label="Principal">{nav}</nav></header><main id="contenido">{body}</main><footer><a class="brand" href="/">{esc(p['title'])}.</a><p>Contenido gratuito. Fuentes visibles. Cuentas claras.</p><div><a href="/metodo/">Cómo trabajamos</a><a href="/privacidad/">Privacidad</a>{privacy_control}<a href="/sitemap.xml">Mapa del sitio</a></div><small>© {dt.datetime.now(UTC).year} {esc(p['title'])}</small></footer></body></html>'''


def field(name, label, value, low, high, step="1", suffix=""):
    return f'<label>{esc(label)}<span class="input-wrap"><input name="{name}" type="number" value="{value}" min="{low}" max="{high}" step="{step}" required><span>{esc(suffix)}</span></span></label>'


def tool_page(tool):
    common = '<div class="result" aria-live="polite"></div><p class="form-error" role="alert"></p>'
    if tool == "masa":
        fields = field("pieces", "Número de piezas", 4, 1, 100) + field("weight", "Peso por pieza", 250, 20, 2000, suffix="g") + field("hydration", "Hidratación", 65, 0, 150, "0.1", "%") + field("salt", "Sal", 2, 0, 10, "0.1", "%") + field("oil", "Aceite", 2, 0, 50, "0.1", "%") + field("yeast", "Levadura seca", 0.2, 0, 10, "0.01", "%")
        intro = "Los porcentajes se calculan respecto al peso de harina. El resultado es masa antes del horneado."
        note = "La levadura es editable y no estima tiempos de fermentación. Agua y aceite se cuentan por separado. Los resultados se redondean solo al mostrarlos."
    elif tool == "madre":
        fields = field("flour", "Harina total de la fórmula", 500, 1, 100000, suffix="g") + field("hydration", "Hidratación final", 70, 0, 150, "0.1", "%") + field("fermented", "Harina prefermentada", 20, 0, 100, "0.1", "%") + field("starterHydration", "Hidratación de la masa madre", 100, 0, 200, "0.1", "%")
        intro = "La harina total incluye la que ya contiene tu masa madre. Calcula cuánto queda por añadir."
        note = "El porcentaje prefermentado se refiere a harina, no al peso del cultivo. Calcula la sal y otros ingredientes aparte sobre la harina total."
    elif tool == "consumo":
        fields = field("watts", "Potencia media", 100, 0, 100000, "0.1", "W") + field("hours", "Uso diario", 8, 0, 24, "0.1", "h") + field("days", "Días", 30, 0, 366) + field("price", "Tu precio de energía", 0.20, 0, 10, "0.001", "€/kWh")
        intro = "Introduce tu consumo medio medido y el precio de tu factura. El valor inicial de 0,20 €/kWh es un ejemplo."
        note = "kWh = W × horas/día × días ÷ 1000. Solo estima el coste de energía; no suma potencia contratada, impuestos ni cargos fijos. Un aparato con ciclos no consume siempre su potencia máxima."
    elif tool == "ahorro":
        fields = field("old", "Potencia media actual", 80, 0, 100000, "0.1", "W") + field("new", "Potencia media nueva", 20, 0, 100000, "0.1", "W") + field("hours", "Uso diario", 24, 0, 24, "0.1", "h") + field("price", "Tu precio de energía", 0.20, 0, 10, "0.001", "€/kWh") + field("investment", "Coste neto del cambio", 250, 0, 100000, "0.01", "€")
        intro = "Compara los costes de energía para un año de 365 días y calcula la recuperación simple de la inversión."
        note = "Supone consumo y tarifa constantes. No incluye financiación, mantenimiento, cargos fijos ni vida útil. El precio inicial es un ejemplo, no una tarifa recomendada."
    elif tool == "moldes":
        fields = field("old", "Diámetro original", 20, 1, 100, "0.1", "cm") + field("new", "Diámetro nuevo", 24, 1, 100, "0.1", "cm") + field("amount", "Cantidad de un ingrediente", 200, 0, 100000, "0.1", "g")
        intro = "Para moldes redondos y una misma altura de masa. Multiplica cada ingrediente por el factor de superficie."
        note = "Factor = (diámetro nuevo ÷ diámetro original)². No calcula capacidad de moldes de distinta altura ni tiempo de horneado."
    else:
        fields = field("from", "Raciones originales", 4, 1, 100, "0.5") + field("to", "Raciones deseadas", 6, 1, 100, "0.5") + field("amount", "Cantidad de un ingrediente", 200, 0, 100000, "0.1", "g")
        intro = "Introduce las raciones y una cantidad. Aplica el mismo factor al resto de ingredientes de tu receta."
        note = "La herramienta escala cantidades, no tiempos. Las fracciones de huevo pueden pesarse después de batirlo; decide los redondeos según tu receta."
    return f'<p class="intro">{intro}</p><div class="calculator-layout"><form class="calculator" data-tool="{tool}"><div class="form-grid">{fields}</div><button class="button" type="submit">Calcular <span aria-hidden="true">↗</span></button>{common}</form><aside class="note"><span class="eyebrow">LA CUENTA, EXPLICADA</span><h2>Una fórmula que puedes comprobar.</h2><p>{note}</p><a href="/metodo/">Ver nuestro método →</a></aside></div>'


def render(root):
    import shutil
    config = read_json(root/"site.json")
    profile, base = config["profile"], config["base_url"].rstrip("/")
    if urllib.parse.urlparse(base).scheme not in {"https", "http"}:
        raise ValueError("Origen web no válido.")
    p = PROFILES[profile]
    catalog = read_json(root/"catalog.json", {"articles": []})
    articles = [a for a in catalog["articles"] if a["status"] == "published"]
    out = root/"dist"
    out.mkdir(exist_ok=True)
    assets = root/"assets" if (root/"assets").exists() else Path(__file__).parent/"assets"
    shutil.copytree(assets, out/"assets", dirs_exist_ok=True)
    paths = []

    def save(path, title, description, body, schema=None):
        target = out/(path.strip("/") + "/index.html" if path != "/" else "index.html")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(page(profile, base, path, title, description, body, schema, config.get("adsense")), encoding="utf-8")
        paths.append(path)

    tool_cards = "".join(f'<a class="tool-card" href="/calculadoras/{tid}/"><span class="card-number">0{i+1}</span><h3>{esc(title)}</h3><p>{esc(desc)}</p><span class="arrow" aria-hidden="true">↗</span></a>' for i, (tid, title, desc) in enumerate(p["tools"]))
    cards = "".join(f'<a class="article-card" href="/{"recetas" if a["kind"]=="recipe" else "guias"}/{esc(a["id"])}/"><span class="eyebrow">{"RECETA BASE" if a["kind"]=="recipe" else "GUÍA PRÁCTICA"}</span><h3>{esc(a["title"])}</h3><p>{esc(a["description"])}</p><span>Leer {"receta" if a["kind"]=="recipe" else "guía"} <span aria-hidden="true">→</span></span></a>' for a in articles)
    hero = f'<section class="hero"><div><p class="eyebrow">{p["eyebrow"]}</p><h1>{esc(p["heading"]).replace(chr(10), "<br>")}</h1><p class="hero-description">{esc(p["description"])}</p><a class="button" href="#herramientas">Empezar a calcular <span aria-hidden="true">↗</span></a><p class="hero-caption">Sin registro · Gratis · A tu ritmo</p></div><div class="hero-art"><img src="/assets/{p["icon"]}.svg" width="520" height="440" alt="Ilustración de {"ingredientes y un bol" if profile=="cocina" else "una hogaza y una pizza" if profile=="masa" else "una casa y su consumo eléctrico"}"><div class="art-label"><strong>{"A tu medida" if profile=="cocina" else "Harina = 100 %" if profile=="masa" else "W × h ÷ 1000"}</strong><span>{"Cantidades claras, desde el principio." if profile=="cocina" else "La base de todas tus proporciones." if profile=="masa" else "La energía que realmente utilizas."}</span></div></div></section>'
    body = hero + f'<section id="herramientas"><div class="section-heading"><div><p class="eyebrow">MENOS CUENTAS, MÁS CLARIDAD</p><h2>Herramientas para empezar.</h2></div><p>Modifica los datos y obtén el resultado al momento.</p></div><div class="tools-grid">{tool_cards}</div></section><section id="lecturas"><div class="section-heading"><div><p class="eyebrow">PARA ENTENDER EL PORQUÉ</p><h2>{"Recetas y pequeñas certezas." if profile=="cocina" else "De la fórmula a la práctica."}</h2></div><a href="/metodo/">Conoce nuestro método →</a></div><div class="articles-grid">{cards}</div></section><section class="closing"><p class="eyebrow">COMPRUEBA. AJUSTA. REPITE.</p><h2>El mejor punto de partida<br>son tus propios datos.</h2><p>{"Una receta base admite ajustes. Anota lo que cambias y cómo queda." if profile=="cocina" else "Una calculadora explica cantidades; tus pruebas explican el resultado." if profile=="masa" else "Usa consumos medidos y el precio de tu factura para tomar decisiones."}</p></section>'
    ranking = read_json(root/"ranking.json", {})
    if ranking.get("ranking") and profile != "deportes":
        pills = "".join(f'<li>{esc(r["topic"].replace("-", " "))} · {esc(r["traffic_label"] if "traffic_label" in r else str(r["searches_lower_bound"])+"+ búsquedas" if r["searches_lower_bound"] is not None else str(r["news_count"])+" menciones en noticias")}</li>' for r in ranking["ranking"][:5])
        strip = f'<section class="trend-strip"><p class="eyebrow">EL RADAR DEL TEMA</p><ul>{pills}</ul><p class="small">Consultado: {esc(ranking.get("updated", ""))}. Señales de búsquedas y noticias, no visitas a esta web.</p></section>'
        body = hero + strip + body[len(hero):]
    if profile == "deportes":
        hero = hero.replace('href="#herramientas"', 'href="#resultados"').replace("Empezar a calcular", "Consultar resultados").replace("Sin registro · Gratis · A tu ritmo", "Sin registro · Datos abiertos · Fuentes enlazadas").replace("una casa y su consumo eléctrico", "un balón y un circuito")
        hero = hero.replace("W × h ÷ 1000", "Cada dato, con fecha").replace("La energía que realmente utilizas.", "Consulta el estado de la fuente.")
        hero = hero.replace('href="#resultados"', 'href="#partidos"').replace('Consultar resultados', 'Ver partidos por fecha')
        body = hero + calendar_html() + sports_html(read_json(root/"sports.json", {}))
    save("/", p["seo_title"], p["description"], body, {"@context": "https://schema.org", "@type": "WebSite", "name": p["title"], "url": base+"/", "inLanguage": "es"})
    if profile == "deportes":
        sports = read_json(root/"sports.json", {})
        save("/partidos/", "Qué partidos se juegan en la fecha que elijas", "Calendario de fútbol por fecha: ligas, Champions, Europa League y selecciones, con horarios de España peninsular.", '<section class="page-heading"><h1>Tu día de fútbol.</h1><p class="intro">Elige una fecha y consulta los partidos publicados de clubes y selecciones.</p></section>'+calendar_html())
        save("/futbol/", "Resultados de ligas europeas, Champions y Europa League", "Siete ligas europeas, Champions League, Europa League y calendario de selecciones: partidos, horarios y fuentes.", '<section class="page-heading"><h1>Fútbol de clubes y selecciones</h1><p class="intro">Elige una competición o consulta todos los partidos de un día.</p><a class="button" href="/partidos/">Partidos por fecha →</a></section>'+leagues_html(sports))
        save("/futbol/selecciones/", "Partidos internacionales de selecciones por fecha", "Amistosos, Mundial, Eurocopa, Nations League y clasificatorios. Calendario de selecciones con banderas y horarios.", '<section class="page-heading"><h1>Las selecciones, en el calendario.</h1><p class="intro">Consulta partidos internacionales y horarios de España peninsular.</p></section>'+calendar_html("selecciones"))
        for code, (route, country, name, _) in LEAGUES.items():
            league_data = sports.get("leagues", {}).get(code)
            if code == "BL1" and not league_data:
                league_data = sports.get("football", {})
            available = bool(league_data and league_data.get("matches"))
            body_league = f'<section class="page-heading"><h1>Resultados de {esc(name)}</h1><p class="intro">{esc(country)} · resultados y próximos partidos disponibles en la fuente.</p></section>'+calendar_html(code)+leagues_html(sports, code)
            save(f"/futbol/{route}/", f"Resultados de {name} y próximos partidos", f"Consulta la disponibilidad de los marcadores de {name}, sus fechas y su fuente de datos.", body_league)
            if not available:
                pending = out/f"futbol/{route}/index.html"
                pending.write_text(pending.read_text(encoding="utf-8").replace("</head>", '<meta name="robots" content="noindex,follow"></head>'), encoding="utf-8")
        football_only = {k: v for k, v in sports.items() if k in {"football", "errors"}}
        f1_only = {k: v for k, v in sports.items() if k in {"f1", "errors"}}
        save("/formula-1/", "Resultados de la última carrera de Fórmula 1", "Clasificación y puntos de la última carrera disponible en jolpica-f1, con fecha y fuente.", '<section class="page-heading"><h1>Resultados de Fórmula 1</h1><p class="intro">La última carrera disponible en jolpica-f1, con piloto, equipo y puntos.</p>'+sports_html(f1_only, "f1")+'</section>')
    for tid, title, desc in p["tools"]:
        save(f"/calculadoras/{tid}/", title, desc, f'<section class="page-heading"><a href="/">← Inicio</a><p class="eyebrow">HERRAMIENTA GRATUITA</p><h1>{esc(title)}</h1>{tool_page(tid)}</section>')
    for article in articles:
        aid = article["id"]
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", aid):
            raise ValueError("Identificador de artículo no válido.")
        recipe_kind = article["kind"] == "recipe"
        category = "recetas" if recipe_kind else "guias"
        body = f'<article class="reading"><a href="/">← Inicio</a><p class="eyebrow">{"RECETA BASE" if recipe_kind else "GUÍA PRÁCTICA"}</p><h1>{esc(article["title"])}</h1><p class="intro">{esc(article["description"])}</p>'
        schema = {"@context": "https://schema.org", "@type": "Article", "headline": article["title"], "description": article["description"], "datePublished": article["created"], "author": {"@type": "Organization", "name": p["title"]}, "mainEntityOfPage": base+f"/{category}/{aid}/"}
        if recipe_kind:
            body += f'<figure><img src="/assets/{esc(aid)}.svg" alt="Ilustración de {esc(article["title"])}" width="1200" height="800" style="width:100%;height:auto;border-radius:8px"><figcaption class="small">Ilustración orientativa del plato.</figcaption></figure>'
            body += f'<section class="recipe-box" data-recipe><div class="recipe-heading"><h2>Ingredientes</h2><label>Raciones <input class="servings" type="number" min="1" max="100" value="{article["servings"]}" data-base="{article["servings"]}"></label></div><ul class="ingredients">'
            for ingredient in article["ingredients"]:
                body += f'<li><span><strong data-amount="{ingredient["amount"]}">{ingredient["amount"]:g}</strong> {esc(ingredient["unit"])}</span><span>{esc(ingredient["name"])}</span></li>'
            body += '</ul><p class="small">Las cantidades se escalan; el tiempo de cocción y el proceso no. Pesa las fracciones de huevo batido si hace falta.</p><h2>Preparación</h2><ol class="steps">' + "".join(f'<li>{esc(step)}</li>' for step in article["steps"]) + '</ol></section>'
            schema = {"@context": "https://schema.org", "@type": "Recipe", "name": article["title"], "description": article["description"], "image": [base+f"/assets/{aid}.svg"], "author": {"@type": "Organization", "name": p["title"]}, "datePublished": article["created"], "recipeYield": f'{article["servings"]} raciones', "recipeIngredient": [f'{i["amount"]:g} {i["unit"]} {i["name"]}' for i in article["ingredients"]], "recipeInstructions": [{"@type": "HowToStep", "text": step} for step in article["steps"]]}
        for heading, text in article["sections"]:
            body += f'<h2>{esc(heading)}</h2><p>{esc(text)}</p>'
        body += '<div class="inline-cta"><h2>Haz la cuenta con tus cantidades.</h2>' + "".join(f'<a href="/calculadoras/{t[0]}/">{esc(t[1])} →</a>' for t in p["tools"]) + '</div>'
        if article.get("sources"):
            body += '<h2>Referencias</h2><ul>' + "".join(f'<li><a href="{esc(url)}" rel="noopener">{esc(urllib.parse.urlparse(url).hostname)}: referencia de la fórmula</a></li>' for url in article["sources"]) + '</ul>'
        if recipe_kind:
            body += '<p class="editorial-note">Receta orientativa. No atribuimos pruebas de cocina, valoraciones ni información nutricional que no hayamos documentado.</p>'
        related = [a for a in articles if a["id"] != aid][:3]
        if related:
            body += '<h2>Sigue explorando</h2><ul>'+"".join(f'<li><a href="/{"recetas" if a["kind"]=="recipe" else "guias"}/{esc(a["id"])}/">{esc(a["title"])}</a></li>' for a in related)+'</ul>'
        body += '</article>'
        save(f"/{category}/{aid}/", article["title"], article["description"], body, schema)
    method = '<article class="reading"><p class="eyebrow">NUESTRO MÉTODO</p><h1>Útil, claro y comprobable.</h1><p>Publicamos calculadoras con fórmulas visibles, ejemplos identificados y textos propios. Las ilustraciones son dibujos, no fotografías de resultados cocinados.</p><h2>Contenido y revisión</h2><p>Las señales de tendencias ayudan a elegir temas. Un tema popular no demuestra que una receta funcione. Las nuevas propuestas de recetas se guardan como borradores; las guías matemáticas usan una biblioteca limitada de fórmulas y ejemplos comprobados.</p><h2>Lo que mostramos</h2><p>No inventamos visitas, valoraciones, ensayos, autores expertos ni datos nutricionales. Los precios eléctricos de ejemplo son editables y no representan una tarifa vigente.</p></article>'
    if profile == "deportes":
        method = '<article class="reading"><p class="eyebrow">FUENTES Y ACTUALIZACIONES</p><h1>Un marcador con contexto.</h1><p>Consultamos datos comunitarios de OpenLigaDB para la Bundesliga y jolpica-f1 para Fórmula 1. Los resultados no son un servicio de apuestas ni de marcadores oficiales en directo.</p><h2>Frecuencia</h2><p>La actualización se programa cada dos horas. Cada bloque conserva la hora de su último acceso correcto. Si falla una fuente, mantenemos el último dato con su fecha en lugar de inventar un marcador.</p><h2>Fútbol</h2><p>Datos proporcionados por <a href="https://www.openligadb.de/">OpenLigaDB</a>, bajo <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a>. La base derivada de los partidos mostrados está disponible en <a href="/deportes.json">deportes.json</a>, con atribución y licencia. No reutilizamos los escudos de los clubes.</p><h2>Fórmula 1</h2><p>Resultados obtenidos de <a href="https://github.com/jolpica/jolpica-f1">jolpica-f1</a>, sucesor de Ergast. Indicamos carrera y fecha. La clasificación pertenece a la última carrera que devuelve la fuente, no necesariamente a una carrera disputada hoy.</p></article>'
        method = method.replace('</article>', '<h2>Ligas y calendario internacional</h2><p>Las copias periódicas de las siete ligas europeas consultan <a href="https://github.com/openfootball/football.json">OpenFootball</a> (CC0 1.0) y OpenLigaDB (ODbL 1.0). La Champions League, la Europa League y el <a href="/partidos/">calendario por fecha</a> consultan los datos públicos de <a href="https://www.espn.com/soccer/scoreboard">ESPN</a>. Mostramos las fechas y enlazamos cada competición a su fuente. No somos un servicio oficial ni garantizamos resultados en directo.</p><p>El calendario incluye las nueve competiciones de clubes, amistosos de selecciones, Mundial, Eurocopa, UEFA Nations League, clasificación mundialista de las seis confederaciones, Copa América, Copa Oro, Copa Africana de Naciones y Copa Asiática. La cobertura corresponde a los primeros equipos masculinos disponibles en la fuente; una fecha sin datos no demuestra que no exista ningún partido en otras categorías.</p><p>Las horas del calendario se muestran en España peninsular (Europe/Madrid), con cambio de horario de verano automático. La consulta se reutiliza durante unos quince minutos. Si falla una fuente, lo indicamos y conservamos la última copia disponible sin cambiar su fecha. Los escudos de clubes y las banderas de selecciones son imágenes pequeñas servidas por ESPN; no implican afiliación.</p><p>La hora de consulta no significa que haya nuevos resultados. Las copias de OpenFootball pueden incluir solo el día, sin hora ni zona horaria. No es necesario crear una cuenta para consultar el calendario.</p></article>')
    save("/metodo/", "Cómo trabajamos", "Nuestro método editorial y los límites de nuestras calculadoras.", method)
    privacy = '<article class="reading"><p class="eyebrow">PRIVACIDAD</p><h1>Tus cuentas se quedan contigo.</h1><p>Las calculadoras se ejecutan en tu navegador. Esta versión no tiene formularios de registro, cookies publicitarias, seguimiento analítico ni servicios externos de cálculo.</p><h2>Alojamiento</h2><p>El proveedor de alojamiento puede procesar información técnica de las solicitudes, como la dirección IP, para entregar la web y proteger su infraestructura. Eso no ofrece tu conexión como proxy ni permite que terceros naveguen usando la IP de tu casa.</p><h2>Cuando cambie el sitio</h2><p>Si añadimos publicidad, analíticas o formularios, actualizaremos esta información y los mecanismos de consentimiento que correspondan antes de activarlos.</p></article>'
    if profile == "deportes":
        privacy = privacy.replace("Las calculadoras se ejecutan en tu navegador.", "Los resultados se entregan desde una copia alojada en esta web. El navegador no consulta directamente las APIs deportivas.")
    ads = config.get("adsense", {})
    if ads.get("enabled"):
        privacy = '<article class="reading"><p class="eyebrow">PRIVACIDAD</p><h1>Datos y publicidad.</h1><p>Las herramientas se ejecutan en el navegador. Utilizamos Google AdSense para mostrar publicidad y el mensaje de privacidad de Google para gestionar las opciones de consentimiento.</p><h2>Google AdSense</h2><p>Google y sus colaboradores pueden procesar identificadores, cookies e información de uso conforme a tus elecciones. Consulta <a href="https://policies.google.com/technologies/partner-sites">cómo usa Google la información de sitios asociados</a>.</p><h2>Tus opciones</h2><p>Utiliza las opciones del mensaje de privacidad para aceptar, rechazar o gestionar las finalidades publicitarias. Puedes cambiar o retirar tu consentimiento mediante el enlace Opciones de privacidad del pie de página cuando esté disponible. Puedes consultar <a href="https://myadcenter.google.com/">Mi centro de anuncios de Google</a> para gestionar la personalización.</p><h2>Alojamiento</h2><p>El proveedor procesa información técnica necesaria para servir y proteger esta web.</p></article>'
    save("/privacidad/", "Privacidad", "Cómo funcionan las calculadoras y qué datos procesa esta web.", privacy)
    save("/404/", "Página no encontrada", "La página que buscas no está aquí.", '<section class="page-heading"><h1>Ese enlace se ha perdido.</h1><p>Vuelve al inicio para encontrar las calculadoras y las guías.</p><a class="button" href="/">Ir al inicio →</a></section>')
    (out/"404.html").write_text((out/"404/index.html").read_text(encoding="utf-8"), encoding="utf-8")
    (out/"robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n", encoding="utf-8")
    sitemap = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(f'<url><loc>{esc(base+path)}</loc></url>' for path in paths if path != "/404/") + '</urlset>'
    (out/"sitemap.xml").write_text(sitemap, encoding="utf-8")
    (out/"_headers").write_text("/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n", encoding="utf-8")
    pub = ads.get("publisher_id", "").removeprefix("ca-")
    if pub:
        if not re.fullmatch(r"pub-\d{16}", pub):
            raise ValueError("ID de editor AdSense no válido.")
        (out/"ads.txt").write_text(f"google.com, {pub}, DIRECT, f08c47fec0942fa0\n", encoding="utf-8")
    # Índice público sin borradores, rankings privados ni metadatos de las fuentes.
    write_json(out/"contenido.json", {"site": p["title"], "articles": [{"title": a["title"], "url": f'/{"recetas" if a["kind"]=="recipe" else "guias"}/{a["id"]}/'} for a in articles]})
    if profile == "deportes":
        write_json(out/"deportes.json", read_json(root/"sports.json", {}))
        worker = Path(__file__).with_name("calendar_worker.mjs")
        if worker.exists():
            shutil.copy2(worker, out/"_worker.js")
            write_json(out/"_routes.json", {"version": 1, "include": ["/api/partidos"], "exclude": []})
    for obsolete in set(read_json(root/"generated-pages.json", []))-set(paths):
        if re.fullmatch(r"/(?:guias|recetas)/[a-z0-9-]+/", obsolete):
            stale = out/obsolete.strip("/")/"index.html"
            if stale.resolve().is_relative_to(out.resolve()) and stale.is_file():
                stale.unlink()
    write_json(root/"generated-pages.json", paths)
    return len(paths)


def calendar_html(selected="todas"):
    choices = [("todas", "Todos los partidos"), ("clubes", "Solo clubes"), ("selecciones", "Solo selecciones")]
    choices += [(code, value[2]) for code, value in LEAGUES.items()]
    choices += list(NATIONAL_COMPETITIONS.items())
    options = "".join(f'<option value="{esc(code)}"'+(' selected' if selected == code else '')+f'>{esc(name)}</option>' for code, name in choices)
    return '<section id="partidos" class="calendar" data-fixtures aria-busy="false"><div class="section-heading"><div><p class="eyebrow">ELIGE TU DÍA</p><h2>¿Qué partidos se juegan?</h2></div><p>Clubes y selecciones. Horas de España peninsular.</p></div><form class="calendar-form"><label>Fecha<input type="date" name="fecha" min="2000-01-01" max="2099-12-31" required></label><label>Competición<select name="competicion">'+options+'</select></label><button class="button" type="submit">Ver partidos ↗</button></form><div class="calendar-days"><button type="button" data-day-step="-1" aria-label="Ver el día anterior">← Día anterior</button><button type="button" data-today>Hoy</button><button type="button" data-day-step="1" aria-label="Ver el día siguiente">Día siguiente →</button></div><p class="calendar-status" data-fixtures-status role="status" aria-live="polite">Selecciona una fecha para consultar los partidos.</p><div data-fixtures-list></div><noscript><p>Activa JavaScript para consultar el calendario por fecha. Los resultados periódicos siguen disponibles debajo.</p></noscript><script src="/assets/calendar.js" defer></script></section>'


def sports_request(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in {"api.openligadb.de", "api.jolpi.ca", "raw.githubusercontent.com", "site.api.espn.com"}:
        raise ValueError("Fuente deportiva no autorizada.")
    request = urllib.request.Request(url, headers={"User-Agent": "MarcadorClaro/1.0 Python/3.11"})
    with urllib.request.urlopen(request, timeout=20) as response:
        stream = gzip.GzipFile(fileobj=response) if response.headers.get("Content-Encoding") == "gzip" else response
        data = stream.read(MAX_FEED_BYTES+1)
    if len(data) > MAX_FEED_BYTES:
        raise ValueError("Respuesta deportiva demasiado grande.")
    return json.loads(data)


def normalize_matches(matches):
    result = []
    for match in matches:
        scores = match.get("matchResults", [])
        score = next((s for s in scores if s.get("resultTypeID") == 2), None)
        score = score or (scores[-1] if scores else None)
        result.append({"id": match["matchID"], "home": str(match["team1"]["teamName"]), "away": str(match["team2"]["teamName"]), "date": match.get("matchDateTimeUTC", ""), "finished": bool(match.get("matchIsFinished")), "home_score": score.get("pointsTeam1") if score else None, "away_score": score.get("pointsTeam2") if score else None, "group": match.get("group", {}).get("groupName", ""), "league": match.get("leagueName", "Bundesliga")})
    return result


def openfootball_matches(data):
    rows = data.get("matches", [])
    if not rows:
        rows = [dict(match, round=round_.get("name", "")) for round_ in data.get("rounds", []) for match in round_.get("matches", [])]
    result = []
    for row in rows:
        score = row.get("score", {})
        score = score.get("ft", []) if isinstance(score, dict) else score
        finished = isinstance(score, list) and len(score) == 2 and all(isinstance(s, int) for s in score)
        date = row.get("date", "")
        result.append({"home": row["team1"], "away": row["team2"], "date": date,
                       "finished": finished, "home_score": score[0] if finished else None,
                       "away_score": score[1] if finished else None, "group": row.get("round", ""),
                       "time_note": "Fecha de la fuente; hora y zona horaria no disponibles"})
    return result


def espn_matches(data):
    if not isinstance(data.get("events"), list):
        raise ValueError("Calendario no válido")
    result = []
    for event in data["events"]:
        competitors = event.get("competitions", [{}])[0].get("competitors", [])
        home = next((t for t in competitors if t.get("homeAway") == "home"), None)
        away = next((t for t in competitors if t.get("homeAway") == "away"), None)
        if not home or not away:
            continue
        status = event.get("status", {}).get("type", {})
        finished = bool(status.get("completed")) and status.get("state") == "post"
        def points(team):
            value = str(team.get("score", ""))
            return int(value) if finished and value.isdigit() else None
        def icon(team):
            value = team.get("team", {}).get("logo", "")
            parsed = urllib.parse.urlparse(value)
            return value if parsed.scheme == "https" and (parsed.hostname or "").endswith(".espncdn.com") and parsed.path.startswith("/i/teamlogos/") else ""
        result.append({"id": event.get("id"), "home": home["team"]["displayName"], "away": away["team"]["displayName"],
                       "date": event.get("date", ""), "finished": finished, "home_score": points(home), "away_score": points(away),
                       "home_icon": icon(home), "away_icon": icon(away), "group": "", "time_note": "Hora UTC"})
    return result


def recent_matches(matches):
    today = dt.datetime.now(UTC).date().isoformat()
    finished = sorted((m for m in matches if m.get("finished")), key=lambda m: m["date"], reverse=True)[:10]
    upcoming = sorted((m for m in matches if not m.get("finished") and m.get("date", "")[:10] >= today), key=lambda m: m["date"])[:4]
    return finished + upcoming


def update_sports(root):
    previous = read_json(root/"sports.json", {})
    previous["errors"] = []
    previous.setdefault("leagues", {})
    year = dt.datetime.now(UTC).year - (dt.datetime.now(UTC).month < 7)
    season = f"{year}-{str(year+1)[-2:]}"
    files = {"PD": "es.1", "SA": "it.1", "PL": "en.1", "FL1": "fr.1", "DED": "nl.1", "PPL": "pt.1", "BL1": "de.1"}
    requests = [(code, f"https://raw.githubusercontent.com/openfootball/football.json/master/{season}/{file}.json", "CC0-1.0", "OpenFootball") for code, file in files.items()]
    requests += [(code, f"https://api.openligadb.de/getmatchdata/{league}/{year}", "ODbL-1.0", "OpenLigaDB") for code, league in {"PD":"la1", "PL":"pl", "BL1":"bl1"}.items()]
    requests += [("f1", "https://api.jolpi.ca/ergast/f1/current/last/results.json", "", "jolpica-f1")]
    requests += [(code, f"https://site.api.espn.com/apis/site/v2/sports/soccer/{source}/scoreboard", "", "ESPN") for code, source in {"CL": "uefa.champions", "EL": "uefa.europa"}.items()]
    fetched = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(sports_request, request[1]): request for request in requests}
        for future in as_completed(futures):
            request = futures[future]
            try:
                fetched.append((*request, future.result()))
            except Exception as exc:
                previous["errors"].append(f"{request[0]} · {request[3]}: {type(exc).__name__}")
    candidates = {}
    for kind, url, license_, source_name, data in fetched:
        try:
            if kind != "f1":
                matches = normalize_matches(data) if source_name == "OpenLigaDB" else espn_matches(data) if source_name == "ESPN" else openfootball_matches(data)
                if not matches:
                    raise ValueError("Sin partidos")
                latest = max((m["date"][:10] for m in matches if m.get("finished")), default="")
                candidate = {"updated": now_iso(), "source": url, "source_name": source_name, "license": license_, "season": season,
                             "latest_result": latest, "attribution": f"Datos de {source_name}" + (f" · {license_}" if license_ else ""), "matches": recent_matches(matches)}
                if latest >= candidates.get(kind, {}).get("latest_result", ""):
                    candidates[kind] = candidate
            else:
                races = data["MRData"]["RaceTable"]["Races"]
                if not races:
                    raise ValueError("Sin carreras")
                race = races[0]
                rows = [{"position": r["position"], "driver": r["Driver"]["givenName"]+" "+r["Driver"]["familyName"], "constructor": r["Constructor"]["name"], "points": r["points"], "status": r["status"]} for r in race.get("Results", [])]
                previous[kind] = {"updated": now_iso(), "source": url, "race": race["raceName"], "date": race["date"], "season": race["season"], "results": rows}
        except Exception as exc:
            previous["errors"].append(f"{kind} · {source_name}: {type(exc).__name__}")
    for code, candidate in candidates.items():
        old = previous["leagues"].get(code, {})
        if candidate["latest_result"] >= old.get("latest_result", ""):
            previous["leagues"][code] = candidate
    if "BL1" in previous["leagues"]:
        previous["football"] = previous["leagues"]["BL1"]
    if not previous.get("football") and not previous.get("f1") and not previous["leagues"]:
        raise RuntimeError("No se han podido obtener resultados deportivos.")
    write_json(root/"sports.json", previous)
    return previous


def sports_html(data, only=None):
    football, f1 = data.get("football", {}), data.get("f1", {})
    body = '<section id="resultados"><div class="section-heading"><div><p class="eyebrow">RESULTADOS DISPONIBLES</p><h2>La fecha importa.</h2></div><p>Copias periódicas cada dos horas. Consulta otros días en el calendario.</p></div><p><a class="source-link" href="/futbol/">Ligas, Champions y Europa League</a> · <a class="source-link" href="/futbol/selecciones/">Selecciones</a> · <a class="source-link" href="/formula-1/">Fórmula 1</a></p>'
    if only is None:
        body += leagues_html(data)
    if data.get("errors"):
        body += '<p class="editorial-note">Una fuente no ha respondido. Se conserva su último dato con la fecha original.</p>'
    if only is None:
        return body + sports_html(data, "f1") + '</section>'
    body += '<div class="scoreboard"><p class="eyebrow">FÚTBOL · BUNDESLIGA</p><h2>La jornada de la fuente.</h2>'
    body += f'<p class="score-meta">Última consulta correcta: {esc(football.get("updated", "Sin datos"))}</p>'
    for match in football.get("matches", []):
        score = f'{match["home_score"]} – {match["away_score"]}' if match["home_score"] is not None and match["away_score"] is not None else '—'
        body += f'<div class="score-row"><span>{esc(match["home"])}</span><strong>{esc(score)}</strong><span>{esc(match["away"])}</span></div><p class="score-meta">{esc(match_date(match["date"]))} · {"Finalizado" if match["finished"] else "Programado o en curso; consulta la fuente"} · {esc(match["group"])}</p>'
    body += '<a class="source-link" href="https://www.openligadb.de/">Fuente: OpenLigaDB · ODbL 1.0</a></div>'
    if only == "football":
        return body + '<p class="small">Horas de España peninsular cuando la fuente las facilita. <a href="/metodo/">Método y licencia →</a></p></section>'
    if only == "f1":
        body = '<section id="formula-resultados"><p><a class="source-link" href="/futbol/">Resultados de fútbol europeo</a> · <a class="source-link" href="/formula-1/">Resultados de Fórmula 1</a></p>'
    body += '<div class="scoreboard"><p class="eyebrow">FÓRMULA 1</p>'
    body += f'<h2>{esc(f1.get("race", "Última carrera disponible"))}</h2><p class="score-meta">Carrera: {esc(f1.get("date", "Sin datos"))} · Consulta: {esc(f1.get("updated", "Sin datos"))}</p>'
    body += '<table><thead><tr><th scope="col">Pos.</th><th scope="col">Piloto</th><th scope="col">Equipo</th><th scope="col">Puntos</th></tr></thead><tbody>'
    for row in f1.get("results", [])[:10]:
        body += f'<tr><td>{esc(row["position"])}</td><td>{esc(row["driver"])}</td><td>{esc(row["constructor"])}</td><td>{esc(row["points"])}</td></tr>'
    body += '</tbody></table><a class="source-link" href="https://github.com/jolpica/jolpica-f1">Fuente: jolpica-f1</a></div><p class="small">Horas de España peninsular cuando están disponibles. Datos comunitarios que pueden corregirse. <a href="/metodo/">Fuentes y método →</a></p></section>'
    return body


def leagues_html(data, selected=None):
    body = '<div class="league-nav">' + "".join(f'<a href="/futbol/{route}/">{esc(country)} · {esc(name)}</a>' for route, country, name, _ in LEAGUES.values()) + '</div><div id="ligas-data" data-league="'+esc(selected or "all")+'">'
    for code, (route, country, name, _) in LEAGUES.items():
        if selected and selected != code:
            continue
        league = data.get("leagues", {}).get(code, data.get("football", {}) if code == "BL1" else {})
        matches = league.get("matches", [])
        body += f'<div class="scoreboard"><p class="eyebrow">{esc(country)}</p><h2>{esc(name)}</h2>'
        if not matches:
            body += '<p class="score-meta">Resultados pendientes de conectar la fuente. No mostramos marcadores estimados.</p>'
        else:
            latest = league.get("latest_result", "")
            body += f'<p class="score-meta">Consulta correcta: {esc(league.get("updated", ""))} · Último partido finalizado en la fuente: {esc(latest or "Sin fecha")}</p>'
            if latest and latest < (dt.datetime.now(UTC).date()-dt.timedelta(days=7)).isoformat():
                body += '<p class="editorial-note">La fuente lleva más de siete días sin aportar un resultado finalizado. Estos datos pueden estar desactualizados.</p>'
            for match in matches[:12]:
                score = f'{match["home_score"]} – {match["away_score"]}' if match.get("home_score") is not None and match.get("away_score") is not None else '—'
                body += f'<div class="score-row"><span>{esc(match["home"])}</span><strong>{esc(score)}</strong><span>{esc(match["away"])}</span></div><p class="score-meta">{esc(match_date(match.get("date", "")))} · {"Finalizado" if match.get("finished") else "Programado; resultado sin confirmar"} · España peninsular cuando hay hora disponible</p>'
            body += f'<a class="source-link" href="{esc(league.get("source", "https://www.openligadb.de/"))}">{esc(league.get("attribution", "OpenLigaDB · ODbL 1.0"))}</a>'
        body += '</div>'
    return body+'</div>'


def main():
    parser = argparse.ArgumentParser(description="Actualizar y exportar una web de nicho.")
    parser.add_argument("--root", type=Path, default=Path(__file__).parent)
    parser.add_argument("--scan", action="store_true")
    args = parser.parse_args()
    try:
        result = cycle(args.root, do_scan=args.scan)
    except RuntimeError as exc:
        print(json.dumps({"warning": str(exc), "pages": render(args.root)}, ensure_ascii=False))
        return
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
