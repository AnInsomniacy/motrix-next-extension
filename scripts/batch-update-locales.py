#!/usr/bin/env python3
"""Batch-update Chrome i18n locale files with native translations.

Usage:
    1. Fill in the TRANSLATIONS dict below with all 26 locale values.
    2. Set KEY_NAME, DESCRIPTION, and optionally PLACEHOLDERS.
    3. Run: python3 scripts/batch-update-locales.py
    4. Run: pnpm lint:i18n   (to verify consistency)

This script inserts or updates a single key across all 26 locale files
atomically, ensuring no locale is missed. It preserves existing keys
and maintains sorted JSON output for clean diffs.

For keys with placeholders, set PLACEHOLDERS to a dict like:
    {"speed": {"content": "$1", "example": "10 MB/s"}}
"""
import json
import os
import sys

LOCALES_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "_locales")

# ─── Configuration ──────────────────────────────────────
# Edit these values before each run.

KEY_NAME = "example_key"
DESCRIPTION = "Description for translators"

# Set to None for keys without placeholders.
# For keys with placeholders, use:
#   {"placeholder_name": {"content": "$1", "example": "value"}}
PLACEHOLDERS = None

# All 26 locales must have an entry. No exceptions.
TRANSLATIONS = {
    "ar": "Arabic text here",
    "bg": "Bulgarian text here",
    "ca": "Catalan text here",
    "de": "German text here",
    "el": "Greek text here",
    "en": "English text here",
    "es": "Spanish text here",
    "fa": "Persian text here",
    "fr": "French text here",
    "hu": "Hungarian text here",
    "id": "Indonesian text here",
    "it": "Italian text here",
    "ja": "Japanese text here",
    "ko": "Korean text here",
    "nb": "Norwegian Bokmål text here",
    "nl": "Dutch text here",
    "pl": "Polish text here",
    "pt_BR": "Portuguese (Brazil) text here",
    "ro": "Romanian text here",
    "ru": "Russian text here",
    "th": "Thai text here",
    "tr": "Turkish text here",
    "uk": "Ukrainian text here",
    "vi": "Vietnamese text here",
    "zh_CN": "Simplified Chinese text here",
    "zh_TW": "Traditional Chinese text here",
}

EXPECTED_LOCALES = sorted([
    "ar", "bg", "ca", "de", "el", "en", "es", "fa", "fr", "hu",
    "id", "it", "ja", "ko", "nb", "nl", "pl", "pt_BR", "ro", "ru",
    "th", "tr", "uk", "vi", "zh_CN", "zh_TW",
])


def validate_config():
    """Validate configuration before running."""
    if KEY_NAME == "example_key":
        print("❌ ERROR: Set KEY_NAME to the actual key name before running.")
        sys.exit(1)

    provided = sorted(TRANSLATIONS.keys())
    if provided != EXPECTED_LOCALES:
        missing = set(EXPECTED_LOCALES) - set(provided)
        extra = set(provided) - set(EXPECTED_LOCALES)
        if missing:
            print(f"❌ ERROR: Missing locales in TRANSLATIONS: {missing}")
        if extra:
            print(f"❌ ERROR: Unknown locales in TRANSLATIONS: {extra}")
        sys.exit(1)

    for locale, text in TRANSLATIONS.items():
        if not text or text.endswith("text here"):
            print(f"❌ ERROR: Locale '{locale}' still has placeholder text: \"{text}\"")
            sys.exit(1)


def build_entry(message):
    """Build a Chrome i18n message entry."""
    entry = {
        "message": message,
        "description": DESCRIPTION,
    }
    if PLACEHOLDERS:
        entry["placeholders"] = PLACEHOLDERS
    return entry


def update_locale(locale, message):
    """Insert or update a key in a single locale's messages.json."""
    filepath = os.path.join(LOCALES_DIR, locale, "messages.json")

    if not os.path.isfile(filepath):
        print(f"❌ ERROR: File not found: {filepath}")
        sys.exit(1)

    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    action = "updated" if KEY_NAME in data else "added"
    data[KEY_NAME] = build_entry(message)

    # Write back with consistent formatting (2-space indent, no trailing newline issues)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    return action


def main():
    validate_config()

    print(f"📝 Batch updating key: \"{KEY_NAME}\"")
    print(f"   Description: \"{DESCRIPTION}\"")
    print(f"   Placeholders: {PLACEHOLDERS or 'None'}")
    print()

    for locale in EXPECTED_LOCALES:
        message = TRANSLATIONS[locale]
        action = update_locale(locale, message)
        print(f"  ✅ {locale}: {action} → \"{message}\"")

    print()
    print(f"✅ Done — {len(EXPECTED_LOCALES)} locales updated.")
    print("   Next: run `pnpm lint:i18n` to verify consistency.")


if __name__ == "__main__":
    main()
