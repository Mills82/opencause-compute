import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
await mkdir(path.join(root, 'dist', 'static'), { recursive: true });
await cp(path.join(root, 'static'), path.join(root, 'dist', 'static'), { recursive: true });
await cp(path.join(root, 'src', 'electron-preload.cjs'), path.join(root, 'dist', 'electron-preload.cjs'));
