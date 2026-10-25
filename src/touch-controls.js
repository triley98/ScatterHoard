/** Independent pointer capture lets a thumb steer while another finger digs. */
export class TouchControls {
  constructor(element, { canMove, dig }) {
    this.vectors = [{ x: 0, z: 0 }, { x: 0, z: 0 }];
    this.sticks = [...element.querySelectorAll('[data-joystick]')].map(surface => {
      const id = Number(surface.dataset.joystick);
      const stick = { surface, id, pointer: null };
      const move = event => {
        if (event.pointerId !== stick.pointer) return;
        event.preventDefault();
        if (!canMove(id)) return this.release(stick);
        const rect = surface.getBoundingClientRect();
        const radius = rect.width * 0.32;
        const dx = event.clientX - rect.left - rect.width / 2;
        const dz = event.clientY - rect.top - rect.height / 2;
        const distance = Math.hypot(dx, dz);
        const travel = Math.min(distance, radius);
        const strength = Math.max(0, (travel / radius - 0.12) / 0.88);
        this.vectors[id] = distance ? { x: dx / distance * strength, z: dz / distance * strength } : { x: 0, z: 0 };
        surface.style.setProperty('--stick-x', `${distance ? dx / distance * travel : 0}px`);
        surface.style.setProperty('--stick-y', `${distance ? dz / distance * travel : 0}px`);
      };
      surface.addEventListener('pointerdown', event => {
        event.preventDefault();
        if (stick.pointer !== null || !canMove(id)) return;
        stick.pointer = event.pointerId;
        surface.setPointerCapture(event.pointerId);
        surface.classList.add('engaged');
        move(event);
      });
      surface.addEventListener('pointermove', move);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
        surface.addEventListener(type, event => {
          if (event.pointerId === stick.pointer) this.release(stick);
        });
      return stick;
    });
    for (const button of element.querySelectorAll('[data-bury]'))
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        const id = Number(button.dataset.bury);
        if (canMove(id)) dig(id);
      });
  }

  release(stick) {
    const pointer = stick.pointer;
    stick.pointer = null;
    this.vectors[stick.id] = { x: 0, z: 0 };
    stick.surface.classList.remove('engaged');
    stick.surface.style.removeProperty('--stick-x');
    stick.surface.style.removeProperty('--stick-y');
    if (pointer !== null && stick.surface.hasPointerCapture(pointer))
      stick.surface.releasePointerCapture(pointer);
  }

  reset() {
    this.sticks.forEach(stick => this.release(stick));
  }
}
