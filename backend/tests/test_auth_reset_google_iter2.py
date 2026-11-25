# Iteration 2: password reset emails, Google (Emergent) session, payments 503, share regression
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
ADMIN = {"email": "admin@rotasegura.com", "password": "Admin@123"}


@pytest.fixture(scope="module")
def s():
    x = requests.Session()
    x.headers.update({"Content-Type": "application/json"})
    return x


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def test_user(s):
    email = f"delivered+test{uuid.uuid4().hex[:8]}@resend.dev"
    r = s.post(f"{BASE_URL}/api/auth/register", json={"name": "TEST_ Reset User", "email": email, "password": "Test@1234",
                                                      "phone": "11999999999", "driver_type": "aplicativo", "lgpd_consent": True})
    assert r.status_code == 200, r.text
    return {"email": email, "token": r.json()["token"]}


# --- Password reset request
class TestPasswordResetRequest:
    def test_request_registered_resend(self, s, test_user):
        r = s.post(f"{BASE_URL}/api/auth/password-reset/request", json={"email": test_user["email"]})
        assert r.status_code == 200, r.text
        assert "Se o endereço estiver cadastrado" in r.json()["message"]

    def test_request_second_time_same_email(self, s, test_user):
        # second request within 2 min must still return generic 200 (rate limit path)
        r = s.post(f"{BASE_URL}/api/auth/password-reset/request", json={"email": test_user["email"]})
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"

    def test_request_delivered_resend(self, s):
        r = s.post(f"{BASE_URL}/api/auth/password-reset/request", json={"email": "delivered@resend.dev"})
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        assert "Se o endereço estiver cadastrado" in r.json()["message"]

    def test_request_unknown_email_generic(self, s):
        r = s.post(f"{BASE_URL}/api/auth/password-reset/request", json={"email": f"nobody{uuid.uuid4().hex[:6]}@example.com"})
        assert r.status_code == 200
        assert "Se o endereço estiver cadastrado" in r.json()["message"]

    def test_request_invalid_email_422(self, s):
        r = s.post(f"{BASE_URL}/api/auth/password-reset/request", json={"email": "not-an-email"})
        assert r.status_code == 422


# --- Reset page + confirm
class TestPasswordResetConfirm:
    def test_reset_page_html(self, s):
        r = requests.get(f"{BASE_URL}/api/public/reset-password", params={"token": "abc123"})
        assert r.status_code == 200
        assert "text/html" in r.headers["content-type"]
        assert 'id="p1"' in r.text and 'id="p2"' in r.text and "Salvar nova senha" in r.text
        assert "abc123" in r.text

    def test_reset_page_xss_escaped(self, s):
        r = requests.get(f"{BASE_URL}/api/public/reset-password", params={"token": '"><script>alert(1)</script>'})
        assert r.status_code == 200
        assert "<script>alert(1)</script>" not in r.text

    def test_confirm_invalid_token_400(self, s):
        r = s.post(f"{BASE_URL}/api/auth/password-reset/confirm", json={"token": "x" * 40, "password": "NewPass@123"})
        assert r.status_code == 400
        assert "inválido" in r.json()["detail"]

    def test_confirm_short_token_422(self, s):
        r = s.post(f"{BASE_URL}/api/auth/password-reset/confirm", json={"token": "short", "password": "NewPass@123"})
        assert r.status_code == 422


# --- Google Emergent session
class TestGoogleSession:
    def test_invalid_session_401(self, s):
        r = s.post(f"{BASE_URL}/api/auth/session", json={"session_id": "invalid-session-123456"})
        assert r.status_code == 401
        assert "Google" in r.json()["detail"]

    def test_short_session_422(self, s):
        r = s.post(f"{BASE_URL}/api/auth/session", json={"session_id": "x"})
        assert r.status_code == 422


# --- Login regression + payments 503
class TestRegression:
    def test_admin_login(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"

    def test_checkout_503(self, s, test_user):
        r = s.post(f"{BASE_URL}/api/payments/checkout", json={"plan_id": "premium_mensal"},
                   headers={"Authorization": f"Bearer {test_user['token']}"})
        assert r.status_code == 503, r.text
        if r.status_code == 503:
            assert "Pagamentos ainda não configurados" in r.json()["detail"]

    def test_share_create_and_stop(self, s, test_user):
        h = {"Authorization": f"Bearer {test_user['token']}"}
        r = s.post(f"{BASE_URL}/api/share", json={"lat": -23.55, "lng": -46.63, "hours": 1}, headers=h)
        assert r.status_code == 200, r.text
        sh = r.json()
        assert sh["token"] and sh["id"]
        pub = requests.get(f"{BASE_URL}/api/public/share/{sh['token']}")
        assert pub.status_code == 200
        d = s.delete(f"{BASE_URL}/api/share/{sh['id']}", headers=h)
        assert d.status_code in (200, 204)
