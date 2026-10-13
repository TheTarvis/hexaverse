import contextlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location(
    "onboard", Path(__file__).with_name("onboard.py")
)
onboard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(onboard)


class LocalOnboardingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "frontend").mkdir()
        (self.root / "bootstrap").mkdir()
        self.root_patch = patch.object(onboard, "REPO_ROOT", self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)

    def frontend_env(self, text):
        (self.root / "frontend/.env.local").write_text(text)

    def test_local_accepts_demo_config_without_domain(self):
        self.frontend_env(
            "NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key\nNEXT_PUBLIC_FIREBASE_PROJECT_ID=example-emulator\nNEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=\n"
        )
        self.assertEqual(onboard.check_frontend_env(local_only=True), (True, None))
        self.assertIn("AUTH_DOMAIN", onboard.check_frontend_env()[1])

    def test_project_id_is_required_even_when_api_key_exists(self):
        self.frontend_env("NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key\n")
        self.assertIn("PROJECT_ID", onboard.check_frontend_env(local_only=True)[1])

    def test_quoted_empty_values_are_missing(self):
        self.frontend_env(
            'NEXT_PUBLIC_FIREBASE_API_KEY=""\nNEXT_PUBLIC_FIREBASE_PROJECT_ID=example-emulator\n'
        )
        self.assertIn("API_KEY", onboard.check_frontend_env(local_only=True)[1])

    def test_cloud_env_accepts_complete_config(self):
        self.frontend_env(
            "NEXT_PUBLIC_FIREBASE_API_KEY=configured-key\nNEXT_PUBLIC_FIREBASE_PROJECT_ID=example-dev\nNEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=auth.example.com\n"
        )
        self.assertEqual(onboard.check_frontend_env(), (True, None))

    def test_local_config_does_not_require_billing(self):
        (self.root / "bootstrap/config.env").write_text(
            "PROJECT_SLUG=example\nPROJECT_NAME=Example\nGCP_PROJECT_DEV=example-dev\nGCP_PROJECT_PROD=example-prod\nPROD_DOMAIN=example.example.com\nDEV_DOMAIN=example-dev.example.com\n"
        )
        self.assertEqual(onboard.check_config_env(local_only=True), (True, None))
        self.assertIn("BILLING_ACCOUNT", onboard.check_config_env()[1])

    def test_local_mode_never_invokes_cloud_probes(self):
        template = self.root / "template.md"
        template.write_text("<<cloud.firebase_auth>>\n<<deps.npm>>\n")
        output = self.root / "checklist.md"
        cloud = Mock(side_effect=AssertionError("cloud probe must not run"))
        local = Mock(return_value=(True, None))
        checks = [
            ("cloud.firebase_auth", "Cloud login", cloud),
            ("deps.npm", "Local deps", local),
        ]
        with (
            patch.object(onboard, "TEMPLATE", template),
            patch.object(onboard, "OUTPUT", output),
            patch.object(onboard, "CHECKS", checks),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(onboard.main(["--local"]), 0)
        cloud.assert_not_called()
        local.assert_called_once()
        self.assertIn("skipped: cloud setup", output.read_text())
        self.assertIn("[x]", output.read_text())

    def test_default_cloud_mode_runs_cloud_probes_and_reports_failure(self):
        template = self.root / "template.md"
        template.write_text("<<cloud.firebase_auth>>\n")
        cloud = Mock(return_value=(False, "sign in required"))
        with (
            patch.object(onboard, "TEMPLATE", template),
            patch.object(onboard, "OUTPUT", self.root / "checklist.md"),
            patch.object(
                onboard, "CHECKS", [("cloud.firebase_auth", "Cloud login", cloud)]
            ),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(onboard.main([]), 1)
        cloud.assert_called_once()


if __name__ == "__main__":
    unittest.main()
