import { navigateTo, context, requestExpandedMode } from '@devvit/web/client';

// The splash is the lightweight inline view shown in the Reddit feed. Keep it
// fast and dependency-free — the heavy Three.js app lives in game.html and is
// only loaded once the user expands into it.
const title = document.getElementById('title') as HTMLHeadingElement;
const startButton = document.getElementById('start-button') as HTMLButtonElement;
const docsLink = document.getElementById('docs-link') as HTMLSpanElement;
const threeLink = document.getElementById('three-link') as HTMLSpanElement;

startButton.addEventListener('click', (e) => {
  // Expand into the 'game' entrypoint declared in devvit.json.
  requestExpandedMode(e, 'game');
});

docsLink.addEventListener('click', () => navigateTo('https://developers.reddit.com/docs'));
threeLink.addEventListener('click', () => navigateTo('https://threejs.org'));

title.textContent = `Hey ${context.username ?? 'there'} 👋`;
