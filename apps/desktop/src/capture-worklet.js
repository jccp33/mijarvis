class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.samples = new Float32Array(2048); this.count = 0;
    this.port.onmessage = ({ data }) => {
      if (data !== 'flush') return;
      if (this.count) {
        const tail = this.samples.slice(0, this.count);
        this.port.postMessage(tail, [tail.buffer]); this.count = 0;
      }
      this.port.postMessage({ type: 'flushed' });
    };
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let index = 0; index < channels[0].length; index++) {
      let value = 0;
      for (const channel of channels) value += channel[index] || 0;
      this.samples[this.count++] = value / channels.length;
      if (this.count === this.samples.length) {
        this.port.postMessage(this.samples, [this.samples.buffer]);
        this.samples = new Float32Array(2048); this.count = 0;
      }
    }
    return true;
  }
}
registerProcessor('mijarvis-capture', CaptureProcessor);
