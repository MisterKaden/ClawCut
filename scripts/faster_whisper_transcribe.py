#!/usr/bin/env python3

import argparse
import json
import sys
from pathlib import Path


def run_check() -> int:
    try:
        import faster_whisper  # type: ignore
    except Exception as exc:  # pragma: no cover
        print(str(exc), file=sys.stderr)
        return 1

    version = getattr(faster_whisper, "__version__", "faster-whisper")
    print(version)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--model", default="base")
    parser.add_argument("--language", default=None)
    parser.add_argument("--word-timestamps", default="1")
    parser.add_argument("--normalize-text", default="1")
    parser.add_argument("--initial-prompt", default=None)
    args = parser.parse_args()

    if args.check:
      return run_check()

    if not args.input or not args.output:
        parser.error("--input and --output are required unless --check is used")

    try:
        from faster_whisper import WhisperModel  # type: ignore
    except Exception as exc:  # pragma: no cover
        print(str(exc), file=sys.stderr)
        return 1

    model = WhisperModel(args.model, device="cpu")
    segments, info = model.transcribe(
        args.input,
        language=args.language,
        word_timestamps=args.word_timestamps == "1",
        initial_prompt=args.initial_prompt,
    )

    normalized_segments = []

    for segment in segments:
        words = []
        for word in getattr(segment, "words", []) or []:
            words.append(
                {
                    "word": str(getattr(word, "word", "")),
                    "start": getattr(word, "start", None),
                    "end": getattr(word, "end", None),
                    "probability": getattr(word, "probability", None),
                }
            )

        normalized_segments.append(
            {
                "start": getattr(segment, "start", 0.0),
                "end": getattr(segment, "end", 0.0),
                "text": str(getattr(segment, "text", "")).strip(),
                "avg_logprob": getattr(segment, "avg_logprob", None),
                "words": words,
            }
        )

    payload = {
        "provider": "faster-whisper",
        "model": args.model,
        "language": getattr(info, "language", args.language),
        "word_timestamps": args.word_timestamps == "1",
        "segments": normalized_segments,
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(str(output_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
