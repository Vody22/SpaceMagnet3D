import './ui/style.css';
import { Game } from './Game.js';

const game = new Game(document.querySelector('#app'));
// Exposed for automated browser tests and debugging.
window.__game = game;
