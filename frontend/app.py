import os

import pandas as pd
import plotly.express as px
import streamlit as st

from utils.api_client import APIClient

st.set_page_config(page_title="AI Data Analyst", layout="wide")

api_url = os.getenv("BACKEND_URL", "http://localhost:8000")
client = APIClient(api_url)


def _init_session() -> None:
    if "page" not in st.session_state:
        st.session_state.page = "landing"
    if "access_token" not in st.session_state:
        st.session_state.access_token = ""
    if "register_success" not in st.session_state:
        st.session_state.register_success = ""


def render_landing() -> None:
    st.title("AI Data Analyst")
    st.markdown("Sign in to explore your data with natural language, or create an account.")
    c1, c2 = st.columns(2)
    with c1:
        if st.button("Login", type="primary", use_container_width=True):
            st.session_state.page = "login"
            st.rerun()
    with c2:
        if st.button("Register", use_container_width=True):
            st.session_state.page = "register"
            st.rerun()


def render_register() -> None:
    st.title("Create account")
    st.caption("Use your company email and choose a username and password.")

    with st.form("register_form", clear_on_submit=False, border=True):
        company_email = st.text_input(
            "Company email",
            placeholder="you@company.com",
            key="reg_email",
            autocomplete="email",
        )
        username = st.text_input(
            "Username",
            placeholder="jane_doe",
            key="reg_username",
            autocomplete="username",
        )
        full_name = st.text_input(
            "Full name (optional)",
            placeholder="Jane Doe",
            key="reg_fullname",
            autocomplete="name",
        )
        password = st.text_input(
            "Password",
            type="password",
            placeholder="Min. 8 characters",
            key="reg_password",
            autocomplete="new-password",
        )
        confirm = st.text_input(
            "Confirm password",
            type="password",
            key="reg_password_confirm",
            autocomplete="new-password",
        )
        submitted = st.form_submit_button("Register", type="primary")

    if submitted:
        if not company_email.strip() or not username.strip() or not password:
            st.error("Email, username, and password are required.")
            return
        if len(password) < 8:
            st.error("Password must be at least 8 characters.")
            return
        if password != confirm:
            st.error("Passwords do not match.")
            return
        try:
            resp = client.register(
                company_email=company_email.strip(),
                username=username.strip(),
                password=password,
                full_name=full_name.strip() or None,
            )
            st.session_state.register_success = resp.get(
                "message",
                "Registration successful. Please sign in.",
            )
            st.session_state.page = "login"
            st.rerun()
        except Exception as exc:
            st.error(f"Registration failed: {exc}")

    if st.button("← Back to welcome"):
        st.session_state.page = "landing"
        st.rerun()


def render_login() -> None:
    st.title("Sign in")
    st.caption("Use your company email or username and your password.")

    if st.session_state.register_success:
        st.success(st.session_state.register_success)
        st.session_state.register_success = ""

    with st.form("login_form", clear_on_submit=False, border=True):
        email_or_user = st.text_input(
            "Email or username",
            placeholder="you@company.com or jane_doe",
            key="login_identifier",
            autocomplete="username",
        )
        password = st.text_input(
            "Password",
            type="password",
            key="login_password",
            autocomplete="current-password",
        )
        submitted = st.form_submit_button("Login", type="primary")

    if submitted:
        if not email_or_user.strip() or not password:
            st.error("Enter your email/username and password.")
            return
        try:
            token_data = client.login(
                email_or_username=email_or_user.strip(),
                password=password,
            )
            st.session_state["access_token"] = token_data["access_token"]
            st.session_state.page = "home"
            st.rerun()
        except Exception as exc:
            st.error(f"Login failed: {exc}")

    col1, col2 = st.columns(2)
    with col1:
        if st.button("Create an account"):
            st.session_state.page = "register"
            st.rerun()
    with col2:
        if st.button("← Back to welcome"):
            st.session_state.page = "landing"
            st.rerun()


def render_home() -> None:
    st.title("AI Data Analyst")
    st.caption("Ask business questions in plain English")

    top = st.columns([1, 4, 1])
    with top[2]:
        if st.button("Logout"):
            st.session_state["access_token"] = ""
            st.session_state.page = "landing"
            st.rerun()

    if not st.session_state.get("access_token"):
        st.warning("Session expired. Please sign in again.")
        st.session_state.page = "login"
        st.rerun()

    with st.form("ask_form", clear_on_submit=False, border=True):
        question = st.text_input(
            "Question",
            placeholder="What is total revenue by day?",
            key="home_question",
            autocomplete="off",
        )
        ask_submitted = st.form_submit_button("Ask", type="primary")

    if ask_submitted and question and question.strip():
        with st.spinner("Analyzing..."):
            try:
                data = client.ask(question.strip(), token=st.session_state["access_token"])
                st.subheader("Generated SQL")
                st.code(data["sql"], language="sql")

                st.subheader("Explanation")
                st.write(data["explanation"])

                st.subheader("Results")
                df = pd.DataFrame(data["rows"])
                st.dataframe(df, use_container_width=True)

                numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
                if len(df.columns) >= 2 and numeric_cols:
                    x_col = df.columns[0]
                    y_col = numeric_cols[0]
                    fig = px.bar(df, x=x_col, y=y_col, title=f"{y_col} by {x_col}")
                    st.plotly_chart(fig, use_container_width=True)
            except Exception as exc:
                st.error(f"Request failed: {exc}")


def main() -> None:
    _init_session()
    page = st.session_state.page
    if page == "landing":
        render_landing()
    elif page == "register":
        render_register()
    elif page == "login":
        render_login()
    elif page == "home":
        render_home()
    else:
        st.session_state.page = "landing"
        st.rerun()


if __name__ == "__main__":
    main()
