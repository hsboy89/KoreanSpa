import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles.css';
import { Game } from './game';

const boot = document.getElementById('boot')!;
const bootMsg = document.getElementById('boot-message')!;
const app = document.getElementById('app')!;

async function main() {
  try {
    const game = new Game(app);
    // 폰트와 첫 프레임이 준비될 시간을 잠깐 준다
    await Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise(r => setTimeout(r, 1200))]);
    game.start();
    requestAnimationFrame(() => {
      boot.classList.add('is-hiding');
      setTimeout(() => boot.remove(), 700);
    });
  } catch (err) {
    console.error('파팅 라운지 로딩 실패', err);
    boot.querySelector('h1')!.textContent = '문을 열지 못했어요';
    bootMsg.textContent = 'WebGL을 지원하는 브라우저에서 다시 들어와주세요.';
    boot.setAttribute('role', 'alert');
  }
}

main();
