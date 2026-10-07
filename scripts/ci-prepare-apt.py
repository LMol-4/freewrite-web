"""Configure only the disposable Ubuntu CI runner's APT network settings."""
from pathlib import Path
import sys


def configure(root: Path) -> None:
    # Keep suites, components and signature settings intact. GitHub runners can
    # use either direct source URIs or file-based mirror lists.
    candidates = [root / "sources.list", *root.glob("sources.list.d/*.list"),
                  *root.glob("sources.list.d/*.sources"), *root.glob("apt-mirrors*.txt")]
    for path in candidates:
        if not path.is_file():
            continue
        original = path.read_text()
        updated = original.replace("http://azure.archive.ubuntu.com/ubuntu",
                                   "https://archive.ubuntu.com/ubuntu")
        updated = updated.replace("https://azure.archive.ubuntu.com/ubuntu",
                                  "https://archive.ubuntu.com/ubuntu")
        if updated != original:
            path.write_text(updated)
            print(f"Replaced Azure Ubuntu mirror in {path.name}")
    settings = root / "apt.conf.d" / "99-freewrite-ci"
    settings.write_text('Acquire::http::Timeout "30";\n'
                        'Acquire::https::Timeout "30";\n'
                        'Acquire::Retries "2";\n'
                        'Acquire::Languages "none";\n')


if __name__ == "__main__":
    configure(Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/etc/apt"))
