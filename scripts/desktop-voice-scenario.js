export async function voiceScenario() {
  const $ = id => document.getElementById(id);
  const check = (value, text) => { if (!value) throw new Error(text); };
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function wait(predicate, limit = 90000) {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > limit) throw new Error(`Voice HUD timed out: ${$('voice-status').textContent} / ${$('voice-diagnostic').textContent} / ${$('messages').textContent}`);
      await delay(40);
    }
  }
  await wait(() => !$('send').disabled);
  const unauthorized = await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => { stream.getTracks().forEach(track => track.stop()); return false; }, () => true);
  check(unauthorized, 'Microphone was available without a voice action');
  $('voice-settings').click();
  await wait(() => $('voice-diagnostic').textContent.includes('Motor local listo'));
  $('voice-refresh').click(); await delay(200);
  check($('voice-input').options.length >= 1, 'Input selector missing');
  const output = [...$('voice-output').options].find(option => option.value && !['default', 'communications'].includes(option.value));
  if (output) { $('voice-output').value = output.value; $('voice-output').dispatchEvent(new Event('change')); }
  $('voice-shortcut').value = 'F9'; $('voice-shortcut').dispatchEvent(new Event('change'));
  $('voice-dialog-close').click();
  $('voice-read').checked = true; $('voice-read').dispatchEvent(new Event('change'));
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'F9', key: 'F9', bubbles: true }));
  await wait(() => $('voice-status').textContent.startsWith('MIC ACTIVO'));
  check($('voice-talk').dataset.active === 'true', 'Microphone indicator is not active');
  await wait(() => $('voice-level').value > 0);
  await delay(4200);
  document.dispatchEvent(new KeyboardEvent('keyup', { code: 'F9', key: 'F9', bubbles: true }));
  await wait(() => !$('voice-review').hidden);
  check(/azul/i.test($('voice-transcript').value), 'Real STT did not recognize the synthetic phrase');
  check(!$('messages').textContent.includes('TÚ /'), 'Transcription was submitted without review');
  check($('voice-talk').dataset.active === 'false', 'Microphone indicator stayed active');
  const input = [...$('voice-input').options].find(option => option.value && !['default', 'communications'].includes(option.value));
  const deniedAgain = await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => { stream.getTracks().forEach(track => track.stop()); return false; }, () => true);
  check(deniedAgain, 'Microphone permission lease remained open after capture');
  const original = $('voice-transcript').value;
  $('voice-transcript').value = 'Responde solamente: Tu color favorito es azul.';
  $('voice-send').click();
  await wait(() => $('messages').textContent.includes('TÚ / Responde solamente'));
  await wait(() => $('voice-status').textContent === 'HABLANDO');
  check($('voice-talk').dataset.active === 'false', 'TTS reactivated microphone');
  await wait(() => !$('send').disabled);
  check(!$('messages').querySelector('.error'), 'Chat failed during spoken flow');
  $('voice-settings').click();
  if (input) { $('voice-input').value = input.value; $('voice-input').dispatchEvent(new Event('change')); }
  $('voice-test-output').click();
  await wait(() => !$('voice-test-output').disabled);
  $('voice-test-input').click();
  await wait(() => $('voice-status').textContent.startsWith('MIC ACTIVO'));
  $('voice-stop').click(); await wait(() => !$('send').disabled);
  check($('voice-talk').dataset.active === 'false', 'Stop did not clear the microphone indicator');
  $('voice-dialog-close').click();
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'F9', key: 'F9', bubbles: true }));
  await wait(() => $('voice-status').textContent.startsWith('MIC ACTIVO'));
  window.dispatchEvent(new Event('blur'));
  await wait(() => !$('send').disabled);
  check($('voice-talk').dataset.active === 'false', 'Window blur left microphone active');
  localStorage.removeItem('mijarvis-voice');
  return { transcription: original, reviewBeforeSend: true, localTts: true, permissionRevoked: true, stopAndBlur: true, namedInput: Boolean(input), namedOutput: Boolean(output) };
}
