"""
Incrementally indexes the Markdown files in DOCS_DIR into the MongoDB Atlas Vector Search collection that
rag-chat/backend reads from, embedding each chunk with the Mistral API (mistral-embed).

This is the MongoDB counterpart to rag_console.py's ChromaDB indexing (see clean_wikilinks/sha256/
load_md_files/build_index there): a per-file content hash is stored alongside each chunk, so a file whose
content hasn't changed since the last run is skipped instead of being re-embedded.

Unlike rag_console.py, deleting chunks for files that no longer exist on disk is NOT automatic — the
collection may already hold chunks from files that were never part of DOCS_DIR (that was true of the 22
chunks present when this script was written). Pass --prune to enable that cleanup once you've confirmed
with --dry-run that it would only remove what you expect.

Usage:
    python index_mongo.py              # index new/changed files
    python index_mongo.py --dry-run    # show what would happen, write nothing
    python index_mongo.py --prune      # also delete chunks for files no longer in DOCS_DIR
"""

import argparse
import hashlib
import os
import re
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv
from langchain_text_splitters import RecursiveCharacterTextSplitter
from mistralai.client import Mistral
from pymongo import MongoClient

# Windows consoles default to a codepage that mangles the em dashes used below; UTF-8 output is safe everywhere
# else. sys.stdout is really a TextIOWrapper at runtime, which has .reconfigure() even though the stdlib stub for
# the generic TextIO type it's annotated as doesn't declare that method.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")  # pyright: ignore[reportAttributeAccessIssue]

load_dotenv()

# ─────────────────────────── Constants ────────────────────────────────────────

DOCS_DIR = "./rag-supply"

MONGO_URL        = os.getenv("MONGO_URL")
MONGO_DB_NAME    = os.getenv("MONGO_DB_NAME", "rag")
MONGO_COLLECTION = os.getenv("MONGO_COLLECTION", "chunked_data")

MISTRAL_API_KEY    = os.getenv("MISTRAL_API_KEY")
MISTRAL_EMBED_MODEL = os.getenv("MISTRAL_EMBED_MODEL", "mistral-embed")
EMBED_BATCH_SIZE    = 32  # chunks per embeddings.create call

# Same chunking as rag_console.py, so retrieval behaves consistently across both indexes.
CHUNK_SIZE    = 1024
CHUNK_OVERLAP = 150

# ─────────────────────────── Text Preprocessing (same as rag_console.py) ──────

def clean_wikilinks(text: str) -> str:
    """Replace [[file.pdf|Display Text]] with Display Text.
    Replace [[file.pdf]] with file.pdf (no pipe variant).
    Replace [Display Text](https://...) with Display Text.
    """
    text = re.sub(r'\[\[[^\[\]]*?\|([^\[\]]*?)\]\]', r'\1', text)
    text = re.sub(r'\[\[([^\[\]]*?)\]\]', r'\1', text)
    text = re.sub(r'\[([^\[\]]*?)\]\(https?://[^\)]*\)', r'\1', text)
    return text


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_md_files(folder: str) -> list[dict]:
    docs = []
    if not os.path.isdir(folder):
        print(f"[WARNING] docs directory not found: {folder}")
        return docs

    for fname in os.listdir(folder):
        if not fname.lower().endswith(".md"):
            continue
        fpath = os.path.join(folder, fname)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                raw = f.read()
            content = clean_wikilinks(raw).strip()
            if not content:
                continue
            name = os.path.splitext(fname)[0]
            docs.append({
                "name": name,
                "content": content,
                "hash": sha256(content),
            })
        except Exception as e:
            print(f"[ERROR] reading {fname}: {e}")
    return docs


# ─────────────────────────── Embedding ─────────────────────────────────────────

def embed_texts(client: Mistral, texts: list[str]) -> list[list[float]]:
    """Embeds `texts` in batches of EMBED_BATCH_SIZE, preserving order."""
    embeddings: list[list[float]] = []
    for start in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[start:start + EMBED_BATCH_SIZE]
        response = client.embeddings.create(model=MISTRAL_EMBED_MODEL, inputs=batch)
        for item in response.data:
            if not item.embedding:
                raise RuntimeError("Mistral returned an empty embedding for one of the chunks")
            embeddings.append(item.embedding)
    return embeddings


# ─────────────────────────── Index Building ────────────────────────────────────

def _existing_hashes(collection) -> dict[str, str]:
    """Return {title: content_hash} from stored documents. Chunks with no content_hash (indexed by some
    other process, e.g. before this script existed) are left out, so their file is treated as unseen —
    if a matching file exists in DOCS_DIR it gets re-embedded once, which backfills the hash going forward.
    """
    seen: dict[str, str] = {}
    cursor = collection.find(
        {"content_hash": {"$exists": True}},
        {"title": 1, "content_hash": 1},
    )
    for doc in cursor:
        title = doc.get("title")
        content_hash = doc.get("content_hash")
        if title and content_hash and title not in seen:
            seen[title] = content_hash
    return seen


def build_index(docs: list[dict], collection, embed_client: Mistral, *, dry_run: bool, prune: bool) -> None:
    splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
    existing = _existing_hashes(collection)

    current_names = {doc["name"] for doc in docs}
    all_titles = collection.distinct("title")
    stale_titles = [title for title in all_titles if title not in current_names]

    deleted_count = 0
    if stale_titles:
        action = "[WOULD DELETE]" if dry_run or not prune else "[DELETED]"
        for title in stale_titles:
            print(f"  {action} {title}")
        if prune and not dry_run:
            result = collection.delete_many({"title": {"$in": stale_titles}})
            deleted_count = result.deleted_count
        elif prune:
            deleted_count = len(stale_titles)  # dry-run estimate (by title, not chunk count)
        elif stale_titles:
            print(
                f"  ({len(stale_titles)} file(s) no longer in {DOCS_DIR} were left untouched in MongoDB — "
                "pass --prune to remove them)"
            )

    new_count = updated_count = skipped_count = 0

    for doc in docs:
        name, content, content_hash = doc["name"], doc["content"], doc["hash"]

        if name in existing:
            if existing[name] == content_hash:
                skipped_count += 1
                continue
            updated_count += 1
        else:
            new_count += 1

        chunks = splitter.split_text(content)
        if not chunks:
            continue

        label = "[NEW]" if name not in existing else "[UPDATED]"
        if dry_run:
            print(f"  {label} {name}  ({len(chunks)} chunks, not written — dry run)")
            continue

        collection.delete_many({"title": name})  # no-op for genuinely new files

        embeddings = embed_texts(embed_client, chunks)
        now = datetime.now(timezone.utc)
        documents = [
            {
                "text": chunk,
                "embedding": embedding,
                "title": name,
                "chunk_index": i,
                "chunk_size": len(chunk),
                "content_hash": content_hash,
                "updated_at": now,
            }
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
        ]
        collection.insert_many(documents)
        print(f"  {label} {name}  ({len(chunks)} chunks)")

    summary = f"{new_count} new, {updated_count} updated, {skipped_count} unchanged, {deleted_count} deleted"
    print(f"\n{'[DRY RUN] Would index' if dry_run else 'Index ready'} — {summary}.")


# ─────────────────────────── Entry Point ───────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Show what would change; write nothing.")
    parser.add_argument("--prune", action="store_true", help="Delete chunks for files no longer in DOCS_DIR.")
    args = parser.parse_args()

    if not MONGO_URL:
        sys.exit("MONGO_URL is not set (add it to .env).")
    if not MISTRAL_API_KEY:
        sys.exit("MISTRAL_API_KEY is not set (add it to .env).")

    print("=== Mongo Vector Index Updater ===")
    print(f"Docs dir   : {DOCS_DIR}")
    print(f"Database   : {MONGO_DB_NAME}.{MONGO_COLLECTION}")
    print(f"Embed model: {MISTRAL_EMBED_MODEL}")
    if args.dry_run:
        print("Mode       : DRY RUN (no writes)")
    print()

    print("Loading documents...")
    docs = load_md_files(DOCS_DIR)
    print(f"Found {len(docs)} .md file(s).\n")

    mongo_client = MongoClient(MONGO_URL)
    collection = mongo_client[MONGO_DB_NAME][MONGO_COLLECTION]
    embed_client = Mistral(api_key=MISTRAL_API_KEY)

    try:
        print("Indexing documents...")
        build_index(docs, collection, embed_client, dry_run=args.dry_run, prune=args.prune)
        print(f"\nTotal chunks in index: {collection.count_documents({})}")
    finally:
        mongo_client.close()


if __name__ == "__main__":
    main()
