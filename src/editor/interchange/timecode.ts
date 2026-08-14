const isDropFrameRate = (fps: number) => Math.abs(fps - 29.97) < 0.02 || Math.abs(fps - 59.94) < 0.02;

export const nominalTimebase = (fps: number) => Math.max(1, Math.round(fps));

export const supportsDropFrame = (fps: number) => isDropFrameRate(fps);

export const framesToTimecode = (inputFrame: number, fps: number, requestedDropFrame = false) => {
  const timebase = nominalTimebase(fps);
  const dropFrame = requestedDropFrame && isDropFrameRate(fps);
  let frame = Math.max(0, Math.round(inputFrame));

  if (dropFrame) {
    const droppedPerMinute = timebase === 60 ? 4 : 2;
    const framesPerTenMinutes = timebase * 60 * 10 - droppedPerMinute * 9;
    const framesPerMinute = timebase * 60 - droppedPerMinute;
    frame %= framesPerTenMinutes * 6 * 24;
    const tenMinuteBlocks = Math.floor(frame / framesPerTenMinutes);
    const remaining = frame % framesPerTenMinutes;
    frame += droppedPerMinute * 9 * tenMinuteBlocks;
    if (remaining >= droppedPerMinute) {
      frame += droppedPerMinute * Math.floor((remaining - droppedPerMinute) / framesPerMinute);
    }
  }

  const frames = frame % timebase;
  const totalSeconds = Math.floor(frame / timebase);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const separator = dropFrame ? ";" : ":";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(frames).padStart(2, "0")}`;
};
