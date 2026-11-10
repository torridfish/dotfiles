#!/usr/bin/env python3
"""Collect public evidence for where a paper was published or submitted.

    uv run --no-project venue_check.py --arxiv 2608.02980
    uv run --no-project venue_check.py --title "Paper title" --first-author Lin

It asks five public sources and prints what each one says. It does not guess.
Only the standard library is used.

Sources and what each one can prove:
  arXiv        the authors' own comment and journal-ref fields
  OpenReview   the venue string of a submission: accepted (with Poster, Spotlight
               or Oral), "Submitted to", withdrawn, desk rejected. Only for venues
               that run on OpenReview, and only for records that are public.
  Crossref     a DOI in a proceedings volume or journal: proof of publication
  OpenAlex     the same, as a second opinion, plus the link between DOI and arXiv
  Semantic Scholar   venue of the published version (often rate-limited)

What no public source can prove: that a paper is under review at, or was rejected
by, a venue that keeps submissions private (CVPR, ICCV, ECCV, ICML, ACL and most
others). For those venues the only public facts are "accepted" or "no record".
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

UA = 'paper-annotate-venue-check/1.0 (stdlib urllib)'


def get(url, timeout=25):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json, application/atom+xml'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')


def norm(title):
    return re.sub(r'[^a-z0-9]+', '', (title or '').lower())


def source(name, fn):
    """Run one source. A failure is evidence too: say that the source did not answer."""
    try:
        return {'source': name, **fn()}
    except urllib.error.HTTPError as e:
        return {'source': name, 'status': 'no answer', 'detail': f'HTTP {e.code}'}
    except Exception as e:  # network, parse
        return {'source': name, 'status': 'no answer', 'detail': f'{type(e).__name__}: {e}'}


def arxiv(arxiv_id):
    ns = {'a': 'http://www.w3.org/2005/Atom', 'x': 'http://arxiv.org/schemas/atom'}
    root = ET.fromstring(get(f'https://export.arxiv.org/api/query?id_list={urllib.parse.quote(arxiv_id)}'))
    e = root.find('a:entry', ns)
    if e is None or e.find('a:title', ns) is None:
        return {'status': 'no record'}
    text = lambda tag: (e.findtext(tag, default='', namespaces=ns) or '').strip() or None
    return {'status': 'found',
            'title': ' '.join(text('a:title').split()),
            'authors': [a.findtext('a:name', namespaces=ns) for a in e.findall('a:author', ns)],
            'submitted': text('a:published'), 'updated': text('a:updated'),
            'comment': text('x:comment'), 'journal_ref': text('x:journal_ref'), 'doi': text('x:doi')}


def openreview(title):
    q = urllib.parse.urlencode({'term': title, 'type': 'terms', 'content': 'all', 'source': 'forum', 'limit': 25})
    notes = json.loads(get(f'https://api2.openreview.net/notes/search?{q}')).get('notes', [])
    hits = []
    for n in notes:
        c = n.get('content', {})
        val = lambda k: (c.get(k) or {}).get('value') if isinstance(c.get(k), dict) else c.get(k)
        if norm(val('title')) != norm(title):
            continue
        hits.append({'venue': val('venue'), 'venueid': val('venueid'),
                     'url': f"https://openreview.net/forum?id={n.get('forum')}",
                     'decision': read_venue(val('venue'), val('venueid'))})
    return {'status': 'found' if hits else 'no record', 'records': hits}


def read_venue(venue, venueid):
    """Translate an OpenReview venue string into a plain status."""
    v = f'{venue or ""} {venueid or ""}'.lower()
    if 'withdrawn' in v:
        return 'withdrawn'
    if 'desk' in v and 'reject' in v:
        return 'desk rejected'
    if 'reject' in v:
        return 'rejected'
    if (venue or '').lower().startswith('submitted to') or '/submission' in v:
        return 'submitted (under review, or rejected without a public decision)'
    if 'dblp.org' in v or 'archive' in v:
        return 'imported record, not a submission'
    for kind in ('oral', 'spotlight', 'highlight', 'poster'):
        if kind in v:
            return f'accepted ({kind})'
    return 'accepted (presentation type not stated)' if venue else 'unknown'


def crossref(title):
    q = urllib.parse.urlencode({'query.title': title, 'rows': 5,
                                'select': 'title,container-title,DOI,type,published,author,page'})
    items = json.loads(get(f'https://api.crossref.org/works?{q}'))['message']['items']
    hits = []
    for i in items:
        if norm((i.get('title') or [''])[0]) != norm(title) or i.get('type') == 'posted-content':
            continue
        hits.append({'container': i.get('container-title'), 'doi': i.get('DOI'), 'type': i.get('type'),
                     'pages': i.get('page'), 'year': ((i.get('published') or {}).get('date-parts') or [[None]])[0][0],
                     'authors': [a.get('family') for a in i.get('author', [])]})
    return {'status': 'found' if hits else 'no record', 'records': hits}


def openalex(title):
    q = urllib.parse.urlencode({'filter': f'title.search:{title.replace(",", " ").replace(":", " ")}', 'per-page': 5})
    hits = []
    for w in json.loads(get(f'https://api.openalex.org/works?{q}')).get('results', []):
        if norm(w.get('title')) != norm(title):
            continue
        hits.append({'type': w.get('type'), 'doi': w.get('doi'), 'date': w.get('publication_date'),
                     'locations': [{'source': (l.get('source') or {}).get('display_name'), 'version': l.get('version'),
                                    'url': l.get('landing_page_url')} for l in w.get('locations', [])]})
    return {'status': 'found' if hits else 'no record', 'records': hits}


def semanticscholar(arxiv_id, title):
    fields = 'title,venue,publicationVenue,publicationTypes,externalIds,year'
    if arxiv_id:
        d = json.loads(get(f'https://api.semanticscholar.org/graph/v1/paper/arXiv:{arxiv_id}?fields={fields}'))
    else:
        q = urllib.parse.urlencode({'query': title, 'fields': fields})
        d = json.loads(get(f'https://api.semanticscholar.org/graph/v1/paper/search/match?{q}'))['data'][0]
    return {'status': 'found', 'venue': d.get('venue') or None,
            'publication_venue': (d.get('publicationVenue') or {}).get('name'),
            'types': d.get('publicationTypes'), 'year': d.get('year'), 'ids': d.get('externalIds')}


def summarize(ev, first_author):
    """State only what the evidence supports. One line per fact."""
    by = {e['source']: e for e in ev}
    lines = []
    for r in by.get('crossref', {}).get('records', []):
        ok = not first_author or any(first_author.lower() == (a or '').lower() for a in r['authors'])
        cont = ' / '.join(r['container'] or [])
        lines.append(f"PUBLISHED: {cont} ({r['year']}), {r['type']}, DOI {r['doi']}"
                     + ('' if ok else ' [author names do not match: check by hand]'))
    for r in by.get('openreview', {}).get('records', []):
        lines.append(f"OPENREVIEW: {r['venue']} -> {r['decision']} ({r['url']})")
    a = by.get('arxiv', {})
    if a.get('journal_ref'):
        lines.append(f"ARXIV journal-ref: {a['journal_ref']}")
    if a.get('comment'):
        lines.append(f"ARXIV comment: {a['comment']}")
    silent = [e['source'] for e in ev if e.get('status') == 'no answer']
    if silent:
        lines.append('NO ANSWER from: ' + ', '.join(silent) + ' (try again, or check by hand)')
    if not any(l.startswith(('PUBLISHED', 'OPENREVIEW', 'ARXIV journal')) for l in lines):
        lines.append('NO VENUE EVIDENCE: treat the paper as a preprint. A conference template in the source is not evidence.')
    return lines


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--arxiv', help='arXiv id, for example 2608.02980')
    ap.add_argument('--title', help='paper title, if there is no arXiv id')
    ap.add_argument('--first-author', help='family name of the first author, to check a title match')
    ap.add_argument('--json', action='store_true', help='print the raw evidence as JSON')
    args = ap.parse_args()
    if not args.arxiv and not args.title:
        ap.error('give --arxiv or --title')

    ev, title, first = [], args.title, args.first_author
    if args.arxiv:
        a = source('arxiv', lambda: arxiv(args.arxiv))
        ev.append(a)
        title = title or a.get('title')
        if not first and a.get('authors'):
            first = a['authors'][0].split()[-1]
    if not title:
        sys.exit('venue_check: no title. The arXiv lookup failed; pass --title.')
    ev.append(source('openreview', lambda: openreview(title)))
    ev.append(source('crossref', lambda: crossref(title)))
    ev.append(source('openalex', lambda: openalex(title)))
    ev.append(source('semanticscholar', lambda: semanticscholar(args.arxiv, title)))

    if args.json:
        print(json.dumps({'title': title, 'evidence': ev}, indent=1, ensure_ascii=False))
        return
    print(f'Title: {title}')
    for line in summarize(ev, first):
        print(line)


if __name__ == '__main__':
    main()
