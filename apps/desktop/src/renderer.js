const $ = id => document.getElementById(id);
let socket;
let request;
let answer;
let retry;

function message(text, className = '') {
  const element = document.createElement('p');
  element.className = className;
  element.textContent = text;
  $('messages').append(element);
  element.scrollIntoView();
  return element;
}
function busy(value) {
  $('send').disabled = value || socket?.readyState !== WebSocket.OPEN;
  $('cancel').disabled = !value;
  $('state').textContent = value ? 'PROCESANDO' : 'EN ESPERA';
  $('orb').classList.toggle('thinking', value);
}
function send(event) {
  if (socket?.readyState !== WebSocket.OPEN) throw new Error('Core desconectado');
  socket.send(JSON.stringify(event));
}
async function connect() {
  try {
    socket = new WebSocket(await window.jarvis.connection());
    socket.onopen = () => { $('connection').textContent = 'CORE ONLINE'; busy(false); };
    socket.onmessage = ({ data }) => {
      const event = JSON.parse(data);
      if (event.type === 'ready') $('model').textContent = event.model;
      if (event.type === 'stats') {
        $('cpu').textContent = `${event.data.cpuPercent.toFixed(1)}%`;
        $('ram').textContent = `${event.data.memory.percent.toFixed(1)}%`;
        $('cpu-meter').value = event.data.cpuPercent;
        $('ram-meter').value = event.data.memory.percent;
        $('platform').textContent = event.data.platform === 'win32' ? 'Windows' : 'Linux';
      }
      if (event.id === request) {
        if (event.type === 'token') { answer.textContent += event.text; answer.scrollIntoView(); }
        if (event.type === 'done' || event.type === 'error') { request = undefined; busy(false); }
      }
      if (event.type === 'error') message(event.message, 'error');
      if (event.type === 'system.result') message(event.data.stdout);
    };
    socket.onclose = () => {
      if (request) message('Conexión interrumpida durante la respuesta.', 'error');
      request = undefined;
      busy(false);
      $('connection').textContent = 'CORE OFFLINE · RECONECTANDO';
      $('state').textContent = 'SIN CONEXIÓN';
      retry = setTimeout(connect, 2000);
    };
    socket.onerror = () => socket.close();
  } catch (error) { message(error.message, 'error'); retry = setTimeout(connect, 2000); }
}
$('prompt-form').addEventListener('submit', event => {
  event.preventDefault();
  const prompt = $('prompt').value.trim();
  if (!prompt || request || socket?.readyState !== WebSocket.OPEN) return;
  request = crypto.randomUUID();
  message(`TÚ / ${prompt}`, 'user');
  answer = message('');
  busy(true);
  send({ type: 'prompt', id: request, prompt });
  $('prompt').value = '';
});
$('cancel').onclick = () => { if (request) send({ type: 'cancel', id: request }); };
$('terminal').onclick = async () => { try { await window.jarvis.openTerminal(); } catch (error) { message(error.message, 'error'); } };
$('hostname').onclick = () => { try { send({ type: 'system.command', id: crypto.randomUUID(), command: 'hostname' }); } catch (error) { message(error.message, 'error'); } };
$('close').onclick = () => window.jarvis.close();
$('minimize').onclick = () => window.jarvis.minimize();
window.addEventListener('beforeunload', () => { clearTimeout(retry); socket?.close(); });
connect();
