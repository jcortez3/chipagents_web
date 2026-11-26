#!/usr/bin/env python3
# jcortez3
"""Safe archive helper for the skill importer.

  skill-archive.py extract <archive> <dest_dir>
  skill-archive.py zip <src_dir> <out.zip> <top_folder>

Prints one JSON object. Exit code 0 on success, 2 when the archive is rejected.
"""
import json
import os
import stat
import sys
import tarfile
import zipfile

JUNK = {'.DS_Store', 'Thumbs.db', 'desktop.ini'}
SKIP_DIRS = {'.git', '__pycache__'}
MAX_FILES = int(os.environ.get('SKILL_MAX_FILES', '2000'))
MAX_BYTES = int(os.environ.get('SKILL_MAX_BYTES', str(200 * 1024 * 1024)))
CHUNK = 1 << 20


class Bad(Exception):
    pass


def clean(name):
    n = name.replace('\\', '/')
    if n.startswith('/') or (len(n) > 1 and n[1] == ':'):
        raise Bad(f'absolute path in archive: {name}')
    parts = [p for p in n.split('/') if p not in ('', '.')]
    if '..' in parts:
        raise Bad(f'path escapes the archive: {name}')
    return parts


def junk(parts):
    return (not parts or parts[0] == '__MACOSX' or any(p in SKIP_DIRS for p in parts)
            or parts[-1] in JUNK or parts[-1].startswith('._'))


class Writer:
    def __init__(self, dest):
        os.makedirs(dest, exist_ok=True)
        self.dest = os.path.realpath(dest)
        self.files = 0
        self.bytes = 0

    def target(self, parts):
        t = os.path.realpath(os.path.join(self.dest, *parts))
        if not t.startswith(self.dest + os.sep):
            raise Bad('path escapes the archive: ' + '/'.join(parts))
        return t

    def mkdir(self, parts):
        os.makedirs(self.target(parts), exist_ok=True)

    def write(self, parts, src):
        self.files += 1
        if self.files > MAX_FILES:
            raise Bad(f'archive has more than {MAX_FILES} files')
        t = self.target(parts)
        os.makedirs(os.path.dirname(t), exist_ok=True)
        with open(t, 'wb') as out:
            while True:
                b = src.read(CHUNK)
                if not b:
                    break
                self.bytes += len(b)
                if self.bytes > MAX_BYTES:
                    raise Bad(f'archive unpacks to more than {MAX_BYTES // 1048576} MB')
                out.write(b)


def extract_zip(archive, w):
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            parts = clean(info.filename)
            if junk(parts):
                continue
            if stat.S_ISLNK(info.external_attr >> 16):
                raise Bad(f'symlinks are not allowed: {info.filename}')
            if info.flag_bits & 0x1:
                raise Bad(f'encrypted archives are not supported: {info.filename}')
            if info.is_dir():
                w.mkdir(parts)
                continue
            with z.open(info) as src:
                w.write(parts, src)


def extract_tar(archive, w):
    with tarfile.open(archive, 'r:*') as t:
        for m in t:
            parts = clean(m.name)
            if junk(parts):
                continue
            if m.issym() or m.islnk():
                raise Bad(f'links are not allowed: {m.name}')
            if m.isdir():
                w.mkdir(parts)
            elif m.isfile():
                w.write(parts, t.extractfile(m))
            else:
                raise Bad(f'special files are not allowed: {m.name}')


def extract(archive, dest):
    w = Writer(dest)
    if zipfile.is_zipfile(archive):
        extract_zip(archive, w)
    elif tarfile.is_tarfile(archive):
        extract_tar(archive, w)
    else:
        raise Bad('not a .zip, .tar.gz or .tgz archive')
    return {'ok': True, 'files': w.files, 'bytes': w.bytes}


def make_zip(src, out, top):
    count = 0
    skipped = []
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(src):
            rel_root = os.path.relpath(root, src)
            dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and d != '__MACOSX'
                             and not os.path.islink(os.path.join(root, d)))
            for f in sorted(files):
                p = os.path.join(root, f)
                rel = f if rel_root == '.' else os.path.join(rel_root, f)
                if f in JUNK or f.startswith('._'):
                    continue
                if os.path.islink(p):
                    skipped.append(rel)
                    continue
                z.write(p, os.path.join(top, rel))
                count += 1
    return {'ok': True, 'files': count, 'skippedLinks': skipped}


def main(argv):
    try:
        if len(argv) == 4 and argv[1] == 'extract':
            res = extract(argv[2], argv[3])
        elif len(argv) == 5 and argv[1] == 'zip':
            res = make_zip(argv[2], argv[3], argv[4])
        else:
            raise Bad('usage: skill-archive.py extract <archive> <dest> | zip <src> <out.zip> <top>')
    except (Bad, zipfile.BadZipFile, tarfile.TarError, EOFError, OSError) as e:
        print(json.dumps({'ok': False, 'error': str(e)}))
        return 2
    print(json.dumps(res))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
