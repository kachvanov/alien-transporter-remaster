// Not a port. Error of readFrame(): the buffer is not a valid Frame.

export class FrameDecodeError extends Error {
  constructor(message: string) {
    super('Frame decode error: ' + message);
    this.name = 'FrameDecodeError';
  }
}
