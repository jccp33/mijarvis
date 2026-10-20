const $ = id => document.getElementById(id);
let socket;
let request;
let answer;
let retry;
let operation;
let ready = false;
let selected;
let conversations = [];
let settings;
let lastPrompt;
let failedPrompt;
let restorePending = false;
const savedSelection = () => { try { return sessionStorage.getItem('mijarvis-conversation'); } catch { return null; } };
function remember(id) { try { if (id) sessionStorage.setItem('mijarvis-conversation', id); else sessionStorage.removeItem('mijarvis-conversation'); } catch { /* storage can be unavailable */ } }

function message(text, className = '') {
  const element = document.createElement('p');
  element.className = className;
  element.textContent = text;
  $('messages').append(element);
  element.scrollIntoView();
  return element;
}
function controls() {
  const connected = ready && socket?.readyState === WebSocket.OPEN;
  const blocked = !connected || Boolean(request || operation);
  $('send').disabled = blocked;
  $('cancel').disabled = !request || !connected;
  for (const id of ['new-conversation', 'conversations', 'settings-save', 'diagnose']) $(id).disabled = blocked;
  $('delete-conversation').disabled = blocked || !selected;
  $('retry-response').disabled = blocked || !failedPrompt || failedPrompt.conversationId !== selected;
  $('state').textContent = !connected ? 'SIN CONEXIÓN' : request ? 'PROCESANDO' : operation ? 'ACTUALIZANDO' : 'EN ESPERA';
  $('orb').classList.toggle('thinking', Boolean(request));
}
function send(event) {
  if (socket?.readyState !== WebSocket.OPEN) throw new Error('Core desconectado');
  socket.send(JSON.stringify(event));
}
function manage(type, fields = {}) {
  if (!ready || request || operation) return;
  const id = crypto.randomUUID();
  operation = { id, type };
  controls();
  send({ type, id, ...fields });
}
function list(items) {
  conversations = items;
  $('conversations').replaceChildren();
  if (!items.length) $('conversations').append(new Option('Sin conversaciones', ''));
  for (const item of items) $('conversations').append(new Option(item.title || 'Nueva conversación', item.id));
  $('conversations').value = selected || '';
}
function displayConversation(conversation) {
  selected = conversation?.id;
  remember(selected);
  failedPrompt = undefined;
  $('messages').replaceChildren();
  for (const item of conversation?.messages || []) message(item.role === 'user' ? `TÚ / ${item.content}` : item.content, item.role === 'user' ? 'user' : '');
  $('conversations').value = selected || '';
  controls();
}
function applySettings(value) {
  settings = value;
  $('model').textContent = value.model;
  $('setting-endpoint').value = value.endpoint;
  $('setting-model').value = value.model;
  $('setting-language').value = value.language;
  $('available-models').replaceChildren();
  $('diagnostic').textContent = 'Comprueba la conexión para consultar los modelos disponibles.';
}
function submit(prompt) {
  if (!prompt || request || operation || !ready) return;
  request = crypto.randomUUID();
  lastPrompt = { prompt, conversationId: selected };
  failedPrompt = undefined;
  message(`TÚ / ${prompt}`, 'user');
  answer = message('');
  controls();
  send({ type: 'prompt', id: request, prompt });
}
function diagnostic(event) {
  $('available-models').replaceChildren();
  for (const model of event.models) $('available-models').append(new Option(model.id, model.id));
  const status = event.available ? event.selectedModelAvailable ? 'OLLAMA ONLINE' : 'MODELO NO INSTALADO' : 'OLLAMA OFFLINE';
  $('diagnostic').textContent = [status, `Servidor: ${event.settings.endpoint}`, `Modelo: ${event.settings.model}`,
    `Modelos disponibles: ${event.models.map(model => model.id).join(', ') || 'ninguno'}`,
    `Historial: ${event.persistent ? 'guardado en disco' : 'solo en memoria'}`, event.warning, event.error].filter(Boolean).join('\n');
  $('settings-status').textContent = status;
  $('notice').textContent = [status, event.error, event.warning].filter(Boolean).join(' · ');
}
async function connect() {
  try {
    const client = new WebSocket(await window.jarvis.connection());
    socket = client;
    client.onmessage = ({ data }) => {
      if (socket !== client) return;
      const event = JSON.parse(data);
      const matched = operation && event.id === operation.id;
      const completedOperation = matched ? operation : undefined;
      if (matched) operation = undefined;
      if (event.type === 'ready') {
        ready = true;
        $('connection').textContent = 'CORE ONLINE';
        applySettings(event.settings);
        list(event.conversations);
        $('notice').textContent = event.warning || (event.persistent ? 'Historial local guardado en disco.' : 'Historial temporal: solo en memoria.');
        const previous = savedSelection();
        const target = conversations.some(item => item.id === previous) ? previous : conversations[0]?.id;
        restorePending = true;
        if (target) manage('conversation.select', { conversationId: target });
        else manage('conversation.create');
      }
      if (event.type === 'conversation') {
        // An implicit first conversation can arrive while the response is streaming.
        if (request) { selected = event.conversation?.id; remember(selected); if (lastPrompt) lastPrompt.conversationId = selected; }
        else displayConversation(event.conversation);
        list(event.conversations);
        if (restorePending && matched) { restorePending = false; manage('diagnostics'); }
      }
      if (event.type === 'conversations') list(event.conversations);
      if (event.type === 'settings') {
        applySettings(event.settings);
        $('settings-status').textContent = 'Configuración guardada. Se aplicará a las próximas respuestas.';
        if (completedOperation?.type === 'settings.update') manage('diagnostics');
      }
      if (event.type === 'diagnostics') diagnostic(event);
      if (event.type === 'stats') {
        $('cpu').textContent = `${event.data.cpuPercent.toFixed(1)}%`;
        $('ram').textContent = `${event.data.memory.percent.toFixed(1)}%`;
        $('cpu-meter').value = event.data.cpuPercent;
        $('ram-meter').value = event.data.memory.percent;
        $('platform').textContent = event.data.platform === 'win32' ? 'Windows' : 'Linux';
      }
      if (request && event.id === request) {
        if (event.type === 'token') { answer.textContent += event.text; answer.scrollIntoView(); }
        if (event.type === 'done') { selected = event.conversationId; remember(selected); request = undefined; }
        if (event.type === 'error') {
          answer?.classList.add('partial');
          failedPrompt = lastPrompt;
          request = undefined;
        }
      }
      if (event.type === 'error') {
        message(event.message, 'error');
        $('settings-status').textContent = event.message;
        if (completedOperation?.type === 'conversation.select' && restorePending) { restorePending = false; remember(undefined); }
        $('conversations').value = selected || '';
      }
      if (event.type === 'system.result') message(event.data.stdout);
      controls();
    };
    client.onclose = () => {
      if (socket !== client) return;
      if (request) message('Conexión interrumpida. Revisa el historial recuperado antes de enviar de nuevo.', 'error');
      ready = false;
      request = undefined;
      operation = undefined;
      failedPrompt = undefined;
      controls();
      $('connection').textContent = 'CORE OFFLINE · RECONECTANDO';
      retry = setTimeout(connect, 2000);
    };
    client.onerror = () => client.close();
  } catch (error) { message(error.message, 'error'); retry = setTimeout(connect, 2000); }
}
$('prompt-form').addEventListener('submit', event => {
  event.preventDefault();
  const prompt = $('prompt').value.trim();
  if (!prompt || request || operation || !ready) return;
  submit(prompt);
  $('prompt').value = '';
});
$('new-conversation').onclick = () => manage('conversation.create');
$('conversations').onchange = () => { if ($('conversations').value) manage('conversation.select', { conversationId: $('conversations').value }); };
$('delete-conversation').onclick = () => manage('conversation.delete', { conversationId: selected });
$('retry-response').onclick = () => { if (failedPrompt?.conversationId === selected) submit(failedPrompt.prompt); };
$('settings-open').onclick = () => $('settings-dialog').showModal();
$('settings-close').onclick = () => $('settings-dialog').close();
$('settings-form').onsubmit = event => {
  event.preventDefault();
  manage('settings.update', { settings: { endpoint: $('setting-endpoint').value.trim(), model: $('setting-model').value.trim(), language: $('setting-language').value } });
};
$('diagnose').onclick = () => manage('diagnostics');
$('cancel').onclick = () => { if (request) send({ type: 'cancel', id: request }); };
$('terminal').onclick = async () => { try { await window.jarvis.openTerminal(); } catch (error) { message(error.message, 'error'); } };
$('hostname').onclick = () => { try { send({ type: 'system.command', id: crypto.randomUUID(), command: 'hostname' }); } catch (error) { message(error.message, 'error'); } };
$('close').onclick = () => window.jarvis.close();
$('minimize').onclick = () => window.jarvis.minimize();
window.addEventListener('beforeunload', () => { clearTimeout(retry); socket?.close(); });
controls();
connect();
