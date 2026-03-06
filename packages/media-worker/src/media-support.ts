import { extname } from "node:path";

const SUPPORTED_VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".mkv",
  ".webm",
  ".avi"
]);

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg"
]);

export function isSupportedMediaPath(filePath: string): boolean {
  const extension = extname(filePath).toLowerCase();

  return SUPPORTED_VIDEO_EXTENSIONS.has(extension) || SUPPORTED_AUDIO_EXTENSIONS.has(extension);
}
