import copy
import tempfile
import unittest
from pathlib import Path
import engine


class CookingNavigation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        engine.initialize(self.root, 'cocina', 'https://cocina-en-gramos-paul.pages.dev')

    def tearDown(self):
        self.temp.cleanup()

    def test_default_page_opens_working_forms_and_recipes_have_their_own_section(self):
        engine.render(self.root)
        home = (self.root/'dist/index.html').read_text(encoding='utf-8')
        recipes = (self.root/'dist/recetas/index.html').read_text(encoding='utf-8')
        nav = home.split('<nav aria-label="Principal">')[1].split('</nav>')[0]
        self.assertEqual(nav.count('<a '), 2)
        self.assertIn('href="/" aria-current="page">Calculadoras', nav)
        self.assertIn('href="/recetas/">Recetas', nav)
        self.assertIn('href="/recetas/" aria-current="page">Recetas', recipes)
        self.assertIn('data-tool="raciones"', home)
        self.assertIn('data-tool="moldes"', home)
        self.assertEqual(home.count('<form '), 2)
        self.assertNotIn('class="hero"', home)
        self.assertNotIn('Una pizca de intuición', home)
        self.assertNotIn('class="trend-strip"', home)
        self.assertNotIn('class="closing"', home)
        self.assertEqual(recipes.count('class="cooking-recipe"'), 3)
        self.assertNotIn('href="/guias/bizcocho/"', recipes)
        self.assertIn('href="/guias/bizcocho/"', home)
        self.assertIn('/assets/cooking.css?v=', home)
        self.assertIn('/recetas/</loc>', (self.root/'dist/sitemap.xml').read_text(encoding='utf-8'))
        for route in ('raciones', 'moldes'):
            self.assertIn('data-tool="'+route+'"', (self.root/'dist/calculadoras'/route/'index.html').read_text(encoding='utf-8'))

    def test_periodic_render_updates_recipe_index_without_exposing_drafts(self):
        catalog = engine.read_json(self.root/'catalog.json')
        catalog['articles'][0]['status'] = 'draft'
        fresh = copy.deepcopy(catalog['articles'][1])
        fresh.update(id='receta-nueva', title='Receta & cantidades', status='published')
        catalog['articles'].append(fresh)
        engine.write_json(self.root/'catalog.json', catalog)
        engine.render(self.root)
        index = (self.root/'dist/recetas/index.html').read_text(encoding='utf-8')
        self.assertNotIn('/recetas/tortitas/', index)
        self.assertIn('/recetas/receta-nueva/', index)
        self.assertIn('Receta &amp; cantidades', index)
        self.assertEqual(engine.read_json(self.root/'catalog.json'), catalog)


if __name__ == '__main__':
    unittest.main()
