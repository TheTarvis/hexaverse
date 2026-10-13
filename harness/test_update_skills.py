import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "update_skills", Path(__file__).with_name("update-skills.py")
)
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


class SkillsUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.source = self.base / "upstream"
        self.source.mkdir()
        self.git("init", "-q")
        self.root = self.base / "volt"
        (self.root / "harness/skills").mkdir(parents=True)
        (self.root / "harness/skills/original.txt").write_text("untouched\n")
        self.lock = self.root / "harness/skills-lock.json"
        self.lock.write_text(json.dumps({
            "files": updater.inventory(self.root / "harness/skills")
        }))
        self.publish("first", "one")

    def git(self, *args):
        return subprocess.check_output(
            ["git", "-C", str(self.source), *args], text=True,
            stderr=subprocess.PIPE,
        ).strip()

    def publish(self, name, body):
        path = self.source / "skills/engineering" / name
        path.mkdir(parents=True)
        (path / "SKILL.md").write_text(body)
        script = path / "run.sh"
        script.write_bytes(b"#!/bin/sh\nprintf 'literal $VALUE\\n'\n")
        script.chmod(0o755)
        plugin = self.source / ".claude-plugin/plugin.json"
        plugin.parent.mkdir(exist_ok=True)
        plugin.write_text(json.dumps({
            "version": body, "skills": [f"./skills/engineering/{name}"]
        }))
        (self.source / "LICENSE").write_text("license bytes\n")
        self.git("add", "skills", ".claude-plugin", "LICENSE")
        self.git("-c", "user.name=Test", "-c", "user.email=test@example.com",
                 "-c", "commit.gpgsign=false", "commit", "-qm", body)

    def test_update_preserves_bytes_and_modes_and_removes_retired_skills(self):
        first = updater.update(self.root, "HEAD", str(self.source))
        self.assertEqual(first["revision"], self.git("rev-parse", "HEAD"))
        installed = self.root / "harness/skills"
        self.assertEqual((installed / "first/SKILL.md").read_bytes(), b"one")
        self.assertEqual((installed / "first/run.sh").stat().st_mode & 0o777, 0o755)
        self.publish("second", "two")
        updater.update(self.root, "HEAD", str(self.source))
        self.assertFalse((installed / "first").exists())
        self.assertEqual((installed / "second/SKILL.md").read_bytes(), b"two")
        updater.verify(self.root)
        updater.update(self.root, first["revision"], str(self.source))
        self.assertEqual((installed / "first/SKILL.md").read_bytes(), b"one")
        self.assertFalse((installed / "second").exists())

    def test_local_edits_block_update_without_overwriting(self):
        file = self.root / "harness/skills/original.txt"
        file.write_text("local edit")
        with self.assertRaisesRegex(ValueError, "original.txt"):
            updater.update(self.root, "HEAD", str(self.source))
        self.assertEqual(file.read_text(), "local edit")

    def test_local_spinup_survives_updates_outside_upstream_lock(self):
        skill = self.root / "harness/skills/spinup/SKILL.md"
        skill.parent.mkdir()
        skill.write_bytes(b"local spinup\n")
        updater.verify(self.root)
        lock = updater.update(self.root, "HEAD", str(self.source))
        self.assertEqual(skill.read_bytes(), b"local spinup\n")
        self.assertNotIn("spinup/SKILL.md", lock["files"])
        skill.write_bytes(b"edited local spinup\n")
        self.publish("second", "two")
        updater.update(self.root, "HEAD", str(self.source))
        self.assertEqual(skill.read_bytes(), b"edited local spinup\n")
        updater.verify(self.root)

    def test_upstream_spinup_conflict_preserves_install_and_lock(self):
        skill = self.root / "harness/skills/spinup/SKILL.md"
        skill.parent.mkdir()
        skill.write_text("local spinup")
        before = self.lock.read_bytes()
        self.publish("spinup", "upstream spinup")
        with self.assertRaisesRegex(ValueError, "conflicts with local skill: spinup"):
            updater.update(self.root, "HEAD", str(self.source))
        self.assertEqual(skill.read_text(), "local spinup")
        self.assertEqual(self.lock.read_bytes(), before)
        updater.verify(self.root)

    def test_failed_fetch_keeps_existing_install_and_lock(self):
        before = self.lock.read_bytes()
        with self.assertRaises(subprocess.CalledProcessError):
            updater.update(self.root, "missing-ref", str(self.source))
        self.assertEqual(before, self.lock.read_bytes())
        updater.verify(self.root)

    def test_bootstrap_excludes_import_but_keeps_local_utilities(self):
        script = Path(__file__).resolve().parents[1] / "bootstrap/init.sh"
        body = script.read_text().split("collect_files() {", 1)[1].split(
            "# In-place sed flag", 1
        )[0]
        for name in ("harness/skills/test/SKILL.md", "harness/skills-lock.json",
                     "harness/utilities/test/template.md",
                     "harness/utilities/test/model.go.tmpl", "frontend/example.ts"):
            file = self.root / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text("example")
        paths = subprocess.check_output(
            ["bash", "-c", "collect_files() {" + body + "\ncollect_files"],
            cwd=self.root,
        ).decode().split("\0")
        self.assertNotIn("./harness/skills/test/SKILL.md", paths)
        self.assertNotIn("./harness/skills-lock.json", paths)
        self.assertIn("./harness/utilities/test/template.md", paths)
        self.assertIn("./harness/utilities/test/model.go.tmpl", paths)
        self.assertIn("./frontend/example.ts", paths)


if __name__ == "__main__":
    unittest.main()
