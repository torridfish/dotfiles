#!/usr/bin/env python3
"""Make a single-file copy of an annotated page for local reading.

The page is written as an Artifact fragment (no doctype, images in figures/).
This script adds the document skeleton and inlines local images as data URIs.

    python3 standalone.py page.html -o annotated.html
"""
import argparse
import base64
import mimetypes
import pathlib
import re

HEAD = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n'
        '</head>\n<body>\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('page')
    ap.add_argument('-o', '--output', required=True)
    args = ap.parse_args()
    src = pathlib.Path(args.page)
    html = src.read_text(encoding='utf-8')

    def inline(m):
        attr, ref = m.group(1), m.group(2)
        path = src.parent / ref
        if re.match(r'^[a-z]+:', ref) or not path.is_file():
            return m.group(0)
        mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        data = base64.b64encode(path.read_bytes()).decode('ascii')
        return f'{attr}="data:{mime};base64,{data}"'

    html = re.sub(r'\b(src)="([^"]+\.(?:webp|png|jpe?g|gif|svg))"', inline, html)
    # A link to a local image cannot open from a data URI page; drop the link, keep the page.
    html = re.sub(r'\s*<a class="open"[^>]*>.*?</a>', '', html)
    pathlib.Path(args.output).write_text(HEAD + html + '\n</body>\n</html>\n', encoding='utf-8')
    print(args.output)


if __name__ == '__main__':
    main()
