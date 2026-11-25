# Iteration 3: Stripe 7-day trial, SOS WhatsApp auto (Twilio not configured -> 503), regression login
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
ADMIN = {"email": "admin@rotasegura.com", "password": "Admin@123"}
USER = {"email": "delivered@resend.dev", "password": "Teste@123"}


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def register(name="TEST_ Trial User"):
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"name": name, "email": email, "password": "Test@1234",
                                                             "phone": "11999999999", "driver_type": "aplicativo", "lgpd_consent": True})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def tok_a():
    return register("TEST_ UserA")


@pytest.fixture(scope="module")
def tok_b():
    return register("TEST_ UserB")


# Regression: login
class TestLogin:
    def test_admin_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        assert r.status_code == 200 and r.json().get("token")

    def test_user_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json=USER)
        assert r.status_code == 200 and r.json().get("token")

    def test_bad_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": USER["email"], "password": "wrong"})
        assert r.status_code in (400, 401)


# Trial + checkout
class TestTrial:
    def test_trial_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/payments/trial")
        assert r.status_code == 401

    def test_trial_eligible(self, tok_a):
        r = requests.get(f"{BASE_URL}/api/payments/trial", headers=H(tok_a))
        assert r.status_code == 200
        assert r.json() == {"eligible": True, "days": 7}

    def test_checkout_trial(self, tok_a):
        plans = requests.get(f"{BASE_URL}/api/plans", headers=H(tok_a)).json()
        paid = [p for p in plans if p["price_cents"] > 0]
        assert paid, "no paid plans"
        r = requests.post(f"{BASE_URL}/api/payments/checkout", json={"plan_id": paid[0]["id"]}, headers=H(tok_a))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["trial"] is True
        assert d["url"].startswith("https://checkout.stripe.com")
        assert d["session_id"].startswith("cs_")
        st = requests.get(f"{BASE_URL}/api/payments/status/{d['session_id']}", headers=H(tok_a))
        assert st.status_code == 200 and st.json()["status"] == "pendente"
        # still eligible until paid
        assert requests.get(f"{BASE_URL}/api/payments/trial", headers=H(tok_a)).json()["eligible"] is True

    def test_checkout_invalid_plan(self, tok_a):
        r = requests.post(f"{BASE_URL}/api/payments/checkout", json={"plan_id": "gratuito"}, headers=H(tok_a))
        assert r.status_code == 404

    def test_status_other_user_404(self, tok_a, tok_b):
        plans = requests.get(f"{BASE_URL}/api/plans", headers=H(tok_a)).json()
        pid = [p for p in plans if p["price_cents"] > 0][0]["id"]
        sid = requests.post(f"{BASE_URL}/api/payments/checkout", json={"plan_id": pid}, headers=H(tok_a)).json()["session_id"]
        r = requests.get(f"{BASE_URL}/api/payments/status/{sid}", headers=H(tok_b))
        assert r.status_code == 404

    def test_return_page(self):
        r = requests.get(f"{BASE_URL}/api/payments/return", params={"status": "cancel"})
        assert r.status_code == 200 and "ROTA SEGURA" in r.text


# SOS WhatsApp automatic
class TestSosWhatsapp:
    def test_whatsapp_503_when_unconfigured(self, tok_a):
        c = requests.post(f"{BASE_URL}/api/contacts", json={"name": "TEST_ Contato", "phone": "11988887777"}, headers=H(tok_a))
        assert c.status_code in (200, 201), c.text
        inc = requests.post(f"{BASE_URL}/api/sos", json={"lat": -23.55, "lng": -46.63}, headers=H(tok_a))
        assert inc.status_code in (200, 201), inc.text
        iid = inc.json()["id"]
        r = requests.post(f"{BASE_URL}/api/sos/{iid}/whatsapp", headers=H(tok_a))
        assert r.status_code == 503
        assert "WhatsApp" in r.json()["detail"]
        pytest.iid = iid
        pytest.cid = c.json()["id"]

    def test_whatsapp_other_user_incident(self, tok_b):
        r = requests.post(f"{BASE_URL}/api/sos/{pytest.iid}/whatsapp", headers=H(tok_b))
        print("other-user status:", r.status_code, r.text)
        assert r.status_code == 404, f"expected 404 got {r.status_code}"

    def test_whatsapp_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/sos/{pytest.iid}/whatsapp")
        assert r.status_code == 401

    def test_cleanup(self, tok_a):
        requests.post(f"{BASE_URL}/api/sos/{pytest.iid}/action", json={"action": "cancelado"}, headers=H(tok_a))
        r = requests.delete(f"{BASE_URL}/api/contacts/{pytest.cid}", headers=H(tok_a))
        assert r.status_code in (200, 204)
