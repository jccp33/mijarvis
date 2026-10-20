// Executed in the isolated renderer by the desktop validation harness.
export async function phase2Scenario(stage, endpoint) {
  const $ = id => document.getElementById(id);
  const check = (condition, detail) => { if (!condition) throw new Error(detail); };
  async function waitFor(predicate) {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > 10000) throw new Error(`HUD phase 2 timeout: ${$('state').textContent} / ${$('messages').textContent} / ${$('settings-status').textContent}`);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }
  async function idle() { await waitFor(() => !$('send').disabled); }
  async function ask(prompt) { $('prompt').value = prompt; $('prompt-form').requestSubmit(); await idle(); }
  async function select(id) { $('conversations').value = id; $('conversations').dispatchEvent(new Event('change')); await idle(); }
  await idle();
  if (stage === 'restore') {
    check($('model').textContent === 'test-alternate', 'Saved model did not survive restart');
    check($('messages').textContent.includes('secret-one'), 'Saved messages did not survive restart');
    check(!$('messages').textContent.includes('cancel-me'), 'Cancelled turn entered saved history');
    check(!$('messages').textContent.includes('secret-two'), 'Deleted conversation reappeared');
    check($('conversations').options.length === 1, 'Deleted conversation was restored');
    $('settings-open').click();
    check($('setting-language').value === 'en', 'Saved language did not survive restart');
    check($('setting-endpoint').value === endpoint, 'Saved endpoint did not survive restart');
    check($('diagnostic').textContent.includes('guardado en disco'), 'Persistence diagnostic missing');
    return;
  }
  $('settings-open').click();
  check($('settings-dialog').open, 'Settings dialog did not open');
  check($('available-models').options.length === 2, 'Available models were not shown');
  $('setting-endpoint').value = 'http://localhost/path';
  $('settings-form').requestSubmit();
  await idle();
  check($('settings-status').textContent.includes('sin credenciales'), 'Invalid endpoint was accepted');
  $('setting-endpoint').value = endpoint;
  $('setting-model').value = 'test-alternate';
  $('setting-language').value = 'en';
  $('settings-form').requestSubmit();
  await idle();
  check($('model').textContent === 'test-alternate', 'Selected model was not applied');
  check($('diagnostic').textContent.includes(endpoint), 'New endpoint was not diagnosed');
  $('settings-close').click();
  await ask('secret-one');
  check($('messages').lastElementChild.textContent.includes('second-endpoint|test-alternate|English|secret-one'), 'Endpoint, model or language was not used');
  check(!$('messages').querySelector('b'), 'Model output was interpreted as markup');
  const first = $('conversations').value;
  $('new-conversation').click(); await idle();
  await ask('secret-two');
  check(!$('messages').textContent.includes('secret-one'), 'Conversations leaked context');
  const second = $('conversations').value;
  await select(first);
  check($('messages').textContent.includes('secret-one'), 'Selecting conversation did not restore messages');
  await ask('fail-once');
  check(!$('retry-response').disabled, 'Retry was not offered after incomplete response');
  $('retry-response').click(); await idle();
  check($('messages').lastElementChild.textContent.includes('retry-ok'), 'Manual retry did not complete');
  $('prompt').value = 'cancel-me'; $('prompt-form').requestSubmit();
  await waitFor(() => $('messages').lastElementChild.textContent === 'partial');
  $('cancel').click(); await idle();
  check($('cancel').disabled, 'Cancel did not restore controls');
  await select(second);
  $('delete-conversation').click(); await idle();
  check(![...$('conversations').options].some(option => option.value === second), 'Deleted conversation remains selectable');
  await select(first);
  check(!$('messages').textContent.includes('cancel-me'), 'Cancelled turn was persisted');
  check($('messages').textContent.split('TÚ / fail-once').length === 2, 'Failed turn was duplicated on retry');
  $('settings-open').click();
}
