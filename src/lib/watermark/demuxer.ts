/**
 * demuxer.ts — Extract raw video samples from an MP4 container via mp4box.
 */

import { createFile, DataStream, Endianness } from 'mp4box';
import type { DemuxedVideo } from './types';

export function demuxMP4(arrayBuffer: ArrayBuffer): Promise<DemuxedVideo> {
  return new Promise((resolve, reject) => {
    const mp4    = createFile();
    let vtrack: any = null;
    const samples: any[] = [];

    mp4.onError   = (e: any)  => reject(new Error(`mp4box: ${e}`));
    mp4.onReady   = (info: any) => {
      vtrack = info.tracks.find((t: any) => t.video);
      if (!vtrack) { reject(new Error('No video track found.')); return; }
      mp4.setExtractionOptions(vtrack.id, null, { nbSamples: vtrack.nb_samples });
      mp4.start();
    };
    mp4.onSamples = (id: any, _r: any, s: any[]) => {
      if (id === vtrack?.id) samples.push(...s);
    };

    try {
      const buf = arrayBuffer as any;
      buf.fileStart = 0;
      mp4.appendBuffer(buf);
      mp4.flush();
    } catch (err) { reject(err); return; }

    // mp4box fires onSamples synchronously after flush; settle with a microtask gap
    setTimeout(() => {
      if (!vtrack || samples.length === 0) {
        reject(new Error('No video samples extracted.')); return;
      }

      // Extract codec description box (avcC / hvcC / …) for VideoDecoder
      let description: Uint8Array | undefined;
      try {
        const entry = mp4.getTrackById(vtrack.id).mdia.minf.stbl.stsd.entries[0] as any;
        const box   = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C ||
          entry.boxes?.find((b: any) => ['avcC','hvcC','vpcC','av1C'].includes(b.type));
        if (box) {
          const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
          box.write(stream);
          description = new Uint8Array(stream.buffer, 8);
        }
      } catch { /* codec description is optional */ }

      resolve({
        codec      : vtrack.codec,
        width      : vtrack.video_width,
        height     : vtrack.video_height,
        description,
        samples,
      });
    }, 50);
  });
}
