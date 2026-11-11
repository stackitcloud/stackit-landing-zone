#!/usr/bin/env python3
"""Initialize an explicitly opted-in appliance without storing credentials locally."""
import http.cookiejar
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser


class InitializationError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise InitializationError("redirect-rejected")


class HiddenInput(HTMLParser):
    def __init__(self):
        super().__init__()
        self.field = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "input" and attrs.get("type") == "hidden" and self.field is None:
            if attrs.get("name") and attrs.get("value"):
                self.field = (attrs["name"], attrs["value"])


class Session:
    def __init__(self, endpoint):
        self.endpoint = endpoint
        self.token = None
        self.client = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=ssl._create_unverified_context()),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
            NoRedirect(),
        )

    def request(self, path, data=None, form=False, login=False):
        headers = {}
        if self.token:
            headers["X-CSRFToken"] = self.token
        if data is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
            data = urllib.parse.urlencode(data).encode() if form else json.dumps(data).encode()
        request = urllib.request.Request(self.endpoint + path, data=data, headers=headers)
        try:
            with self.client.open(request, timeout=30) as response:
                body = response.read(1048577)
        except urllib.error.HTTPError as error:
            error.close()
            if error.code in (401, 403) and login:
                return ""
            raise InitializationError("appliance-request-rejected") from None
        if len(body) > 1048576:
            raise InitializationError("appliance-response-too-large")
        return body.decode("utf-8")

    def login(self, username, password):
        parser = HiddenInput()
        parser.feed(self.request("/", login=True))
        if not parser.field:
            raise InitializationError("login-form-unavailable")
        try:
            self.request("/index.php", dict([parser.field, ("usernamefld", username), ("passwordfld", password), ("login", "1")]), form=True, login=True)
        except InitializationError as error:
            # GUI login may redirect after setting its same-origin session cookie.
            if str(error) != "redirect-rejected":
                raise
        try:
            page = self.request("/ui/auth/user/", login=True)
        except InitializationError as error:
            if str(error) == "redirect-rejected":
                return False
            raise
        match = re.search(r'X-CSRFToken["\']\s*,\s*["\']([^"\']+)', page)
        if not match:
            return False
        self.token = match.group(1)
        return True

    def api(self, path, data=None):
        try:
            return json.loads(self.request("/api/auth/user/" + path, data))
        except (ValueError, UnicodeError):
            raise InitializationError("appliance-api-invalid") from None

    def users(self):
        data = self.api("search", {"current": 1, "rowCount": 1000, "searchPhrase": ""})
        rows = data.get("rows")
        if not isinstance(rows, list) or int(data.get("total", len(rows))) > len(rows):
            raise InitializationError("user-inventory-incomplete")
        return rows

    def admin(self, username):
        rows = [row for row in self.users() if row.get("name") == username]
        if len(rows) != 1 or str(rows[0].get("is_admin")) != "1":
            raise InitializationError("administrator-access-required")
        return rows[0]

    def password(self, user, password):
        record = self.api("get/" + urllib.parse.quote(user["uuid"], safe=""))["user"]
        memberships = record.get("group_memberships", {})
        if isinstance(memberships, dict):
            memberships = ",".join(key for key, option in memberships.items() if str(option.get("selected")) == "1")
        if not isinstance(memberships, str) or "1999" not in memberships.split(","):
            raise InitializationError("administrator-membership-invalid")
        result = self.api("set/" + urllib.parse.quote(user["uuid"], safe=""), {"user": {"name": user["name"], "password": password, "group_memberships": memberships}})
        if result.get("result") != "saved":
            raise InitializationError("password-update-not-confirmed")


def authenticated(endpoint, username, password):
    session = Session(endpoint)
    if not session.login(username, password):
        return None
    session.admin(username)
    return session


def initialize(env):
    if env.get("OPNSENSE_INITIALIZE", "true") == "false":
        print(json.dumps({"status": "skipped", "accounts_changed": 0}))
        return
    endpoint = env.get("OPNSENSE_ENDPOINT", "").rstrip("/")
    parsed = urllib.parse.urlsplit(endpoint)
    if (parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost"))) or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        raise InitializationError("invalid-appliance-endpoint")
    username = env.get("OPNSENSE_USERNAME", "")
    password = env.get("OPNSENSE_PASSWORD", "")
    bootstrap_username = env.get("OPNSENSE_BOOTSTRAP_USERNAME", "root")
    bootstrap_password = env.get("OPNSENSE_BOOTSTRAP_PASSWORD", "")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.-]{0,31}", username) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.-]{0,31}", bootstrap_username) or not password or len(password.encode("utf-8")) > 72 or not bootstrap_password or (username != bootstrap_username and password == bootstrap_password):
        raise InitializationError("invalid-initial-credentials")
    deadline = time.monotonic() + 600
    while True:
        try:
            desired = authenticated(endpoint, username, password)
            break
        except (urllib.error.URLError, TimeoutError):
            if time.monotonic() >= deadline:
                raise InitializationError("appliance-startup-timeout") from None
            time.sleep(15)
    changed = 0
    if desired is None:
        bootstrap = authenticated(endpoint, bootstrap_username, bootstrap_password)
        if bootstrap is None:
            raise InitializationError("bootstrap-authentication-failed")
        users = bootstrap.users()
        existing = [user for user in users if user.get("name") == username]
        if username == bootstrap_username:
            bootstrap.password(bootstrap.admin(username), password)
        elif existing:
            raise InitializationError("existing-administrator-not-overwritten")
        else:
            result = bootstrap.api("add", {"user": {"name": username, "password": password, "group_memberships": "1999", "scope": "user"}})
            if result.get("result") != "saved":
                raise InitializationError("administrator-creation-not-confirmed")
        changed += 1
        desired = authenticated(endpoint, username, password)
        if desired is None:
            raise InitializationError("administrator-verification-failed")
    if username != bootstrap_username:
        if authenticated(endpoint, bootstrap_username, password) is None:
            bootstrap = authenticated(endpoint, bootstrap_username, bootstrap_password)
            if bootstrap is not None:
                desired.password(desired.admin(bootstrap_username), password)
                changed += 1
                if authenticated(endpoint, bootstrap_username, password) is None:
                    raise InitializationError("bootstrap-account-verification-failed")
    print(json.dumps({"status": "initialized" if changed else "verified", "accounts_changed": changed}))


if __name__ == "__main__":
    try:
        initialize(os.environ)
    except InitializationError as error:
        print("firewall-initialization: " + str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("firewall-initialization: operation-failed", file=sys.stderr)
        sys.exit(1)
