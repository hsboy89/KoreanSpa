import * as THREE from 'three';
import QRCode from 'qrcode';
import { PARTING_URL } from './rooms';

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

/** 벽에 거는 안내판: 로고, 카테고리 이름, QR. QR은 준비되는 대로 그려 넣는다 */
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
  g.fillText('QR을 찍으면 이번 주 파티가 보여요', 70, 585);
  g.fillStyle = '#8a8a8a';
  g.font = `500 30px ${FONT}`;
  g.fillText('parting.io', 70, 632);

  // QR 자리
  const qx = W - 70 - 460, qy = 110, qs = 460;
  g.fillStyle = '#f4f4f4';
  roundRect(g, qx, qy, qs, qs, 28); g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const qr = document.createElement('canvas');
  QRCode.toCanvas(qr, PARTING_URL, { width: 420, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1a1a1a', light: '#ffffff' } })
    .then(() => {
      g.fillStyle = '#ffffff';
      roundRect(g, qx, qy, qs, qs, 28); g.fill();
      g.drawImage(qr, qx + 20, qy + 20, 420, 420);
      // 가운데 로고
      g.fillStyle = '#ffffff';
      roundRect(g, qx + qs / 2 - 46, qy + qs / 2 - 46, 92, 92, 18); g.fill();
      drawLogoMark(g, qx + qs / 2 - 38, qy + qs / 2 - 38, 76);
      tex.needsUpdate = true;
    })
    .catch(err => console.warn('QR 생성 실패', err));

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
