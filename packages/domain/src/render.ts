export const RENDER_IR_VERSION = 1;

export interface RenderVideoLayer {
  id: string;
  clipIds: string[];
}

export interface RenderAudioLayer {
  id: string;
  clipIds: string[];
}

export interface RenderCaptionLayer {
  id: string;
  templateId: string;
}

export interface RenderIRV1 {
  version: typeof RENDER_IR_VERSION;
  videoLayers: RenderVideoLayer[];
  audioLayers: RenderAudioLayer[];
  captionLayers: RenderCaptionLayer[];
}

export function createEmptyRenderIR(): RenderIRV1 {
  return {
    version: RENDER_IR_VERSION,
    videoLayers: [],
    audioLayers: [],
    captionLayers: []
  };
}
