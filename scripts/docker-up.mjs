#!/usr/bin/env node
// Construye las imágenes solo si faltan (primera vez) y luego levanta el stack.
import { execSync } from 'node:child_process';

function run(command) {
  execSync(command, { stdio: 'inherit' });
}

function runSilent(command) {
  try {
    return execSync(command, { stdio: 'pipe', encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

function imageExists(image) {
  try {
    execSync(`docker image inspect ${image}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const images = runSilent('docker compose config --images')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const missing = images.filter((image) => !imageExists(image));

if (images.length === 0 || missing.length > 0) {
  console.log(missing.length > 0
    ? `Construyendo imágenes faltantes: ${missing.join(', ')}`
    : 'No se pudo determinar el estado de las imágenes, construyendo por seguridad.');
  run('docker compose build');
} else {
  console.log('Imágenes ya construidas, se omite el build.');
}

run('docker compose up');
