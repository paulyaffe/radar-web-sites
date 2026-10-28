import json
import tempfile
import unittest
from pathlib import Path
import engine


class CalendarTests(unittest.TestCase):
    def test_match_date_uses_madrid_and_does_not_invent_missing_time(self):
        self.assertEqual(engine.match_date("2026-10-20T16:45Z"), "20/10/26 18:45")
        self.assertEqual(engine.match_date("2026-12-20T16:45Z"), "20/12/26 17:45")
        self.assertIn("Hora sin confirmar", engine.match_date("2026-10-20"))
        self.assertEqual(engine.match_date("invalid"), "Fecha sin confirmar")

    def test_scheduled_zeros_are_not_a_result(self):
        data = {"events": [{"id": "1", "date": "2026-10-20T18:00Z",
            "status": {"type": {"state": "pre", "completed": False}},
            "competitions": [{"competitors": [
                {"homeAway": "home", "score": "0", "team": {"displayName": "Local"}},
                {"homeAway": "away", "score": "0", "team": {"displayName": "Visitante"}}]}]}]}
        rows = engine.espn_matches(data)
        self.assertIsNone(rows[0]["home_score"])
        data["events"][0]["status"]["type"] = {"state": "post", "completed": True}
        self.assertEqual(engine.espn_matches(data)[0]["home_score"], 0)

    def test_periodic_render_keeps_api_and_new_routes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            engine.initialize(root, "deportes", "https://marcador-claro-paul.pages.dev")
            config = engine.read_json(root/"site.json")
            config["adsense"] = {"publisher_id": "pub-7901739911277041", "enabled": True, "google_cmp_ready": True}
            engine.write_json(root/"site.json", config)
            engine.render(root)
            for route in ("partidos", "futbol/copa-del-rey", "futbol/champions-league", "futbol/europa-league", "futbol/selecciones", "futbol/mls", "futbol/liga-mx", "futbol/liga-uruguaya", "futbol/liga-argentina", "futbol/brasileirao"):
                text = (root/"dist"/route/"index.html").read_text(encoding="utf-8")
                self.assertIn('name="fecha"', text)
                self.assertIn('ca-pub-7901739911277041', text)
                self.assertIn('https://marcador-claro-paul.pages.dev/'+route+'/', text)
                self.assertIn('/assets/calendar.js', text)
            self.assertTrue((root/"dist/_worker.js").is_file())
            self.assertEqual(engine.read_json(root/"dist/_routes.json")["include"], ["/api/partidos", "/api/equipo", "/api/tabla", "/api/banderas", "/api/partido"])
            team = (root/"dist/equipo/index.html").read_text(encoding="utf-8")
            self.assertIn('/assets/team.js', team)
            self.assertIn('noindex,follow', team)
            self.assertNotIn('/equipo/', (root/"dist/sitemap.xml").read_text(encoding="utf-8"))
            self.assertIn("Champions League", (root/"dist/index.html").read_text(encoding="utf-8"))
            home = (root/"dist/index.html").read_text(encoding="utf-8")
            for removed in ('class="hero"', 'ELIGE TU DÍA', '¿Qué partidos se juegan?', 'Fuentes enlazadas', 'Ilustración de un balón'):
                self.assertNotIn(removed, home)
            self.assertIn('class="sports-app"', home)
            self.assertNotIn('href="/tenis/"', home)
            self.assertNotIn('href="/formula-1/"', home)
            for route in ('clasificacion', 'goleadores'):
                page = (root/"dist"/route/"index.html").read_text(encoding="utf-8")
                self.assertIn('/assets/sports-data.js', page)
                self.assertIn('ca-pub-7901739911277041', page)
                self.assertNotIn('<select', page)
                self.assertNotIn('<form', page)
                self.assertNotIn('type="submit"', page)
                self.assertRegex(page, r'/assets/sports-data\.js\?v=[a-f0-9]{12}')
            self.assertIn('google.com', (root/"dist/ads.txt").read_text())
            # Old generated pages must disappear even when dist is reused by the publisher.
            for route in ('tenis', 'formula-1'):
                stale = root/'dist'/route/'index.html'
                stale.parent.mkdir(parents=True, exist_ok=True)
                stale.write_text('old non-football page')
            engine.render(root)
            self.assertTrue((root/"dist/_worker.js").is_file())
            for route in ('tenis', 'formula-1'):
                self.assertFalse((root/'dist'/route/'index.html').exists())
                self.assertNotIn('/'+route+'/', (root/'dist/sitemap.xml').read_text())
                self.assertIn('/'+route+'/* /futbol/ 301', (root/'dist/_redirects').read_text())
            for code in ('CDR','MLS','MEX','URU','ARG','BRA'):
                self.assertIn('value="'+code+'"', home)
                self.assertIn('href="/futbol/'+engine.LEAGUES[code][0]+'/"', (root/'dist/goleadores/index.html').read_text(encoding='utf-8'))
            cup = (root/'dist/futbol/copa-del-rey/index.html').read_text(encoding='utf-8')
            self.assertIn('class="quick-competitions"', cup)
            self.assertIn('class="sport-title">Copa del Rey</h1>', cup)
            self.assertIn('value="CDR" data-group="clubes" selected', cup)
            self.assertIn('href="/futbol/copa-del-rey/" aria-current="page"', cup)

    def test_team_links_preserve_names_and_do_not_accept_html(self):
        link = engine.football_team('A & B <script>', 'PD')
        self.assertIn('/equipo/?', link)
        self.assertIn('nombre=A+%26+B+%3Cscript%3E', link)
        self.assertNotIn('<script>', link)
        link = engine.football_team('Real Madrid', 'PD', '86')
        self.assertIn('id=86', link)
        self.assertNotIn('nombre=', link)

    def test_operational_generator_has_the_same_calendar_code(self):
        root = Path(engine.__file__).parent
        if (root/"cloudflare").is_dir():
            self.assertEqual((root/"calendar_worker.mjs").read_bytes(), (root/"cloudflare/calendar_worker.mjs").read_bytes())
            self.assertEqual((root/"engine.py").read_bytes(), (root/"cloudflare/engine.py").read_bytes())
        else:
            self.assertTrue((root/"calendar_worker.mjs").is_file())


if __name__ == "__main__":
    unittest.main()
