import tempfile
import unittest
from pathlib import Path

import engine


ADS = {"publisher_id": "pub-7901739911277041", "enabled": True, "google_cmp_ready": True}
ANALYTICS = {"enabled": True, "measurement_id": "G-W3F2HYMSXD"}


class Analytics(unittest.TestCase):
    def test_all_four_sites_and_every_generated_page_have_one_tag(self):
        with tempfile.TemporaryDirectory() as folder:
            for profile in ("cocina", "masa", "energia", "deportes"):
                with self.subTest(profile=profile):
                    root = Path(folder)/profile
                    engine.initialize(root, profile, "https://example.org")
                    config = engine.read_json(root/"site.json")
                    config.update(adsense=ADS, analytics=ANALYTICS)
                    engine.write_json(root/"site.json", config)
                    engine.render(root)
                    pages = list((root/"dist").rglob("*.html"))
                    self.assertGreater(len(pages), 5)
                    for page in pages:
                        text = page.read_text(encoding="utf-8")
                        self.assertEqual(text.count("googletagmanager.com/gtag/js?id=G-W3F2HYMSXD"), 1, page)
                        self.assertEqual(text.count("gtag('config', 'G-W3F2HYMSXD')"), 1, page)
                        self.assertLess(text.index("gtag('consent', 'default'"), text.index("googletagmanager.com/gtag/js"))
                        self.assertLess(text.index("gtag('consent', 'default'"), text.index("adsbygoogle.js"))
                        self.assertIn("/assets/consent.js", text)
                    privacy = (root/"dist/privacidad/index.html").read_text(encoding="utf-8")
                    self.assertIn("Google Analytics 4", privacy)
                    self.assertIn("sin cookies de analítica", privacy)
                    self.assertIn("No enviamos a Analytics los valores", privacy)
                    self.assertIn("cambiar o retirar tu consentimiento", privacy)

    def test_opt_in_configuration_is_required(self):
        for config in (None, {}, {"enabled": False, "measurement_id": "G-W3F2HYMSXD"}):
            self.assertEqual(engine.analytics_tags(config, ADS), "")
        with self.assertRaises(ValueError):
            engine.analytics_tags({"enabled": True}, ADS)
        with self.assertRaises(ValueError):
            engine.analytics_tags(ANALYTICS, {})
        with self.assertRaises(ValueError):
            engine.analytics_tags(ANALYTICS, {**ADS, "google_cmp_ready": False})

    def test_measurement_id_cannot_inject_markup(self):
        for identity in ("UA-1234-1", "G-", "G-abc123", "G-ABC123'</script><script>alert(1)</script>"):
            with self.subTest(identity=identity), self.assertRaises(ValueError):
                engine.analytics_tags({"enabled": True, "measurement_id": identity}, ADS)


if __name__ == "__main__":
    unittest.main()
