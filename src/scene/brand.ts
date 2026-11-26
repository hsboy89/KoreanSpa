import * as THREE from 'three';

const PINK = '#ff385c';
const FONT = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", sans-serif';

/** 둥근 사각형 경로 */
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** 파팅 로고 마크: 핑크 둥근 사각형 안에 파티 모자 쓴 웃는 얼굴 */
export function drawLogoMark(g: CanvasRenderingContext2D, x: number, y: number, size: number) {
  g.save();
  g.fillStyle = PINK;
  roundRect(g, x, y, size, size, size * 0.24);
  g.fill();
  g.translate(x + size / 2, y + size / 2);
  const s = size / 100;
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  // 얼굴
  g.beginPath(); g.arc(0, 8 * s, 26 * s, 0, Math.PI * 2); g.fill();
  // 눈
  g.fillStyle = PINK;
  g.beginPath(); g.arc(-9 * s, 4 * s, 3.2 * s, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(9 * s, 4 * s, 3.2 * s, 0, Math.PI * 2); g.fill();
  // 웃음
  g.lineWidth = 4 * s; g.strokeStyle = PINK;
  g.beginPath(); g.arc(0, 10 * s, 12 * s, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  // 파티 모자
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(-14 * s, -14 * s); g.lineTo(14 * s, -14 * s); g.lineTo(2 * s, -44 * s); g.closePath(); g.fill();
  g.fillStyle = PINK;
  g.beginPath(); g.arc(2 * s, -44 * s, 4.5 * s, 0, Math.PI * 2); g.fill();
  g.restore();
}

/** 벽에 거는 안내판: 로고, 카테고리 이름 */
export function makeSignTexture(category: string, tagline: string): THREE.CanvasTexture {
  const W = 1200, H = 680;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;

  g.fillStyle = '#ffffff';
  roundRect(g, 0, 0, W, H, 40); g.fill();
  g.fillStyle = PINK;
  g.fillRect(0, 0, W, 14);

  drawLogoMark(g, 70, 70, 130);
  g.fillStyle = '#1a1a1a';
  g.font = `800 92px ${FONT}`;
  g.textBaseline = 'middle';
  g.fillText('파팅', 230, 135);
  g.fillStyle = '#8a8a8a';
  g.font = `500 34px ${FONT}`;
  g.fillText('안전하고 즐거운 단체 소셜 모임 플랫폼', 70, 250);

  g.fillStyle = PINK;
  g.font = `800 76px ${FONT}`;
  g.fillText(category, 70, 390);
  g.fillStyle = '#3a3a3a';
  g.font = `500 38px ${FONT}`;
  g.fillText(tagline, 70, 460);

  g.fillStyle = '#1a1a1a';
  g.font = `700 36px ${FONT}`;
  g.fillText('이번 주 파티는 파팅에서 볼 수 있어요', 70, 585);
  g.fillStyle = '#8a8a8a';
  g.font = `500 30px ${FONT}`;
  g.fillText('parting.io', 70, 632);

  // 오른쪽 큰 로고
  const qx = W - 70 - 400, qy = 140, qs = 400;
  g.fillStyle = '#fff0f3';
  roundRect(g, qx, qy, qs, qs, 48); g.fill();
  drawLogoMark(g, qx + 60, qy + 60, qs - 120);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** 문 위 명패 */
export function makeDoorPlate(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 900; c.height = 220;
  const g = c.getContext('2d')!;
  g.fillStyle = PINK;
  roundRect(g, 0, 0, 900, 220, 48); g.fill();
  g.fillStyle = '#ffffff';
  g.font = `800 96px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 450, 116);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 광장 기둥용 로고 면 */
export function makeTotemFace(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 1024);
  drawLogoMark(g, 106, 120, 300);
  g.fillStyle = '#1a1a1a';
  g.font = `800 150px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('파팅', 256, 600);
  g.fillStyle = '#8a8a8a';
  g.font = `500 44px ${FONT}`;
  g.fillText('parting.io', 256, 720);
  g.fillStyle = PINK;
  g.fillRect(0, 980, 512, 44);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 책장 등에 쓰는 단색 띠 텍스처 */
export function makeStripesTexture(colors: string[], vertical = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  const n = colors.length;
  colors.forEach((col, i) => {
    g.fillStyle = col;
    if (vertical) g.fillRect((i / n) * 256, 0, 256 / n - 2, 256);
    else g.fillRect(0, (i / n) * 256, 256, 256 / n - 2);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 내용이 바뀌는 캔버스 텍스처 */
export interface LiveTexture<A extends unknown[]> { tex: THREE.CanvasTexture; set(...args: A): void }

function live<A extends unknown[]>(w: number, h: number, draw: (g: CanvasRenderingContext2D, ...args: A) => void): LiveTexture<A> {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, set: (...args: A) => { g.clearRect(0, 0, w, h); draw(g, ...args); tex.needsUpdate = true; } };
}

const fmt = (n: number) => n.toLocaleString('ko-KR');

/** 광장 기둥 위 전광판: 누적 방문과 오늘 방문 */
export function makeCounterBoard(): LiveTexture<[number, number]> {
  return live(768, 320, (g, visits, today) => {
    g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, 768, 320);
    g.fillStyle = PINK; g.fillRect(0, 0, 768, 12);
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = '#ff8ca3'; g.font = `700 46px ${FONT}`;
    g.fillText('누적 방문', 44, 74);
    g.fillStyle = '#ffffff'; g.font = `800 132px ${FONT}`;
    g.fillText(fmt(visits), 40, 186);
    g.textAlign = 'right';
    g.fillStyle = '#ffd166'; g.font = `700 46px ${FONT}`;
    g.fillText(`오늘 ${fmt(today)}명`, 728, 276);
  });
}

/** 방 안내판 옆: 이 파티가 열리면 가겠다고 누른 수 */
export function makeInterestBoard(): LiveTexture<[number]> {
  return live(600, 240, (g, n) => {
    g.fillStyle = '#ffffff'; roundRect(g, 0, 0, 600, 240, 36); g.fill();
    g.strokeStyle = PINK; g.lineWidth = 10; roundRect(g, 5, 5, 590, 230, 32); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#3a3a3a'; g.font = `700 44px ${FONT}`;
    g.fillText('열리면 갈래요', 300, 68);
    g.fillStyle = PINK; g.font = `800 96px ${FONT}`;
    g.fillText(`${fmt(n)}명`, 300, 158);
  });
}

/** 광장 벽의 퀴즈 안내판. sub는 "어제 우승 3명" 같은 한 줄, names는 우승자 이름들 */
export function makeQuizBoard(hour: number): LiveTexture<[string, string]> {
  const board = live<[string, string]>(900, 580, (g, sub, names) => {
    g.fillStyle = '#1a1a1a'; roundRect(g, 0, 0, 900, 580, 36); g.fill();
    g.fillStyle = PINK; g.fillRect(0, 0, 900, 14);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = '#ff8ca3'; g.font = `700 38px ${FONT}`;
    g.fillText('오늘의 파팅 퀴즈', 56, 92);
    g.fillStyle = '#ffffff'; g.font = `800 104px ${FONT}`;
    g.fillText(`매일 밤 ${hour - 12}시`, 52, 214);
    g.fillStyle = '#ffd166'; g.font = `700 40px ${FONT}`;
    g.fillText('광장에서 OX 퀴즈 · 전부 맞히면 왕관', 56, 326);
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(56, 384, 788, 3);
    g.fillStyle = '#ffffff'; g.font = `700 40px ${FONT}`;
    g.fillText(sub, 56, 444);
    g.fillStyle = '#bdbdbd'; g.font = `500 32px ${FONT}`;
    let line = names;
    while (line.length > 4 && g.measureText(line).width > 788) line = line.slice(0, -2) + '…';
    g.fillText(line, 56, 510);
  });
  board.set('첫 우승자를 기다려요', 'O는 파란 바닥, X는 분홍 바닥에 서요');
  return board;
}

/** 퀴즈 때 광장 바닥에 까는 O/X 구역 */
export function makeZoneTexture(mark: 'O' | 'X'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 716;
  const g = c.getContext('2d')!;
  const color = mark === 'O' ? '#2f6fed' : '#ff385c';
  g.fillStyle = color; g.globalAlpha = 0.55; g.fillRect(0, 0, 512, 716);
  g.globalAlpha = 1;
  g.strokeStyle = '#ffffff'; g.lineWidth = 16; g.strokeRect(20, 20, 472, 676);
  g.lineWidth = 54; g.lineCap = 'round';
  if (mark === 'O') { g.beginPath(); g.arc(256, 358, 150, 0, Math.PI * 2); g.stroke(); }
  else { g.beginPath(); g.moveTo(116, 218); g.lineTo(396, 498); g.moveTo(396, 218); g.lineTo(116, 498); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 설문 키오스크 화면 */
export function makeKioskTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 384;
  const g = c.getContext('2d')!;
  g.fillStyle = PINK; g.fillRect(0, 0, 512, 384);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 120px ${FONT}`;
  g.fillText('설문', 256, 150);
  g.font = `600 40px ${FONT}`;
  g.fillText('30초 · 눌러서 참여', 256, 290);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 광장 벽의 방명록 게시판: 최근 글 세 개를 포스트잇으로 보여준다 */
export function makeGuestbookBoard(): LiveTexture<[string[]]> {
  const colors = ['#ffe58a', '#ffc2cf', '#bfeede'];
  return live<[string[]]>(900, 580, (g, notes) => {
    g.fillStyle = '#c9a678'; roundRect(g, 0, 0, 900, 580, 30); g.fill();
    g.fillStyle = '#e8cfa6'; roundRect(g, 18, 18, 864, 544, 20); g.fill();
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = '#4a3020'; g.font = `800 60px ${FONT}`;
    g.fillText('방명록', 52, 80);
    g.textAlign = 'right';
    g.fillStyle = '#7a5a40'; g.font = `600 32px ${FONT}`;
    g.fillText('눌러서 한마디 남기기', 848, 84);

    if (!notes.length) {
      g.textAlign = 'center';
      g.fillStyle = '#7a5a40'; g.font = `700 44px ${FONT}`;
      g.fillText('첫 번째 한마디를 남겨주세요', 450, 330);
      return;
    }
    notes.slice(0, 3).forEach((text, i) => {
      const x = 46 + i * 276, y = 150, w = 256, h = 372;
      g.save();
      g.translate(x + w / 2, y + h / 2);
      g.rotate((i - 1) * 0.035);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(-w / 2 + 6, -h / 2 + 8, w, h);
      g.fillStyle = colors[i % colors.length]; g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = '#ff385c'; g.beginPath(); g.arc(0, -h / 2 + 22, 11, 0, Math.PI * 2); g.fill();
      // 글자 단위로 줄바꿈
      g.fillStyle = '#2a2a2a'; g.font = `700 38px ${FONT}`; g.textAlign = 'center';
      const lines: string[] = [];
      let line = '';
      for (const ch of text) {
        if (g.measureText(line + ch).width > w - 44 && line) { lines.push(line); line = ch; }
        else line += ch;
      }
      if (line) lines.push(line);
      const shown = lines.slice(0, 6);
      shown.forEach((l, k) => g.fillText(l, 0, (k - (shown.length - 1) / 2) * 50 + 14));
      g.restore();
    });
  });
}
