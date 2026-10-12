import json
import math
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import engine


class Calculations(unittest.TestCase):
    def test_dough_conserves_mass(self):
        for pieces, weight, hydration in [(4, 250, 65), (1, 700, 70), (9, 150, 90)]:
            result = engine.dough(pieces, weight, hydration)
            self.assertAlmostEqual(sum(result.values()), pieces*weight)
            self.assertAlmostEqual(result["Agua"]/result["Harina"]*100, hydration)

    def test_starter_counts_both_components(self):
        result = engine.starter(500, 70, 20, 100)
        self.assertEqual(result, {"Harina por añadir": 400, "Agua por añadir": 250, "Masa madre": 200})
        with self.assertRaises(ValueError):
            engine.starter(500, 10, 90, 100)

    def test_energy_units_and_cost(self):
        result = engine.power_cost(100, 8, 30, .2)
        self.assertEqual(result["kwh"], 24)
        self.assertAlmostEqual(result["cost"], 4.8)
        result = engine.power_cost(40, 24, 30, .2)
        self.assertAlmostEqual(result["kwh"], 28.8)
        self.assertAlmostEqual(result["cost"], 5.76)

    def test_bad_numbers(self):
        for value in (-1, math.nan, math.inf, 100001):
            with self.assertRaises(ValueError):
                engine.power_cost(value)
        with self.assertRaises(ValueError):
            engine.dough(1.5)
        with self.assertRaises(ValueError):
            engine.power_cost(hours=25)


class Feeds(unittest.TestCase):
    def test_search_and_news_not_confused(self):
        feed = b'<rss xmlns:ht="https://trends.google.com/trending/rss"><channel><item><title>pizza</title><ht:approx_traffic>5K+</ht:approx_traffic><link>https://example.org/pizza</link></item></channel></rss>'
        data = engine.parse_feed(feed, "Google Trends")
        rows = engine.rank(data, "masa")
        self.assertEqual(rows[0]["searches_lower_bound"], 5000)
        data = engine.parse_feed(feed.replace(b'<ht:approx_traffic>5K+</ht:approx_traffic>', b''), "Google News")
        row = engine.rank(data+data, "masa")[0]
        self.assertIsNone(row["searches_lower_bound"])
        self.assertEqual(row["news_count"], 1)

    def test_reject_entities_and_unsafe_links(self):
        with self.assertRaises(ValueError):
            engine.parse_feed(b'<!DOCTYPE rss><rss/>', "Google News")
        items = engine.parse_feed(b'<rss><channel><item><title>pizza</title><link>javascript:alert(1)</link></item></channel></rss>', "Google News")
        self.assertEqual(items[0]["url"], "")

    def test_pending_match_no_fake_zero(self):
        rows = engine.normalize_matches([{"matchID": 1, "team1": {"teamName": "A"}, "team2": {"teamName": "B"}, "matchResults": [], "matchIsFinished": False}])
        self.assertIsNone(rows[0]["home_score"])
        self.assertFalse(rows[0]["finished"])

    def test_final_result_preferred(self):
        rows = engine.normalize_matches([{"matchID": 1, "team1": {"teamName": "A"}, "team2": {"teamName": "B"}, "matchResults": [{"resultTypeID": 2, "pointsTeam1": 3, "pointsTeam2": 1}, {"resultTypeID": 1, "pointsTeam1": 0, "pointsTeam2": 0}], "matchIsFinished": True}])
        self.assertEqual(rows[0]["home_score"], 3)


class Publishing(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        engine.initialize(self.root, "masa", "https://example.org")

    def tearDown(self):
        self.temp.cleanup()

    def test_trend_generation_is_capped_and_idempotent(self):
        ranking = {"updated": engine.now_iso(), "ranking": [{"topic": "hidratacion", "score": 25, "searches_lower_bound": None, "news_count": 3}, {"topic": "focaccia", "score": 20, "searches_lower_bound": 1000, "news_count": 1}], "errors": []}
        with patch.object(engine, "scan", return_value=ranking):
            first = engine.cycle(self.root)
            second = engine.cycle(self.root)
        self.assertEqual(first["added"], ["hidratacion"])
        self.assertEqual(second["added"], [])

    def test_unpublishing_removes_previous_output(self):
        engine.render(self.root)
        path = self.root/"dist/guias/pizza/index.html"
        self.assertTrue(path.exists())
        catalog = engine.read_json(self.root/"catalog.json")
        next(a for a in catalog["articles"] if a["id"] == "pizza")["status"] = "draft"
        engine.write_json(self.root/"catalog.json", catalog)
        engine.render(self.root)
        self.assertFalse(path.exists())
        self.assertNotIn("/guias/pizza/", (self.root/"dist/sitemap.xml").read_text())

    def test_escape_and_no_unconfigured_advertising(self):
        catalog = engine.read_json(self.root/"catalog.json")
        catalog["articles"][0]["title"] = '<script>alert("x")</script>'
        engine.write_json(self.root/"catalog.json", catalog)
        engine.render(self.root)
        text = (self.root/"dist/index.html").read_text(encoding="utf-8")
        self.assertIn("&lt;script&gt;", text)
        self.assertNotIn('alert("x")</script>', text)
        self.assertNotIn("pagead2.googlesyndication", text)

    def test_adsense_verification_without_ad_serving(self):
        config = engine.read_json(self.root/"site.json")
        config["adsense"] = {"publisher_id": "pub-1234567890123456", "enabled": False}
        engine.write_json(self.root/"site.json", config)
        engine.render(self.root)
        text = (self.root/"dist/index.html").read_text(encoding="utf-8")
        self.assertIn('content="ca-pub-1234567890123456"', text)
        self.assertNotIn("adsbygoogle.js", text)
        self.assertIn("pub-1234567890123456", (self.root/"dist/ads.txt").read_text())
        config["adsense"]["enabled"] = True
        engine.write_json(self.root/"site.json", config)
        with self.assertRaises(ValueError):
            engine.render(self.root)

    def test_consent_confirmation_alone_does_not_start_ads(self):
        config = engine.read_json(self.root/"site.json")
        config["adsense"] = {"publisher_id": "pub-1234567890123456", "enabled": False, "google_cmp_ready": True}
        engine.write_json(self.root/"site.json", config)
        engine.render(self.root)
        text = (self.root/"dist/index.html").read_text(encoding="utf-8")
        self.assertNotIn("adsbygoogle.js", text)
        self.assertNotIn("/assets/consent.js", text)

    def test_ad_integration_can_be_installed_while_google_reviews_the_site(self):
        config = engine.read_json(self.root/"site.json")
        config["adsense"] = {"publisher_id": "pub-1234567890123456", "enabled": True,
                             "google_cmp_ready": True, "approval_confirmed": False}
        engine.write_json(self.root/"site.json", config)
        engine.render(self.root)
        text = (self.root/"dist/index.html").read_text(encoding="utf-8")
        self.assertIn("adsbygoogle.js?client=ca-pub-1234567890123456", text)
        self.assertIn('<script src="/assets/consent.js" defer></script>', text)
        self.assertIn('id="privacy-options" hidden', text)
        privacy = (self.root/"dist/privacidad/index.html").read_text(encoding="utf-8")
        self.assertIn("cambiar o retirar tu consentimiento", privacy)

    def test_failed_sport_source_keeps_old_date(self):
        previous = {"football": {"updated": "2026-01-01T00:00:00+00:00", "matches": []}}
        engine.write_json(self.root/"sports.json", previous)
        with patch.object(engine, "sports_request", side_effect=TimeoutError):
            result = engine.update_sports(self.root)
        self.assertEqual(result["football"]["updated"], previous["football"]["updated"])
        self.assertEqual(len(result["errors"]), 11)

    def test_openfootball_score_formats_and_unconfirmed_matches(self):
        matches = engine.openfootball_matches({"matches": [
            {"team1": "A", "team2": "B", "date": "2026-10-01", "score": [2, 1]},
            {"team1": "C", "team2": "D", "date": "2026-10-02", "score": {"ft": [0, 0]}},
            {"team1": "E", "team2": "F", "date": "2026-10-03"}]})
        self.assertEqual([m["finished"] for m in matches], [True, True, False])
        self.assertEqual(matches[1]["home_score"], 0)
        self.assertIsNone(matches[2]["home_score"])

    def test_sport_freshness_does_not_disguise_old_results(self):
        data = {"leagues": {"SA": {"updated": engine.now_iso(), "latest_result": "2025-01-01", "matches": [{"home":"A", "away":"B", "date":"2025-01-01", "home_score":1, "away_score":0, "finished":True}], "source":"https://github.com/openfootball", "attribution":"OpenFootball · CC0"}}}
        text = engine.leagues_html(data, "SA")
        self.assertIn("desactualizados", text)
        self.assertIn("2025-01-01", text)
        self.assertNotIn("football-data.org", text)


if __name__ == "__main__":
    unittest.main()
