import json
import tempfile
import unittest
from pathlib import Path

import engine


class MatchPages(unittest.TestCase):
    def test_periodic_render_keeps_match_route_assets_privacy_and_api(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            engine.initialize(root, 'deportes', 'https://marcador-claro-paul.pages.dev')
            config = engine.read_json(root/'site.json')
            config.update(adsense={'publisher_id': 'pub-7901739911277041', 'enabled': True, 'google_cmp_ready': True},
                          analytics={'measurement_id': 'G-W3F2HYMSXD', 'enabled': True})
            engine.write_json(root/'site.json', config)
            engine.render(root)
            engine.render(root)
            text = (root/'dist/partido/index.html').read_text(encoding='utf-8')
            self.assertIn('data-match-detail', text)
            self.assertIn('noindex,follow', text)
            self.assertRegex(text, r'/assets/match\.js\?v=[a-f0-9]{12}')
            self.assertIn('gtag/js?id=G-W3F2HYMSXD', text)
            self.assertIn('/assets/consent.js', text)
            self.assertNotIn('/partido/', (root/'dist/sitemap.xml').read_text(encoding='utf-8'))
            self.assertIn('/api/partido', engine.read_json(root/'dist/_routes.json')['include'])
            for path in ('index.html', 'equipo/index.html', 'futbol/champions-league/index.html'):
                page = (root/'dist'/path).read_text(encoding='utf-8')
                self.assertIn('/assets/match-ui.js?v=', page)
                self.assertIn('/assets/match.css?v=', page)
            page = (root/'dist/index.html').read_text(encoding='utf-8')
            self.assertLess(page.index('/assets/match-ui.js?v='), page.index('/assets/calendar.js?v='))
            for name in ('match.js', 'match-ui.js', 'match.css'):
                self.assertTrue((root/'dist/assets'/name).is_file())

    def test_periodic_scoreboard_copy_keeps_goals_and_not_assistants(self):
        data = json.loads((Path(__file__).parent/'fixtures/match-real.json').read_text(encoding='utf-8'))
        header = data['header']
        event = {**header, 'date': header['competitions'][0]['date'], 'status': header['competitions'][0]['status']}
        match = engine.espn_matches({'events': [event]})[0]
        self.assertEqual((match['home_score'], match['away_score']), (4, 1))
        self.assertEqual([g['name'] for g in match['goals']], ['B. Silva', 'A. Güler', 'K. Mbappé', 'T. Gomis', 'Y. Diomande'])
        self.assertEqual(match['goals'][2]['minute'], '83′')
        event['status'] = {'type': {'state': 'pre', 'completed': False}}
        match = engine.espn_matches({'events': [event]})[0]
        self.assertEqual(match['goals'], [])
        self.assertIsNone(match['home_score'])


if __name__ == '__main__':
    unittest.main()
