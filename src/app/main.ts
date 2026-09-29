import { Application, Text } from 'pixi.js';

// Scaffold renderer entry (T0.1): black Pixi canvas, centered caption,
// tick counter from the sim worker in the top-left corner.

async function bootstrap(): Promise<void> {
  const app = new Application();
  await app.init({
    preference: 'webgl',
    background: '#000000',
    resizeTo: window,
    antialias: false,
    resolution: window.devicePixelRatio,
    autoDensity: true,
  });
  document.body.appendChild(app.canvas);

  const title = new Text({
    text: 'Alien Transporter Remaster — scaffold',
    style: { fill: 0xffffff, fontFamily: 'sans-serif', fontSize: 32 },
  });
  title.anchor.set(0.5);
  app.stage.addChild(title);

  const counter = new Text({
    text: 'ticks: 0',
    style: { fill: 0x00ff66, fontFamily: 'monospace', fontSize: 16 },
  });
  counter.position.set(8, 8);
  app.stage.addChild(counter);

  const layout = (): void => {
    title.position.set(app.screen.width / 2, app.screen.height / 2);
  };
  layout();
  app.renderer.on('resize', layout);

  const worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent<{ type: string; n: number }>) => {
    if (ev.data.type === 'tick') {
      counter.text = `ticks: ${ev.data.n}`;
      // Test hook for the Playwright smoke test (Pixi text is not readable from the DOM).
      document.documentElement.dataset['ticks'] = String(ev.data.n);
    }
  };
}

void bootstrap();
