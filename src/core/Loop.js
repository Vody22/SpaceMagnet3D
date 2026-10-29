// Fixed-timestep accumulator: simulation speed is independent of the display refresh rate.
export class FixedStep {
  constructor(step, maxSteps = 6) {
    this.step = step;
    this.maxSteps = maxSteps;
    this.acc = 0;
  }

  // Returns how many fixed steps to run for this frame; `alpha` is the interpolation factor.
  advance(frameDt) {
    this.acc += Math.min(frameDt, this.step * this.maxSteps);
    let steps = 0;
    while (this.acc >= this.step && steps < this.maxSteps) {
      this.acc -= this.step;
      steps++;
    }
    if (steps === this.maxSteps) this.acc = Math.min(this.acc, this.step);
    this.alpha = this.acc / this.step;
    return steps;
  }
}

export function startLoop(stepper, update, render) {
  let last = performance.now();
  let running = true;
  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    const steps = stepper.advance(dt);
    for (let i = 0; i < steps; i++) update(stepper.step);
    render(stepper.alpha, dt);
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
  });
  requestAnimationFrame(frame);
  return () => {
    running = false;
  };
}
