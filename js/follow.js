/* ============================================================
   Follow — up to four people on camera drive the four monsters.
   One person in frame controls all four, two people get two
   monsters each, three get two/one/one and four get one each.
   Head roll, head turn, torso lean and raised arms are eased onto
   the rig, so the monsters act out what the people are doing.
   ============================================================ */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const ZERO = {
  active: false,
  tx: 0,
  ty: 0,
  tilt: 0,     // head roll, radians
  yaw: 0,      // head turn, -1..1
  lean: 0,     // torso lean, -1..1
  armL: 0,     // 0 = hanging, 1 = overhead
  armR: 0,
  energy: 0,
};

export class Choreographer {
  constructor() {
    this.drive = new Map();     // puppet → eased channels
    this.groups = [];           // [{ person, slot, of }] per monster
  }

  /**
   * Split `total` monsters between `count` people:
   * 1 → 4, 2 → 2+2, 3 → 2+1+1, 4 → 1+1+1+1.
   */
  static split(count, total = 4) {
    const n = clamp(Math.round(count), 1, total);
    const base = Math.floor(total / n);
    let extra = total % n;
    const out = [];
    for (let p = 0; p < n; p += 1) {
      const take = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
      for (let slot = 0; slot < take; slot += 1) out.push({ person: p, slot, of: take });
    }
    return out;
  }

  /**
   * One frame of direction. Puppets without a person ease back to their
   * marks and to a neutral pose, so nobody snaps when someone walks away.
   */
  update(persons, puppets, stageW, stageH, dt) {
    const people = (persons || []).slice(0, 4);
    this.groups = people.length ? Choreographer.split(people.length, puppets.length) : [];
    const k = Math.min(1, dt * 6.5);

    puppets.forEach((p, i) => {
      const cur = this.drive.get(p) || { ...ZERO };
      const group = this.groups[i];
      const person = group ? people[group.person] : null;
      const want = person ? this.target(person, p, stageW, stageH) : ZERO;

      for (const key of Object.keys(ZERO)) {
        if (key === 'active') cur.active = Boolean(person);
        else cur[key] += (want[key] - cur[key]) * k;
      }

      this.drive.set(p, cur);
      p.drivePerson = person || null;
      p.setDrive(cur);
    });
  }

  /** Turn one person's numbers into a monster's numbers. */
  target(person, p, stageW, stageH) {
    const nx = clamp(person.x / Math.max(1, stageW), 0, 1) - 0.5;
    const ny = clamp(person.y / Math.max(1, stageH), 0, 1) - 0.5;
    const amp = 0.35 + 0.65 * clamp(person.presence, 0, 1);

    return {
      active: true,
      tx: p.homeX + clamp(nx * 210, -190, 190),
      ty: p.homeY + clamp(ny * 90, -70, 90),
      tilt: clamp(person.headTilt, -0.7, 0.7) * amp,
      yaw: clamp(person.headYaw, -1, 1) * amp,
      lean: clamp(person.lean, -1, 1) * amp,
      armL: clamp(person.armL, 0, 1) * amp,
      armR: clamp(person.armR, 0, 1) * amp,
      energy: clamp(person.energy, 0, 1),
    };
  }
}
