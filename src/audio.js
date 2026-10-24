export class WoodlandAudio {
  constructor() {
    this.enabled = false;
    this.context = null;
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        this.enabled = false;
        return false;
      }
      this.context ??= new AudioContext();
      this.context.resume().catch(() => {});
      this.play('pickup');
    }
    return this.enabled;
  }

  play(name) {
    if (!this.enabled || !this.context || this.context.state !== 'running')
      return;
    const notes =
      {
        pickup: [
          [659, 0, 0.09],
          [880, 0.07, 0.13],
        ],
        bury: [
          [330, 0, 0.08],
          [440, 0.07, 0.1],
          [554, 0.15, 0.15],
        ],
        drop: [
          [1047, 0, 0.1],
          [784, 0.08, 0.14],
        ],
        tick: [[440, 0, 0.05]],
        go: [
          [523, 0, 0.09],
          [659, 0.09, 0.09],
          [784, 0.18, 0.16],
        ],
        finish: [
          [523, 0, 0.15],
          [659, 0.15, 0.15],
          [784, 0.3, 0.15],
          [1047, 0.45, 0.3],
        ],
      }[name] ?? [];
    for (const [frequency, offset, duration] of notes) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const start = this.context.currentTime + offset;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.045, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }
  }
}
