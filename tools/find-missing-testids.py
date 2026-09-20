#!/usr/bin/env python3
"""List interactive JSX opening tags that lack a data-testid attribute.

Used by check-datatestid.sh. Brace/string-aware so a `>` inside an attribute
expression (e.g. onClick={() => x}) is not mistaken for the end of the tag.

Output: one line per interactive element missing data-testid:
    <line>: <TagName>
Exit code is always 0; the caller decides what to do with the list.
"""
import sys
import re

# Form controls + the Catalyst wrappers around them. Intentionally excludes
# <a>/<Link> to avoid nagging every nav/marketing link.
INTERACTIVE = (
    "button|input|select|textarea|"
    "Button|Input|Select|Textarea|Checkbox|Radio|Switch|Combobox"
)
OPEN = re.compile(r"<(" + INTERACTIVE + r")(?=[\s/>])")


def opening_tags(text):
    """Yield (tagname, line_no, tag_source) for each interactive opening tag."""
    n = len(text)
    for m in OPEN.finditer(text):
        i = m.end()
        depth = 0      # {} nesting depth
        quote = None   # active string delimiter, if any
        while i < n:
            c = text[i]
            if quote:
                if c == quote:
                    quote = None
            elif c in "\"'`":
                quote = c
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
            elif c == ">" and depth == 0:
                break
            i += 1
        tag_src = text[m.start():i + 1]
        line_no = text.count("\n", 0, m.start()) + 1
        yield m.group(1), line_no, tag_src


def main():
    if len(sys.argv) < 2:
        return 0
    try:
        with open(sys.argv[1], encoding="utf-8", errors="replace") as f:
            text = f.read()
    except OSError:
        return 0
    for name, line, src in opening_tags(text):
        if "data-testid" not in src:
            print(f"{line}: <{name}>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
