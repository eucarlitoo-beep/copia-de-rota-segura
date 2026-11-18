import asyncio
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "rota_segura_test")
os.environ.setdefault("JWT_SECRET", "unit-test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server


class AuthImprovementTests(unittest.TestCase):
    def test_email_schemas_reject_invalid_addresses(self):
        with self.assertRaises(ValidationError):
            server.LoginIn(email="nao-e-email", password="senha12345")
        with self.assertRaises(ValidationError):
            server.PasswordResetRequestIn(email="nao-e-email")

    def test_auth_routes_are_registered(self):
        paths = server.app.openapi()["paths"]
        self.assertIn("/api/auth/password-reset/request", paths)
        self.assertIn("/api/auth/password-reset/confirm", paths)
        self.assertIn("/api/auth/social", paths)

    def test_reset_request_response_does_not_reveal_unknown_email(self):
        users = SimpleNamespace(find_one=AsyncMock(return_value=None))
        db = SimpleNamespace(users=users)
        result = asyncio.run(_call_request_reset(db))
        self.assertEqual(result["message"], "Se o endereço estiver cadastrado, enviaremos as instruções de recuperação.")
        users.find_one.assert_awaited_once()

    def test_password_reset_changes_hash_and_revokes_old_tokens(self):
        reset = {"user_id": "user-1", "token_hash": "ignored"}
        resets = SimpleNamespace(find_one=AsyncMock(return_value=reset), update_one=AsyncMock())
        users = SimpleNamespace(update_one=AsyncMock(return_value=SimpleNamespace(matched_count=1)))
        with patch.object(server, "db", SimpleNamespace(password_resets=resets, users=users)), patch.object(server, "hash_pw", return_value="new-hash"):
            result = asyncio.run(server.confirm_password_reset(server.PasswordResetIn(token="t" * 32, password="newpass123")))
        self.assertIn("Senha alterada", result["message"])
        users.update_one.assert_awaited_once()
        update = users.update_one.await_args.args[1]
        self.assertEqual(update["$set"]["password_hash"], "new-hash")
        self.assertEqual(update["$inc"]["auth_version"], 1)

    def test_expired_auth_version_is_rejected(self):
        cred = HTTPAuthorizationCredentials(scheme="Bearer", credentials="old-token")
        with patch.object(server.jwt, "decode", return_value={"sub": "user-1", "ver": 0}), patch.object(
            server, "db", SimpleNamespace(users=SimpleNamespace(find_one=AsyncMock(return_value={"id": "user-1", "auth_version": 1})))
        ):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(server.current_user(cred))
        self.assertEqual(error.exception.status_code, 401)


async def _call_request_reset(db):
    with patch.object(server, "db", db):
        return await server.request_password_reset(server.PasswordResetRequestIn(email="person@example.com"))


if __name__ == "__main__":
    unittest.main()
