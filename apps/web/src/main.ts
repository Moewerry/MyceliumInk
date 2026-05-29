import './styles/main.css';
import { MyceliumApp } from './app.js';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app not found');

const app = new MyceliumApp();
app.mount(root);
