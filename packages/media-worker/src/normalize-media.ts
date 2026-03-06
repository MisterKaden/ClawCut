import type {
  AudioStreamInfo,
  GenericStreamInfo,
  MediaMetadataSummary,
  MediaStreamInfo,
  SubtitleStreamInfo,
  VideoStreamInfo
} from "@clawcut/domain";
import type { MediaProbeResult, MediaStreamSummary } from "@clawcut/ipc";

function mapStream(stream: MediaStreamSummary): MediaStreamInfo {
  switch (stream.codecType) {
    case "video":
      return {
        index: stream.index,
        codecType: "video",
        codecName: stream.codecName,
        durationMs: stream.durationMs,
        bitRate: stream.bitRate,
        timeBase: stream.timeBase,
        language: stream.language,
        isDefault: stream.isDefault,
        width: stream.width,
        height: stream.height,
        pixelFormat: stream.pixelFormat,
        frameRate: stream.frameRate,
        rotation: stream.rotation
      } satisfies VideoStreamInfo;
    case "audio":
      return {
        index: stream.index,
        codecType: "audio",
        codecName: stream.codecName,
        durationMs: stream.durationMs,
        bitRate: stream.bitRate,
        timeBase: stream.timeBase,
        language: stream.language,
        isDefault: stream.isDefault,
        sampleRate: stream.sampleRate,
        channelCount: stream.channels,
        channelLayout: stream.channelLayout
      } satisfies AudioStreamInfo;
    case "subtitle":
      return {
        index: stream.index,
        codecType: "subtitle",
        codecName: stream.codecName,
        durationMs: stream.durationMs,
        bitRate: stream.bitRate,
        timeBase: stream.timeBase,
        language: stream.language,
        isDefault: stream.isDefault
      } satisfies SubtitleStreamInfo;
    default:
      return {
        index: stream.index,
        codecType: stream.codecType === "data" ? "data" : "unknown",
        codecName: stream.codecName,
        durationMs: stream.durationMs,
        bitRate: stream.bitRate,
        timeBase: stream.timeBase,
        language: stream.language,
        isDefault: stream.isDefault
      } satisfies GenericStreamInfo;
  }
}

export function normalizeProbeToLibraryData(probe: MediaProbeResult): {
  metadataSummary: MediaMetadataSummary;
  streams: MediaStreamInfo[];
} {
  const streams = probe.streams.map(mapStream);

  return {
    metadataSummary: {
      kind: probe.width || probe.height || probe.videoCodec ? "video" : probe.audioCodec ? "audio" : "unknown",
      container: probe.container,
      durationMs: probe.durationMs,
      bitRate: probe.bitRate,
      hasVideo: Boolean(probe.videoCodec),
      hasAudio: Boolean(probe.audioCodec),
      width: probe.width,
      height: probe.height,
      frameRate: probe.frameRate,
      pixelFormat: probe.pixelFormat,
      rotation: probe.rotation,
      videoCodec: probe.videoCodec,
      audioCodec: probe.audioCodec,
      audioSampleRate: probe.audioSampleRate,
      channelCount: probe.channelCount,
      streamSignature: probe.streamSignature
    },
    streams
  };
}
