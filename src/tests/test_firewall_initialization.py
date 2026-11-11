import importlib.util
import io
import json
import pathlib
import threading
import unittest
import urllib.parse
from contextlib import redirect_stdout
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SCRIPT = pathlib.Path(__file__).parents[1] / "modules/connectivity/scripts/initialize-admin.py"
spec = importlib.util.spec_from_file_location("initializer", SCRIPT)
initializer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(initializer)


class Appliance:
    def __init__(self):
        self.users = {"root": {"uuid": "root-id", "name": "root", "password": "image-password", "is_admin": "1"}}
        self.sessions = {}
        self.mutations = []
        self.reject_api = False
        appliance = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def answer(self, value, status=200):
                self.send_response(status)
                self.end_headers()
                self.wfile.write(value.encode() if isinstance(value, str) else json.dumps(value).encode())

            def do_GET(self):
                if self.path == "/":
                    return self.answer('<input type="hidden" name="csrf" value="form-token">')
                username = appliance.sessions.get(self.headers.get("Cookie"))
                if self.path == "/ui/auth/user/":
                    if username:
                        return self.answer('X-CSRFToken", "api-token"')
                    self.send_response(302)
                    self.send_header("Location", "/")
                    self.end_headers()
                    return
                if not username or self.headers.get("X-CSRFToken") != "api-token":
                    return self.answer({}, 403)
                if self.path.startswith("/api/auth/user/get/"):
                    user = next(value for value in appliance.users.values() if value["uuid"] == self.path.rsplit("/", 1)[1])
                    return self.answer({"user": {"name": user["name"], "group_memberships": {"1999": {"selected": 1}, "2001": {"selected": 1}}}})
                return self.answer({}, 404)

            def do_POST(self):
                body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
                if self.path == "/index.php":
                    form = urllib.parse.parse_qs(body.decode())
                    name = form.get("usernamefld", [""])[0]
                    if appliance.users.get(name, {}).get("password") == form.get("passwordfld", [""])[0]:
                        cookie = "session=" + str(len(appliance.sessions))
                        appliance.sessions[cookie] = name
                        self.send_response(302)
                        self.send_header("Set-Cookie", cookie + "; Path=/")
                        self.send_header("Location", "/index.php")
                        self.end_headers()
                    else:
                        self.answer("login rejected")
                    return
                if appliance.reject_api:
                    return self.answer({}, 404)
                name = appliance.sessions.get(self.headers.get("Cookie"))
                if not name or self.headers.get("X-CSRFToken") != "api-token":
                    return self.answer({}, 403)
                data = json.loads(body)
                if self.path == "/api/auth/user/search":
                    rows = [{key: value[key] for key in ("name", "uuid", "is_admin")} for value in appliance.users.values()]
                    return self.answer({"rows": rows, "total": len(rows)})
                user = data["user"]
                if self.path == "/api/auth/user/add":
                    assert user["group_memberships"] == "1999"
                    appliance.users[user["name"]] = {**user, "uuid": "new-id", "is_admin": "1"}
                    appliance.mutations.append("create")
                elif self.path.startswith("/api/auth/user/set/"):
                    assert user["group_memberships"] == "1999,2001"
                    appliance.users[user["name"]]["password"] = user["password"]
                    appliance.mutations.append("password")
                else:
                    return self.answer({}, 404)
                return self.answer({"result": "saved"})

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.endpoint = "http://127.0.0.1:" + str(self.server.server_port)

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()


class InitializationTests(unittest.TestCase):
    def setUp(self):
        self.appliance = Appliance()
        self.env = {"OPNSENSE_ENDPOINT": self.appliance.endpoint, "OPNSENSE_USERNAME": "root", "OPNSENSE_PASSWORD": 'desired-<&"password', "OPNSENSE_BOOTSTRAP_PASSWORD": "image-password"}

    def tearDown(self):
        self.appliance.close()

    def run_initializer(self):
        output = io.StringIO()
        with redirect_stdout(output):
            initializer.initialize(self.env)
        self.assertNotIn(self.env["OPNSENSE_PASSWORD"], output.getvalue())
        self.assertNotIn(self.env["OPNSENSE_BOOTSTRAP_PASSWORD"], output.getvalue())
        return json.loads(output.getvalue())

    def test_root_password_is_set_and_repeat_does_not_rotate(self):
        self.assertEqual(self.run_initializer()["status"], "initialized")
        self.assertEqual(self.appliance.users["root"]["password"], self.env["OPNSENSE_PASSWORD"])
        self.assertEqual(self.appliance.mutations, ["password"])
        self.assertEqual(self.run_initializer()["status"], "verified")
        self.assertEqual(self.appliance.mutations, ["password"])
        self.assertIsNone(initializer.authenticated(self.appliance.endpoint, "root", "image-password"))

    def test_custom_admin_is_created_before_bootstrap_password_changes(self):
        self.env["OPNSENSE_USERNAME"] = "platform-admin"
        self.assertEqual(self.run_initializer()["accounts_changed"], 2)
        self.assertEqual(self.appliance.mutations, ["create", "password"])
        self.assertEqual(self.appliance.users["platform-admin"]["password"], self.env["OPNSENSE_PASSWORD"])
        self.assertEqual(self.appliance.users["root"]["password"], self.env["OPNSENSE_PASSWORD"])
        self.assertEqual(self.run_initializer()["status"], "verified")
        self.assertEqual(self.appliance.mutations, ["create", "password"])

    def test_existing_custom_user_with_different_password_is_not_overwritten(self):
        self.env["OPNSENSE_USERNAME"] = "platform-admin"
        self.appliance.users["platform-admin"] = {"name": "platform-admin", "uuid": "existing-id", "password": "unrelated-password", "is_admin": "1"}
        with self.assertRaisesRegex(initializer.InitializationError, "existing-administrator-not-overwritten"):
            self.run_initializer()
        self.assertEqual(self.appliance.mutations, [])

    def test_wrong_bootstrap_password_makes_no_changes(self):
        self.env["OPNSENSE_BOOTSTRAP_PASSWORD"] = "incorrect"
        with self.assertRaisesRegex(initializer.InitializationError, "bootstrap-authentication-failed"):
            self.run_initializer()
        self.assertEqual(self.appliance.mutations, [])

    def test_missing_api_fails_before_mutation(self):
        self.appliance.reject_api = True
        with self.assertRaises(initializer.InitializationError):
            self.run_initializer()
        self.assertEqual(self.appliance.mutations, [])

    def test_same_image_root_credentials_remain_compatible(self):
        self.env["OPNSENSE_PASSWORD"] = "image-password"
        self.assertEqual(self.run_initializer()["status"], "verified")
        self.assertEqual(self.appliance.mutations, [])

    def test_explicit_null_password_mode_does_not_contact_appliance(self):
        self.env["OPNSENSE_INITIALIZE"] = "false"
        self.env["OPNSENSE_ENDPOINT"] = "invalid"
        self.assertEqual(self.run_initializer()["status"], "skipped")
        self.assertEqual(self.appliance.mutations, [])

    def test_bcrypt_limit_and_unsafe_targets_fail_without_mutation(self):
        for change in [{"OPNSENSE_PASSWORD": "x" * 73}, {"OPNSENSE_ENDPOINT": "https://user:secret@invalid"}, {"OPNSENSE_USERNAME": "admin/other"}, {"OPNSENSE_ENDPOINT": "http://public.example"}]:
            env = {**self.env, **change}
            with self.assertRaises(initializer.InitializationError):
                initializer.initialize(env)
        self.assertEqual(self.appliance.mutations, [])


if __name__ == "__main__":
    unittest.main()
