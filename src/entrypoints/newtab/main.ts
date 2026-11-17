import '../../assets/styles.css';
import { startStartup } from '../../lib/startup';

const startup = startStartup();
void import('./bootstrap').then(({ boot }) => boot(startup)).catch(error => {
  startup.bookmarks.dispose();
  const alert = document.createElement('p');
  alert.setAttribute('role', 'alert');
  alert.textContent = '页面加载失败，请重新加载 owntab。';
  document.querySelector('#app')?.replaceChildren(alert);
  console.error(error);
});
