"""Transliteration module for Nightingale.

Converts transcript text from native scripts (Urdu, Hindi, Arabic, etc.)
to romanized (Latin) representations while preserving word-level timing.

Two backends:
  1. **OpenAI** (when an API key is supplied) — context-aware, produces natural
     phonetic romanization with correct vowels (ideal for Urdu, Hindi, Arabic).
  2. **unidecode** (fallback) — fast character-by-character mapping.  Works well
     for scripts that encode vowels (Devanagari, Cyrillic, CJK) but struggles
     with abjad scripts like Arabic/Urdu where vowels are implicit.
"""

import json
import os
import re
import sys
import unicodedata


# ── Helpers ───────────────────────────────────────────────────────────

def _has_non_latin(text: str) -> bool:
    """Check if text contains non-Latin script characters."""
    for ch in text:
        if ch.isalpha():
            try:
                name = unicodedata.name(ch, "")
            except ValueError:
                name = ""
            cat = unicodedata.category(ch)
            if "LATIN" not in name and cat.startswith("L"):
                return True
    return False


def needs_transliteration(transcript: dict) -> bool:
    """Check if a transcript contains non-Latin script that would benefit
    from romanization."""
    for seg in transcript.get("segments", []):
        if _has_non_latin(seg.get("text", "")):
            return True
    return False


# ── unidecode backend (fallback) ─────────────────────────────────────

def _transliterate_text_unidecode(text: str) -> str:
    """Character-by-character transliteration via unidecode."""
    try:
        from unidecode import unidecode
        result = unidecode(text)
    except ImportError:
        normalized = unicodedata.normalize("NFKD", text)
        result = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", result).strip()


# ── OpenAI backend ───────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a phonetic romanization engine for karaoke lyrics.

Rules:
- Convert the lyrics from their native script into Latin/Roman characters
  that a singer can read aloud to match the original pronunciation.
- Output ONLY the romanized text — no explanations, notes, or commentary.
- Preserve line breaks exactly as given (one input line → one output line).
- Use simple, intuitive English-style spelling so a non-native speaker can
  pronounce the words correctly (e.g. "main tumhare saath hoon" not
  "mn tmhʼr sʼth hwn").
- For Urdu/Hindi: always include vowels (a, e, i, o, u) even when they are
  not explicitly written in the original script.
- Keep English words already in Latin script unchanged.
- Do not add punctuation that was not in the original.
"""

# How many segment texts to send per API call (balances cost vs. context).
_BATCH_SIZE = 40


def _openai_romanize_batch(texts: list[str], language: str, api_key: str) -> list[str]:
    """Send a batch of text lines to OpenAI and get romanized versions back.

    Uses stdlib urllib so we don't need the openai pip package.
    """
    import urllib.request
    import urllib.error

    numbered = "\n".join(f"{i+1}|{t}" for i, t in enumerate(texts))
    user_msg = (
        f"Language: {language or 'auto-detect'}\n\n"
        f"Romanize each numbered line.  Return ONLY the numbered lines in "
        f"the same format (number|romanized text), nothing else.\n\n"
        f"{numbered}"
    )

    body = json.dumps({
        "model": "gpt-4o-mini",
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
    }).encode()

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode(errors="replace")
        raise RuntimeError(f"OpenAI API error {e.code}: {err_body}") from e

    reply = result["choices"][0]["message"]["content"].strip()

    # Parse numbered lines back
    mapping: dict[int, str] = {}
    for line in reply.splitlines():
        line = line.strip()
        if not line:
            continue
        if "|" in line:
            idx_str, text = line.split("|", 1)
            try:
                mapping[int(idx_str.strip())] = text.strip()
            except ValueError:
                pass

    # Rebuild in order, falling back to unidecode for any missing lines
    out = []
    for i, original in enumerate(texts):
        if (i + 1) in mapping:
            out.append(mapping[i + 1])
        else:
            out.append(_transliterate_text_unidecode(original))
    return out


def _transliterate_transcript_openai(transcript: dict, api_key: str) -> dict:
    """Transliterate a full transcript using OpenAI, preserving timing."""
    language = transcript.get("language", "")
    segments = transcript.get("segments", [])

    # Collect segment texts
    seg_texts = [seg.get("text", "") for seg in segments]

    # Romanize in batches
    romanized_texts: list[str] = []
    for start in range(0, len(seg_texts), _BATCH_SIZE):
        batch = seg_texts[start:start + _BATCH_SIZE]
        batch_result = _openai_romanize_batch(batch, language, api_key)
        romanized_texts.extend(batch_result)
        print(
            f"[nightingale:LOG] OpenAI batch {start // _BATCH_SIZE + 1}: "
            f"romanized {len(batch)} segments",
            flush=True,
        )

    # Build new transcript with romanized texts
    new_transcript = dict(transcript)
    new_segments = []
    for i, seg in enumerate(segments):
        new_seg = dict(seg)
        roman_text = romanized_texts[i] if i < len(romanized_texts) else seg.get("text", "")
        new_seg["text"] = roman_text

        # For words: try to split the romanized text to match word count,
        # otherwise fall back to unidecode per word.
        original_words = seg.get("words", [])
        if original_words:
            roman_tokens = roman_text.split()
            if len(roman_tokens) == len(original_words):
                # Perfect alignment — map each token to its word slot
                new_words = []
                for w, tok in zip(original_words, roman_tokens):
                    nw = dict(w)
                    nw["word"] = tok
                    new_words.append(nw)
            else:
                # Counts differ — fall back to unidecode for individual words
                new_words = []
                for w in original_words:
                    nw = dict(w)
                    nw["word"] = _transliterate_text_unidecode(w.get("word", ""))
                    new_words.append(nw)
            new_seg["words"] = new_words
        new_segments.append(new_seg)

    new_transcript["segments"] = new_segments
    new_transcript["script"] = "roman"
    if language:
        new_transcript["original_language"] = language
    return new_transcript


# ── unidecode-only transcript transliteration ────────────────────────

def _transliterate_transcript_unidecode(transcript: dict) -> dict:
    """Transliterate an entire transcript using unidecode (fallback)."""
    new_transcript = dict(transcript)
    new_segments = []
    for seg in transcript.get("segments", []):
        new_seg = dict(seg)
        new_seg["text"] = _transliterate_text_unidecode(seg.get("text", ""))
        new_seg["words"] = [
            {**w, "word": _transliterate_text_unidecode(w.get("word", ""))}
            for w in seg.get("words", [])
        ]
        new_segments.append(new_seg)
    new_transcript["segments"] = new_segments
    new_transcript["script"] = "roman"
    lang = transcript.get("language", "")
    if lang:
        new_transcript["original_language"] = lang
    return new_transcript


# ── Public API ───────────────────────────────────────────────────────

def generate_romanized_transcript(
    source_path: str,
    dest_path: str,
    api_key: str | None = None,
) -> bool:
    """Read a transcript JSON, generate its romanized version, and save it.

    Args:
        source_path: Path to the original transcript JSON.
        dest_path: Path where the romanized transcript will be written.
        api_key: Optional OpenAI API key.  When provided, uses GPT for
                 high-quality phonetic romanization; otherwise uses unidecode.

    Returns:
        True if romanized transcript was generated, False if not needed.
    """
    with open(source_path, "r", encoding="utf-8") as f:
        transcript = json.load(f)

    if not needs_transliteration(transcript):
        print(
            "[nightingale:LOG] Transcript is already in Latin script, "
            "skipping transliteration",
            flush=True,
        )
        return False

    if api_key:
        print("[nightingale:LOG] Using OpenAI for romanization...", flush=True)
        try:
            romanized = _transliterate_transcript_openai(transcript, api_key)
        except Exception as e:
            print(
                f"[nightingale:LOG] OpenAI failed ({e}), falling back to unidecode",
                flush=True,
            )
            romanized = _transliterate_transcript_unidecode(transcript)
    else:
        print("[nightingale:LOG] Using unidecode for romanization", flush=True)
        romanized = _transliterate_transcript_unidecode(transcript)

    # Overwrite any existing file to allow regeneration with a different backend
    with open(dest_path, "w", encoding="utf-8") as f:
        json.dump(romanized, f, ensure_ascii=False, indent=2)

    seg_count = len(romanized.get("segments", []))
    backend = "OpenAI" if api_key else "unidecode"
    print(
        f"[nightingale:LOG] Romanized transcript saved ({seg_count} segments, {backend})",
        flush=True,
    )
    return True
