import asyncio
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "rota_segura_test")
os.environ.setdefault("JWT_SECRET", "unit-test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server


class AlertStatisticsTests(unittest.TestCase):
    def test_statistics_route_and_filters_are_registered(self):
        operation = server.app.openapi()["paths"]["/api/alerts/statistics"]["get"]
        self.assertEqual({"days", "category", "neighborhood", "locality", "region", "granularity"}, {item["name"] for item in operation["parameters"]})

    def test_normalize_location_collapses_whitespace_and_ignores_empty(self):
        self.assertEqual(server.normalize_location("  Jardim   das Flores "), "Jardim Das Flores")
        self.assertIsNone(server.normalize_location(" \t "))
        self.assertIsNone(server.normalize_location(None))


    def test_normalize_location_rejects_personal_or_vehicle_identifiers(self):
        for value in ("Rua da Placa ABC1D23", "Rua (11) 98765-4321"):
            with self.subTest(value=value), self.assertRaises(HTTPException) as error:
                server.normalize_location(value)
            self.assertEqual(error.exception.status_code, 400)

    def test_public_map_alerts_only_include_coarse_area_labels(self):
        alert = server.public_alert({
            "id": "alert-id", "category": "assalto", "description": "Relato aprovado",
            "lat": -12.971, "lng": -38.501, "status": "aprovado", "created_at": "2026-11-16T12:00:00+00:00",
            "confirmations": 0, "reporter_id": "private-user", "neighborhood": "Centro",
            "street": "Rua Residencial", "locality": "Salvador", "region": "Bahia",
        }, "other-user")

        self.assertEqual(alert["neighborhood"], "Centro")
        self.assertEqual(alert["locality"], "Salvador")
        self.assertEqual(alert["region"], "Bahia")
        self.assertNotIn("street", alert)
        self.assertNotIn("reporter_id", alert)


    def test_alert_statistics_builds_response_from_database_aggregates(self):
        captured = {}
        facet = [{
            "categories": [{"_id": "acidente", "total": 3}],
            "neighborhoods": [{"_id": {"neighborhood": "Centro", "category": "acidente"}, "total": 3}],
            "neighborhoodOptions": [{"_id": "Centro", "total": 3}],
            "localities": [{"_id": {"locality": "Salvador", "region": "Bahia", "category": "acidente"}, "total": 3}],
            "localityOptions": [{"_id": "Salvador", "total": 3}],
            "regions": [{"_id": {"region": "Bahia", "category": "acidente"}, "total": 3}],
            "regionOptions": [{"_id": "Bahia", "total": 3}],
            "streets": [{"_id": {"street": "Rua 1", "neighborhood": "Centro", "locality": "Salvador", "region": "Bahia"}, "total": 3, "contributors": 3}],
            "timeline": [{"_id": {"period": "2026-11-16", "category": "acidente"}, "total": 3}],
        }]

        class Cursor:
            async def to_list(self, length):
                return facet

        class Alerts:
            def aggregate(self, pipeline):
                captured["pipeline"] = pipeline
                return Cursor()

            async def count_documents(self, query):
                captured["query"] = query
                return 3

        with patch.object(server, "db", SimpleNamespace(alerts=Alerts())):
            result = asyncio.run(server.alert_statistics(
                days=90, category="acidente", neighborhood="Centro", locality="Salvador", region="Bahia",
                granularity="week", _={"id": "test-user"}
            ))

        self.assertEqual(result["total"], 3)
        self.assertEqual((result["days"], result["granularity"]), (90, "week"))
        self.assertEqual(result["categories"], [{"category": "acidente", "total": 3}])
        self.assertEqual(result["neighborhoods"], [{"neighborhood": "Centro", "total": 3, "categories": {"acidente": 3}}])
        self.assertEqual(result["neighborhoodOptions"], [{"neighborhood": "Centro", "total": 3}])
        self.assertEqual(result["localities"][0]["locality"], "Salvador")
        self.assertEqual(result["regions"][0]["region"], "Bahia")
        self.assertEqual(result["streets"][0]["street"], "Rua 1")
        self.assertEqual(result["timeline"][0], {"period": "2026-11-16", "category": "acidente", "total": 3})
        self.assertEqual(captured["query"]["status"], "aprovado")
        self.assertEqual(captured["query"]["category"], "acidente")
        self.assertEqual(captured["query"]["neighborhood"]["$regex"], "^Centro$")
        self.assertEqual(captured["query"]["locality"]["$regex"], "^Salvador$")
        self.assertEqual(captured["query"]["region"]["$regex"], "^Bahia$")
        facet = captured["pipeline"][1]["$facet"]
        self.assertNotIn("neighborhood", captured["pipeline"][0]["$match"])
        self.assertIn("$match", facet["neighborhoods"][0])
        self.assertEqual(facet["neighborhoodOptions"][1], {"$match": {"neighborhood": {"$type": "string", "$ne": ""}}})
        self.assertEqual(facet["streets"][4], {"$match": {"total": {"$gte": 3}, "contributors": {"$gte": 3}}})


    def test_create_alert_stores_optional_locality_for_later_aggregation(self):
        saved = {}

        class Alerts:
            async def count_documents(self, query):
                return 0

            async def insert_one(self, row):
                saved.update(row)

        with patch.object(server, "db", SimpleNamespace(alerts=Alerts())):
            result = asyncio.run(server.create_alert(
                server.AlertIn(category="assalto", description="TEST relato válido para localização", lat=-12.9714, lng=-38.5014,
                               neighborhood=" Centro  Histórico ", street="Rua 1", locality="Salvador", region="Bahia"),
                {"id": "test-user"},
            ))

        self.assertEqual(result["status"], "pendente")
        self.assertEqual(saved["neighborhood"], "Centro Histórico")
        self.assertEqual(saved["street"], "Rua 1")
        self.assertEqual(saved["locality"], "Salvador")
        self.assertEqual(saved["region"], "Bahia")
        self.assertEqual(saved["status"], "pendente")

    def test_reverse_geocode_uses_rounded_coordinates_and_requires_confirmation(self):
        nominatim_result = {
            "address": {
                "neighbourhood": "Centro Histórico", "road": "Rua 1", "city": "Salvador", "state": "Bahia",
                "house_number": "123", "postcode": "40000-000",
            },
            "display_name": "123, Rua 1, Centro Histórico, Salvador",
        }
        with patch.object(server, "nominatim_request", new=AsyncMock(return_value=nominatim_result)) as request:
            result = asyncio.run(server.reverse_geocode_location(
                server.ReverseGeocodeIn(lat=-12.9714, lng=-38.5014), {"id": "test-user"}
            ))

        self.assertEqual(request.await_args.args[0], "/reverse")
        self.assertEqual(request.await_args.args[1]["lat"], -12.971)
        self.assertEqual(request.await_args.args[1]["lon"], -38.501)
        self.assertEqual(result["neighborhood"], "Centro Histórico")
        self.assertEqual(result["locality"], "Salvador")
        self.assertEqual(result["region"], "Bahia")
        self.assertTrue(result["needs_confirmation"])
        self.assertNotIn("house_number", result)
        self.assertNotIn("display_name", result)
