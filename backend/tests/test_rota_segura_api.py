# ROTA SEGURA backend regression tests (auth, profile, contacts, SOS, share, alerts, admin, privacy, plans)
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "admin@rotasegura.com.br", "password": "RotaSegura@2026"}
# Salvador, Bahia — default SOS fixture for location regression coverage.
LAT, LNG = -12.9714, -38.5014


def reg(prefix="TEST_u"):
    email = f"{prefix.lower()}_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"name": "TEST Motorista", "email": email, "password": "senha12345",
                                                    "phone": "11999990000", "driver_type": "aplicativo", "lgpd_consent": True})
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "token": d["token"], "user": d["user"], "h": {"Authorization": f"Bearer {d['token']}"}}


@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def u1():
    u = reg()
    yield u
    requests.delete(f"{API}/privacy/account", headers=u["h"])


@pytest.fixture(scope="module")
def u2():
    u = reg()
    yield u
    requests.delete(f"{API}/privacy/account", headers=u["h"])


# --- Auth
class TestAuth:
    def test_register_requires_consent(self):
        r = requests.post(f"{API}/auth/register", json={"name": "TEST x", "email": f"test_{uuid.uuid4().hex[:6]}@example.com",
                                                        "password": "senha12345", "lgpd_consent": False})
        assert r.status_code == 400

    def test_register_duplicate(self, u1):
        r = requests.post(f"{API}/auth/register", json={"name": "TEST x", "email": u1["email"], "password": "senha12345", "lgpd_consent": True})
        assert r.status_code == 409

    def test_me_and_profile(self, u1):
        r = requests.get(f"{API}/auth/me", headers=u1["h"])
        assert r.status_code == 200 and r.json()["email"] == u1["email"] and r.json()["plan"] == "gratuito"
        assert "password_hash" not in r.json()
        r = requests.put(f"{API}/profile", headers=u1["h"], json={"name": "TEST Novo", "phone": "11988887777", "driver_type": "taxi",
                                                                   "vehicle": "Onix", "city": "São Paulo"})
        assert r.status_code == 200
        me = requests.get(f"{API}/auth/me", headers=u1["h"]).json()
        assert me["name"] == "TEST Novo" and me["driver_type"] == "taxi" and me["city"] == "São Paulo"

    def test_me_unauth(self):
        assert requests.get(f"{API}/auth/me").status_code == 401

    def test_login_lockout(self):
        u = reg("TEST_lock")
        codes = [requests.post(f"{API}/auth/login", json={"email": u["email"], "password": "errada123"}).status_code for _ in range(5)]
        assert codes == [401] * 5
        r = requests.post(f"{API}/auth/login", json={"email": u["email"], "password": "senha12345"})
        assert r.status_code == 429, r.text
        requests.delete(f"{API}/privacy/account", headers=u["h"])

    def test_login_ok(self, u1):
        r = requests.post(f"{API}/auth/login", json={"email": u1["email"].upper(), "password": "senha12345"})
        assert r.status_code == 200 and "token" in r.json()


# --- Contacts
class TestContacts:
    def test_crud_and_limit(self, u1):
        ids = []
        for i in range(3):
            r = requests.post(f"{API}/contacts", headers=u1["h"], json={"name": f"TEST C{i}", "phone": "11999998888",
                                                                       "email": "delivered@resend.dev", "relation": "irmão"})
            assert r.status_code == 200, r.text
            assert "_id" not in r.json()
            ids.append(r.json()["id"])
        r = requests.post(f"{API}/contacts", headers=u1["h"], json={"name": "TEST C4", "phone": "11999998888"})
        assert r.status_code == 403
        r = requests.put(f"{API}/contacts/{ids[0]}", headers=u1["h"], json={"name": "TEST Edit", "phone": "11911112222",
                                                                           "email": "delivered@resend.dev"})
        assert r.status_code == 200
        lst = requests.get(f"{API}/contacts", headers=u1["h"]).json()
        assert lst["limit"] == 3 and len(lst["items"]) == 3
        assert any(c["name"] == "TEST Edit" for c in lst["items"])
        # Delete two, keep one with email for SOS
        for cid in ids[1:]:
            assert requests.delete(f"{API}/contacts/{cid}", headers=u1["h"]).status_code == 200
        assert len(requests.get(f"{API}/contacts", headers=u1["h"]).json()["items"]) == 1

    def test_edit_other_users_contact_404(self, u1, u2):
        cid = requests.get(f"{API}/contacts", headers=u1["h"]).json()["items"][0]["id"]
        r = requests.put(f"{API}/contacts/{cid}", headers=u2["h"], json={"name": "hack", "phone": "11911112222"})
        assert r.status_code == 404


# --- SOS
class TestSOS:
    def test_sos_flow_email(self, u1):
        r = requests.post(f"{API}/sos", headers=u1["h"], json={"lat": LAT, "lng": LNG, "accuracy": 10})
        assert r.status_code == 200 and r.json()["status"] == "aberto"
        iid = r.json()["id"]
        assert requests.post(f"{API}/sos/{iid}/action", headers=u1["h"], json={"action": "whatsapp"}).status_code == 200
        assert requests.post(f"{API}/sos/{iid}/action", headers=u1["h"], json={"action": "bogus"}).status_code == 422
        r = requests.post(f"{API}/sos/{iid}/email", headers=u1["h"], timeout=30)
        print("email:", r.status_code, r.text)
        assert r.status_code == 200 and r.json()["sent"] >= 1
        r = requests.post(f"{API}/sos/{iid}/email", headers=u1["h"])
        assert r.status_code == 409
        assert requests.post(f"{API}/sos/{iid}/action", headers=u1["h"], json={"action": "resolvido"}).status_code == 200
        inc = requests.get(f"{API}/incidents", headers=u1["h"]).json()
        s = [x for x in inc["sos"] if x["id"] == iid][0]
        assert s["status"] == "resolvido" and {a["action"] for a in s["actions"]} >= {"whatsapp", "email", "resolvido"}

    def test_sos_email_no_contacts(self, u2):
        iid = requests.post(f"{API}/sos", headers=u2["h"], json={}).json()["id"]
        assert requests.post(f"{API}/sos/{iid}/email", headers=u2["h"]).status_code == 400

    def test_sos_other_user_404(self, u1, u2):
        iid = requests.post(f"{API}/sos", headers=u1["h"], json={}).json()["id"]
        assert requests.post(f"{API}/sos/{iid}/action", headers=u2["h"], json={"action": "sms"}).status_code == 404


# --- Suggestions and authority configuration
class TestFeedback:
    def test_submit_and_admin_visibility(self, u1, admin):
        response = requests.post(f"{API}/feedback", headers=u1["h"], json={
            "category": "sugestao", "message": "TEST melhorar aviso de localização"
        })
        assert response.status_code == 201, response.text
        item_id = response.json()["id"]
        items = requests.get(f"{API}/admin/feedback", headers=admin)
        assert items.status_code == 200
        item = next(x for x in items.json() if x["id"] == item_id)
        assert item["category"] == "sugestao" and item["message"].startswith("TEST ")
        assert "user_id" not in item

    def test_feedback_requires_authentication(self):
        response = requests.post(f"{API}/feedback", json={"category": "problema", "message": "TEST erro"})
        assert response.status_code == 401


class TestAuthorities:
    def test_authority_keyword_is_private_and_editable(self, admin):
        response = requests.post(f"{API}/admin/authorities", headers=admin, json={
            "name": "TEST Defesa Civil", "keyword": "palavra de teste"
        })
        assert response.status_code == 201, response.text
        authority_id = response.json()["id"]
        try:
            listed = requests.get(f"{API}/admin/authorities", headers=admin)
            assert listed.status_code == 200
            item = next(x for x in listed.json() if x["id"] == authority_id)
            assert item["name"] == "TEST Defesa Civil"
            assert "keyword" not in item and "keyword_hash" not in item
            updated = requests.put(f"{API}/admin/authorities/{authority_id}", headers=admin, json={
                "name": "TEST Defesa Civil", "keyword": "nova palavra"
            })
            assert updated.status_code == 200, updated.text
        finally:
            requests.delete(f"{API}/admin/authorities/{authority_id}", headers=admin)


# --- Share
class TestShare:
    def test_share_flow(self, u1):
        r = requests.post(f"{API}/share", headers=u1["h"], json={"lat": LAT, "lng": LNG, "hours": 8})
        assert r.status_code == 200
        s = r.json()
        act = requests.get(f"{API}/share/active", headers=u1["h"]).json()
        assert act["id"] == s["id"]
        assert requests.put(f"{API}/share/{s['id']}/location", headers=u1["h"], json={"lat": -23.56, "lng": -46.64}).status_code == 200
        page = requests.get(f"{API}/public/share/{s['token']}")
        assert page.status_code == 200 and "-23.56" in page.text and "TEST" in page.text
        assert requests.delete(f"{API}/share/{s['id']}", headers=u1["h"]).status_code == 200
        assert requests.get(f"{API}/share/active", headers=u1["h"]).json() == {}
        assert "encerrado" in requests.get(f"{API}/public/share/{s['token']}").text
        assert requests.put(f"{API}/share/{s['id']}/location", headers=u1["h"], json={"lat": 1, "lng": 1}).status_code == 410


# --- Alerts + moderation
class TestAlerts:
    @pytest.mark.parametrize("text", ["Carro placa ABC1D23 rondando a área", "CPF 123.456.789-09 suspeito aqui",
                                      "Ligue (11) 98765-4321 para saber", "Tem um bandido na esquina da rua"])
    def test_content_filter(self, u1, text):
        r = requests.post(f"{API}/alerts", headers=u1["h"], json={"category": "assalto", "description": text, "lat": LAT, "lng": LNG})
        assert r.status_code == 400, r.text

    def test_moderation_flow(self, u1, u2, admin):
        r = requests.post(f"{API}/alerts", headers=u1["h"], json={"category": "via_perigosa", "description": "TEST Buraco grande na via",
                                                                  "lat": LAT, "lng": LNG})
        assert r.status_code == 200 and r.json()["status"] == "pendente"
        aid = r.json()["id"]
        assert aid not in [a["id"] for a in requests.get(f"{API}/alerts", headers=u2["h"]).json()]
        pend = requests.get(f"{API}/admin/alerts", headers=admin).json()
        assert aid in [a["id"] for a in pend]
        assert requests.post(f"{API}/admin/alerts/{aid}/moderate", headers=admin, json={"decision": "aprovado"}).status_code == 200
        lst = requests.get(f"{API}/alerts?category=via_perigosa", headers=u2["h"]).json()
        a = [x for x in lst if x["id"] == aid][0]
        assert a["lat"] == round(LAT, 3) and "reporter_id" not in a
        n = requests.get(f"{API}/notifications", headers=u1["h"]).json()
        assert any("publicado" in i["title"] for i in n["items"])
        # confirm: own -> 409, other -> 200, twice -> 409
        assert requests.post(f"{API}/alerts/{aid}/confirm", headers=u1["h"]).status_code == 409
        assert requests.post(f"{API}/alerts/{aid}/confirm", headers=u2["h"]).status_code == 200
        assert requests.post(f"{API}/alerts/{aid}/confirm", headers=u2["h"]).status_code == 409
        # 3 flags -> pendente
        u3 = reg()
        try:
            for h in (u2["h"], u3["h"], admin):
                assert requests.post(f"{API}/alerts/{aid}/flag", headers=h, json={"reason": "falso"}).status_code == 200
            assert aid not in [x["id"] for x in requests.get(f"{API}/alerts", headers=u2["h"]).json()]
            assert requests.post(f"{API}/admin/alerts/{aid}/moderate", headers=admin, json={"decision": "rejeitado", "reason": "TEST"}).status_code == 200
        finally:
            requests.delete(f"{API}/privacy/account", headers=u3["h"])
        assert requests.post(f"{API}/notifications/read", headers=u1["h"]).status_code == 200
        assert requests.get(f"{API}/notifications", headers=u1["h"]).json()["unread"] == 0


# --- Admin
class TestAdmin:
    def test_forbidden_for_user(self, u1):
        for m, p in (("get", "/admin/stats"), ("get", "/admin/users"), ("get", "/admin/alerts")):
            assert getattr(requests, m)(f"{API}{p}", headers=u1["h"]).status_code == 403
        assert requests.put(f"{API}/admin/plans/premium_mensal", headers=u1["h"], json={"price_cents": 1, "name": "x1"}).status_code == 403

    def test_stats_users_block(self, admin):
        st = requests.get(f"{API}/admin/stats", headers=admin).json()
        assert {"usuarios", "premium", "alertas_pendentes", "sos_total"} <= set(st)
        u = reg("TEST_block")
        users = requests.get(f"{API}/admin/users", headers=admin).json()
        assert any(x["id"] == u["user"]["id"] for x in users) and all("password_hash" not in x for x in users)
        assert requests.post(f"{API}/admin/users/{u['user']['id']}/block", headers=admin, json={"blocked": True}).status_code == 200
        assert requests.get(f"{API}/auth/me", headers=u["h"]).status_code == 403
        assert requests.post(f"{API}/auth/login", json={"email": u["email"], "password": "senha12345"}).status_code == 403
        requests.post(f"{API}/admin/users/{u['user']['id']}/block", headers=admin, json={"blocked": False})
        requests.delete(f"{API}/privacy/account", headers=u["h"])

    def test_plan_edit(self, admin):
        plans = requests.get(f"{API}/plans").json()
        assert [p["id"] for p in plans] == ["gratuito", "premium_mensal", "premium_anual"]
        pm = [p for p in plans if p["id"] == "premium_mensal"][0]
        assert requests.put(f"{API}/admin/plans/gratuito", headers=admin, json={"price_cents": 100, "name": "Gratuito"}).status_code == 400
        assert requests.put(f"{API}/admin/plans/nope", headers=admin, json={"price_cents": 100, "name": "Nope"}).status_code == 404
        r = requests.put(f"{API}/admin/plans/premium_mensal", headers=admin, json={"price_cents": pm["price_cents"] + 1, "name": pm["name"]})
        assert r.status_code == 200
        assert [p for p in requests.get(f"{API}/plans").json() if p["id"] == "premium_mensal"][0]["price_cents"] == pm["price_cents"] + 1
        # revert
        requests.put(f"{API}/admin/plans/premium_mensal", headers=admin, json={"price_cents": pm["price_cents"], "name": pm["name"]})


# --- Privacy
class TestPrivacy:
    def test_consent_export_delete(self):
        u = reg("TEST_priv")
        assert requests.put(f"{API}/privacy/consent", headers=u["h"], json={"location_consent": True}).status_code == 200
        assert requests.get(f"{API}/auth/me", headers=u["h"]).json()["location_consent"] is True
        ex = requests.get(f"{API}/privacy/export", headers=u["h"]).json()
        assert {"usuario", "contatos", "incidentes", "alertas_enviados", "compartilhamentos"} <= set(ex)
        assert requests.delete(f"{API}/privacy/account", headers=u["h"]).status_code == 200
        assert requests.get(f"{API}/auth/me", headers=u["h"]).status_code == 401
        assert requests.post(f"{API}/auth/login", json={"email": u["email"], "password": "senha12345"}).status_code == 401
