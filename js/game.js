/**
 * PARTIDA
 * Se muestra cuando termina la cuenta regresiva del lobby. Pone el marco (barra de arriba y avisos)
 * y, adentro, la pantalla de la escena en la que va la partida (state.data.scene):
 *
 *   prologue, briefing → js/narrative.js      la historia, página por página
 *   select             → js/constellation.js  la constelación para elegir misión
 *   mission            → js/world.js          el mundo: la estación, la nave y la Luna, caminando
 *
 * - El estado siempre viene del servidor:  session.state  y  on('state', ...).
 * - Lo que hace el jugador se manda con  sendAction({ type: '...' }).
 *   Las reglas están en server/game.js; si el servidor rechaza algo, llega on('rejected', mensaje)
 *   y aquí se muestra el motivo.
 */
import { endGame, isHost, leaveRoom, on, session } from './connection.js';
import { mountConstellation } from './constellation.js';
import { mountWorld } from './world.js';
import { getMission } from './missions.js';
import { mountNarrative } from './narrative.js';
import { PROLOGUE } from './story.js';
import { openTutorialLibrary } from './tutorial.js';
import { playCinematic } from './cinematic.js';
import { openSettings } from './settings.js';

const TOAST_MS = 3_500;

/** Qué pantalla arma cada escena. Prólogo e informe comparten pantalla. */
const VIEWS = { prologue: mountNarrative, briefing: mountNarrative, select: mountConstellation, mission: mountWorld };

const GAME_HTML = `
<div class="mission">
  <header class="mission-bar">
    <span class="hud-brand">Ad Astra<img src="assets/icons/star.svg" alt="" /></span>
    <p class="mission-title"><span></span><strong></strong></p>
    <span class="game-room">Sala <strong></strong></span>
    <button class="game-help" type="button">Tutoriales</button>
    <button class="game-help game-options" type="button">Opciones</button>
    <button class="game-end" hidden>Volver al lobby</button>
  </header>
  <div class="mission-scene"></div>
  <p class="mission-toast" role="alert" hidden></p>
</div>`;

export const mountGame = (container) => {
  container.innerHTML = GAME_HTML;
  const $ = (selector) => /** @type {HTMLElement} */ (container.querySelector(selector));
  const sceneBox = $('.mission-scene');
  const endButton = $('.game-end');
  const toast = $('.mission-toast');
  let toastTimer = 0;
  let mountedView = null;
  let unmountView = null;

  $('.game-room strong').textContent = session.room.code;

  const titleFor = (data) => {
    const mission = getMission(data.missionId);
    if (data.scene === 'prologue') return ['Prólogo', PROLOGUE.title];
    if (data.scene === 'select' || !mission) return ['Campaña', 'La constelación'];
    if (mission.sandbox) return ['Modo libre · créditos ilimitados', 'Sandbox'];
    return [`Misión ${mission.number}`, mission.title];
  };

  const render = () => {
    if (!session.room) return;
    endButton.hidden = !isHost();
    // El Sandbox no tiene lobby: el botón lleva directo al menú.
    endButton.textContent = session.room.mode === 'sandbox' ? 'Salir al menú' : 'Volver al lobby';
    container.querySelector('.mission').classList.toggle('is-sandbox', session.room.mode === 'sandbox');
    const data = session.state?.data;
    if (!data) return;

    // En la misión el mundo ocupa toda la pantalla; en las demás escenas, la página de siempre.
    container.querySelector('.mission').classList.toggle('is-world', data.scene === 'mission');
    const [kicker, title] = titleFor(data);
    $('.mission-title span').textContent = kicker;
    $('.mission-title strong').textContent = title;

    // Cambió la escena: se desarma la pantalla anterior y se arma la nueva.
    const view = VIEWS[data.scene];
    if (mountedView === mountNarrative && data.scene === 'mission') {
      playCinematic({ art: 'rocket', camera: 'in', kicker: titleFor(data)[1], title: 'A preparar la nave', text: 'Planear, comprar, construir. Después, despegar.' });
    }
    if (view && view !== mountedView) {
      unmountView?.();
      sceneBox.replaceChildren();
      sceneBox.dataset.scene = data.scene;
      mountedView = view;
      unmountView = view(sceneBox);
      window.scrollTo(0, 0);
    }
  };

  const showToast = (message) => {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, TOAST_MS);
  };

  endButton.addEventListener('click', () => (session.room?.mode === 'sandbox' ? leaveRoom() : endGame()));
  $('.game-help:not(.game-options)').addEventListener('click', openTutorialLibrary);
  $('.game-options').addEventListener('click', () => openSettings());

  render();
  const offs = [on('state', render), on('room', render), on('rejected', showToast)];
  return () => {
    clearTimeout(toastTimer);
    unmountView?.();
    offs.forEach((off) => off());
  };
};
