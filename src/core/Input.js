// Unified input: keyboard (WASD / arrows), mouse (hold to fly toward cursor) and a
// floating touch joystick. Produces a world-space direction on the XZ plane.

const KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export class Input {
  constructor(canvas, joystickEl) {
    this.canvas = canvas;
    this.down = new Set();
    this.mouseActive = false;
    this.mouseNdc = { x: 0, y: 0 };
    this.touchId = null;
    this.touchOrigin = { x: 0, y: 0 };
    this.touchVec = { x: 0, y: 0 };
    this.joy = joystickEl;
    this.joyKnob = joystickEl.querySelector('.knob');
    this.listeners = new Set();
    this.lastDevice = 'keyboard';
    this.dashQueued = false;
    this.padDashHeld = false;

    window.addEventListener('keydown', (e) => {
      if (KEYS[e.code]) { this.down.add(e.code); e.preventDefault(); this.lastDevice = 'keyboard'; }
      if ((e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) { this.dashQueued = true; e.preventDefault(); }
      this.emit(e);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); this.mouseActive = false; });

    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onAny(fn) { this.listeners.add(fn); }

  queueDash() { this.dashQueued = true; }

  // Dash is an edge-triggered action: report it once, then clear.
  takeDash() {
    const d = this.dashQueued;
    this.dashQueued = false;
    return d;
  }

  readGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && Array.from(pads).find((p) => p && p.connected);
    if (!pad) return null;
    const a = pad.buttons[0] && pad.buttons[0].pressed;
    if (a && !this.padDashHeld) this.dashQueued = true;
    this.padDashHeld = a;
    let x = pad.axes[0] || 0, z = pad.axes[1] || 0;
    const l = Math.hypot(x, z);
    if (l < 0.2) return null;
    this.lastDevice = 'gamepad';
    const k = Math.min(1, (l - 0.2) / 0.7) / l;
    return { x: x * k, z: z * k };
  }
  emit(e) { for (const fn of this.listeners) fn(e); }

  setNdc(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouseNdc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.mouseNdc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  onPointerDown(e) {
    this.emit(e);
    if (e.pointerType === 'touch') {
      if (this.touchId !== null) return;
      this.touchId = e.pointerId;
      this.touchOrigin.x = e.clientX;
      this.touchOrigin.y = e.clientY;
      this.touchVec.x = this.touchVec.y = 0;
      this.lastDevice = 'touch';
      this.joy.style.display = 'block';
      this.joy.style.left = `${e.clientX}px`;
      this.joy.style.top = `${e.clientY}px`;
      this.joyKnob.style.transform = 'translate(-50%, -50%)';
    } else if (e.button === 2) {
      this.dashQueued = true;
    } else if (e.button === 0) {
      this.mouseActive = true;
      this.lastDevice = 'mouse';
      this.setNdc(e);
    }
  }

  onPointerMove(e) {
    if (e.pointerType === 'touch') {
      if (e.pointerId !== this.touchId) return;
      const max = 60;
      let dx = e.clientX - this.touchOrigin.x;
      let dy = e.clientY - this.touchOrigin.y;
      const l = Math.hypot(dx, dy);
      if (l > max) { dx *= max / l; dy *= max / l; }
      this.touchVec.x = dx / max;
      this.touchVec.y = dy / max;
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else {
      this.setNdc(e);
    }
  }

  onPointerUp(e) {
    if (e.pointerType === 'touch') {
      if (e.pointerId !== this.touchId) return;
      this.touchId = null;
      this.touchVec.x = this.touchVec.y = 0;
      this.joy.style.display = 'none';
    } else {
      this.mouseActive = false;
    }
  }

  // `shipScreen(ndc)` lets the mouse steer toward the cursor relative to the ship on screen.
  read(shipNdc, aspect) {
    let x = 0, z = 0;
    for (const code of this.down) { x += KEYS[code][0]; z += KEYS[code][1]; }
    const dash = this.takeDash();
    if (x || z) {
      const l = Math.hypot(x, z);
      return { x: x / l, z: z / l, dash };
    }
    const pad = this.readGamepad();
    if (pad) return { ...pad, dash: dash || this.takeDash() };
    const padDash = this.takeDash();
    if (this.touchId !== null) {
      const l = Math.hypot(this.touchVec.x, this.touchVec.y);
      if (l < 0.15) return { x: 0, z: 0, dash: dash || padDash };
      return { x: this.touchVec.x, z: this.touchVec.y, dash: dash || padDash };
    }
    if (this.mouseActive && shipNdc) {
      const dx = (this.mouseNdc.x - shipNdc.x) * aspect;
      const dy = -(this.mouseNdc.y - shipNdc.y);
      const l = Math.hypot(dx, dy);
      if (l < 0.03) return { x: 0, z: 0, dash: dash || padDash };
      const mag = Math.min(1, l / 0.25);
      return { x: (dx / l) * mag, z: (dy / l) * mag, dash: dash || padDash };
    }
    return { x: 0, z: 0, dash: dash || padDash };
  }
}
