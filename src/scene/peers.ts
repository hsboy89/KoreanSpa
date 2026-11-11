import * as THREE from 'three';
import { Avatar } from './avatar';
import type { World } from './world';
import type { Msg, PeerState } from '../state/net';
import { isSayable, isXZ, sanitizeState } from '../state/presence';
import type { RoomId } from './rooms';

interface Remote {
  avatar: Avatar;
  state: PeerState;
  lastSeen: number;
  /** 키보드 이동 중인 사람의 보간 목표 */
  posTarget: THREE.Vector3 | null;
  posAt: number;
}

/** 다른 접속자들의 아바타를 받은 메시지대로 움직인다 */
export class Peers {
  private map = new Map<string, Remote>();

  constructor(
    private scene: THREE.Scene,
    private world: World,
    private onChange: () => void,
    private onSay: (id: string, text: string) => void,
  ) {}

  get count() { return this.map.size; }
  get(id: string) { return this.map.get(id); }
  entries() { return [...this.map.entries()]; }

  roomCount(room: RoomId | null) {
    let n = 0;
    for (const r of this.map.values()) if (r.state.room === room) n++;
    return n;
  }

  takenSeats(): Set<number> {
    const s = new Set<number>();
    for (const r of this.map.values()) if (r.state.seat !== null) s.add(r.state.seat);
    return s;
  }

  apply(m: Msg, now: number) {
    const r = this.map.get(m.id);
    switch (m.t) {
      case 'hello':
      case 'state': {
        const state = sanitizeState(m.state);
        if (!state) return;
        if (!r) { this.add(m.id, state, now); return; }
        r.lastSeen = now;
        r.state = state;
        if (state.seat !== null) { this.seat(r, state.seat); }
        else if (!r.avatar.moving && !r.posTarget) {
          const p = r.avatar.group.position;
          if (Math.hypot(p.x - state.pos[0], p.z - state.pos[1]) > 1.5) { p.set(state.pos[0], 0, state.pos[1]); r.avatar.faceYaw(state.yaw); }
          if (r.avatar.pose === 'sit') r.avatar.setPose('idle');
        }
        this.onChange();
        break;
      }
      case 'walk': {
        if (!r || !isXZ(m.from) || !Array.isArray(m.path) || m.path.length > 12 || !m.path.every(isXZ)) return;
        r.lastSeen = now; r.posTarget = null; r.state.seat = null;
        const p = r.avatar.group.position;
        if (Math.hypot(p.x - m.from[0], p.z - m.from[1]) > 2) p.set(m.from[0], 0, m.from[1]);
        p.y = 0;
        r.avatar.walkTo(m.path.map(([x, z]) => new THREE.Vector3(x, 0, z)));
        break;
      }
      case 'pos': {
        if (!r || !isXZ(m.pos) || typeof m.yaw !== 'number') return;
        r.lastSeen = now; r.avatar.stop(); r.state.seat = null;
        r.avatar.group.position.y = 0;
        r.posTarget = new THREE.Vector3(m.pos[0], 0, m.pos[1]);
        r.posAt = now;
        r.avatar.faceYaw(m.yaw);
        if (r.avatar.pose !== 'walk') r.avatar.setPose('walk');
        break;
      }
      case 'sit': {
        if (!r || typeof m.seat !== 'number' || !this.world.seats[m.seat]) return;
        r.lastSeen = now;
        this.seat(r, m.seat);
        this.onChange();
        break;
      }
      case 'stand': {
        if (!r) return;
        r.lastSeen = now; r.state.seat = null;
        r.avatar.group.position.y = 0;
        r.avatar.setPose('idle');
        this.onChange();
        break;
      }
      case 'emote':
        if (r && (m.kind === 'wave' || m.kind === 'cheers')) { r.lastSeen = now; r.avatar.play(m.kind); }
        break;
      case 'say':
        if (r && isSayable(m.text)) { r.lastSeen = now; this.onSay(m.id, m.text); }
        break;
      case 'bye':
        if (r) this.remove(m.id);
        break;
    }
  }

  update(dt: number, now: number, expireMs: number | null) {
    for (const [id, r] of this.map) {
      if (expireMs !== null && now - r.lastSeen > expireMs) { this.remove(id); continue; }
      if (r.posTarget) {
        const p = r.avatar.group.position;
        p.lerp(r.posTarget, Math.min(1, dt * 10));
        if (p.distanceTo(r.posTarget) < 0.05 && now - r.posAt > 400) { r.posTarget = null; if (r.avatar.pose === 'walk') r.avatar.setPose('idle'); }
      }
      r.avatar.update(dt);
    }
  }

  private add(id: string, state: PeerState, now: number) {
    const avatar = new Avatar(state.name, state.outfit);
    avatar.group.position.set(state.pos[0], 0, state.pos[1]);
    avatar.faceYaw(state.yaw);
    this.scene.add(avatar.group);
    const r: Remote = { avatar, state, lastSeen: now, posTarget: null, posAt: 0 };
    this.map.set(id, r);
    if (state.seat !== null) this.seat(r, state.seat);
    this.onChange();
  }

  private seat(r: Remote, index: number) {
    const seat = this.world.seats[index];
    if (!seat) return;
    r.avatar.stop(); r.posTarget = null;
    r.avatar.group.position.copy(seat.pos);
    r.avatar.faceYaw(seat.yaw);
    r.avatar.setPose('sit');
    r.state.seat = index;
    r.state.room = seat.room;
  }

  private remove(id: string) {
    const r = this.map.get(id);
    if (!r) return;
    this.scene.remove(r.avatar.group);
    this.map.delete(id);
    this.onChange();
  }
}
