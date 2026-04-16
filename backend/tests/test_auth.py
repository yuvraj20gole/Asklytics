def test_register_and_login(client, unique_user_payload):
    reg = client.post("/api/v1/auth/register", json=unique_user_payload)
    assert reg.status_code == 201, reg.text
    body = reg.json()
    assert body["email"] == unique_user_payload["company_email"]
    assert body["username"] == unique_user_payload["username"]

    login = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": unique_user_payload["username"],
            "password": unique_user_payload["password"],
        },
    )
    assert login.status_code == 200, login.text
    tok = login.json()
    assert tok["token_type"] == "bearer"
    assert isinstance(tok["access_token"], str) and tok["access_token"]

