import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from starlette.requests import Request
from supabase_auth.errors import AuthApiError

from app.database import get_authenticated_client


class FakePostgrest:
    def __init__(self) -> None:
        self.token: str | None = None

    def auth(self, token: str) -> None:
        self.token = token


class FakeSupabaseClient:
    def __init__(self, auth_error: Exception | None = None) -> None:
        self.postgrest = FakePostgrest()
        self.auth = SimpleNamespace(get_user=self.get_user)
        self.auth_error = auth_error

    def get_user(self, token: str) -> SimpleNamespace:
        if self.auth_error:
            raise self.auth_error
        return SimpleNamespace(
            user=SimpleNamespace(
                id="11111111-1111-4111-8111-111111111111",
                email="admin@example.com",
            )
        )


class AuthenticatedClientTests(unittest.TestCase):
    def test_valid_bearer_token_is_checked_and_forwarded_to_postgrest(self) -> None:
        client = FakeSupabaseClient()
        request = Request({"type": "http", "headers": []})
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials="valid-access-token",
        )

        with patch("app.database.get_supabase_client", return_value=client):
            result = get_authenticated_client(request, credentials)

        self.assertIs(result, client)
        self.assertEqual(client.postgrest.token, "valid-access-token")
        self.assertEqual(request.state.current_user.id, "11111111-1111-4111-8111-111111111111")

    def test_invalid_token_returns_unauthorized(self) -> None:
        client = FakeSupabaseClient(AuthApiError("invalid token", 401, "bad_jwt"))
        request = Request({"type": "http", "headers": []})
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials="invalid-access-token",
        )

        with patch("app.database.get_supabase_client", return_value=client):
            with self.assertRaises(HTTPException) as raised:
                get_authenticated_client(request, credentials)

        self.assertEqual(raised.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
