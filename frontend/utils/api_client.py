import requests


class APIClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def register(
        self,
        company_email: str,
        username: str,
        password: str,
        full_name: str | None = None,
    ) -> dict:
        body: dict = {
            "company_email": company_email,
            "username": username,
            "password": password,
        }
        if full_name:
            body["full_name"] = full_name
        response = requests.post(
            f"{self.base_url}/api/v1/auth/register",
            json=body,
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    def login(self, email_or_username: str, password: str) -> dict:
        response = requests.post(
            f"{self.base_url}/api/v1/auth/login",
            json={"email_or_username": email_or_username, "password": password},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    def ask(self, question: str, token: str) -> dict:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        response = requests.post(
            f"{self.base_url}/api/v1/ask",
            json={"question": question},
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        return response.json()
