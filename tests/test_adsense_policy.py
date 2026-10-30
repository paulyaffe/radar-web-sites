import tempfile
import unittest
from pathlib import Path

import engine
from football_content import AD_GUIDE_PATHS, GUIDES, PRIVACY_GUIDE_URL


class FootballPublisherContent(unittest.TestCase):
    def test_ads_only_load_on_complete_authored_guides(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            engine.initialize(root, 'deportes', 'https://example.org')
            config = engine.read_json(root/'site.json')
            config.update(adsense={'publisher_id': 'pub-7901739911277041', 'enabled': True, 'google_cmp_ready': True},
                          analytics={'enabled': True, 'measurement_id': 'G-W3F2HYMSXD'})
            engine.write_json(root/'site.json', config)
            engine.render(root)
            for path in (root/'dist').rglob('*.html'):
                route = '/'+path.relative_to(root/'dist').as_posix().removesuffix('index.html')
                route = '/' if route == '/' else route
                text = path.read_text(encoding='utf-8')
                self.assertEqual('adsbygoogle.js' in text, route in AD_GUIDE_PATHS, route)
                self.assertIn('google-adsense-account', text, route)
                self.assertIn("'analytics_storage': 'denied'", text, route)
                if route in AD_GUIDE_PATHS:
                    self.assertIn('id="privacy-options" hidden', text)
                else:
                    self.assertIn(PRIVACY_GUIDE_URL, text)
            sitemap = (root/'dist/sitemap.xml').read_text(encoding='utf-8')
            for guide in GUIDES:
                route = '/guias/'+guide['id']+'/'
                text = (root/'dist'/route.strip('/')/'index.html').read_text(encoding='utf-8')
                self.assertIn('application/ld+json', text)
                self.assertIn(guide['title'], text)
                self.assertEqual(text.count('<h2>'), len(guide['sections'])+1)
                self.assertIn('https://example.org'+route, sitemap)
                self.assertGreater(len(' '.join(p for _, paragraphs in guide['sections'] for p in paragraphs).split()), 300)
            self.assertIn('/guias/', sitemap)
            self.assertEqual({a['url'] for a in engine.read_json(root/'dist/contenido.json')['articles']}, set(AD_GUIDE_PATHS))
            privacy = (root/'dist/privacidad/index.html').read_text(encoding='utf-8')
            self.assertIn('Los anuncios se reservan a las guías completas', privacy)
            self.assertIn('cambiar o retirar tu consentimiento', privacy)
            routes = engine.read_json(root/'dist/_routes.json')['include']
            for route in ('/', '/partidos/', '/futbol/*', '/api/partidos', '/api/partido'):
                self.assertIn(route, routes)

    def test_an_arbitrary_guide_or_error_cannot_enable_ads(self):
        ads = {'publisher_id': 'pub-7901739911277041', 'enabled': True, 'google_cmp_ready': True}
        for route in ('/', '/partido/', '/equipo/', '/goleadores/', '/404/', '/guias/no-publicada/', '/privacidad/'):
            text = engine.page('deportes', 'https://example.org', route, 'Prueba', 'Descripción', '<p>Contenido</p>', adsense=ads)
            self.assertNotIn('adsbygoogle.js', text, route)


if __name__ == '__main__':
    unittest.main()
