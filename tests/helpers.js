/**
 * AYUDAS PARA LAS PRUEBAS
 * En el juego las tareas se hacen caminando y con minijuegos; aquí se mandan las mismas acciones
 * que manda el navegador al terminarlas.
 */
import { MINIGAMES, isTaskDone, stageTasks, taskProgress } from '../js/tasks.js';

/**
 * Hace todas las tareas de una etapa que se hacen "con las manos".
 * Las de pantalla (mercado, constructor) y las automáticas se cumplen solas con el estado.
 * @param {(who: any, action: any) => any} send   manda una acción como ese tripulante
 * @param {() => any} data                        el estado público actual
 * @param {string} stageId
 * @param {(role: string) => any} whoIs           qué tripulante tiene ese rol
 */
export const doStageTasks = (send, data, stageId, whoIs) => {
  for (const task of stageTasks(stageId)) {
    if (isTaskDone(data(), task)) continue;
    const who = whoIs(task.role);
    if (task.kind === 'carry') {
      for (let done = taskProgress(data(), task); done < task.count; done++) {
        send(who, { type: 'carry:pick', id: task.id });
        send(who, { type: 'carry:drop', id: task.id });
      }
    } else if (MINIGAMES.includes(task.kind) && !task.send) {
      send(who, { type: 'task:done', id: task.id });
    }
  }
};
