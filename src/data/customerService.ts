/**
 * VID-04 «Atender a un cliente» en Decathlon: sólo datos. Las reglas (puntos,
 * barra de paciencia, cierre) están en systems/CustomerService.ts. Los ids de
 * `exact`, `near` y `shelf` son sectores de data/decathlon.ts SECTORS.
 */
import type { JobChoice } from './jobs.ts';

export interface AttentionRound { hint: string; exact: string; near: readonly string[]; shelf: readonly string[] }
export interface AttentionReplies { exact: string; near: string; wrong: string; timeout: string }
export interface AttentionCase {
  id: string;
  customer: string;
  opening: string;
  rounds: readonly [AttentionRound, AttentionRound, AttentionRound];
  /** Lo que contesta el cliente según lo que le llevas (o si se le acaba la paciencia). */
  replies: AttentionReplies;
}
export interface AttentionGrade { id: 'excellent' | 'good' | 'poor'; min: number; patienceMin: number; choice: JobChoice }
export interface AttentionMinigame {
  minigameId: 'decathlon-cliente';
  type: 'drag-to-customer';
  inputs: readonly ['pointer-drag', 'tap-tap', 'keyboard'];
  cases: readonly AttentionCase[];
  roundMs: 15000;
  lockMs: 400;
  points: { exact: 3; near: 1; wrong: 0; speedBonus: 1; speedAbove: 0.4 };
  maxPoints: 12;
  grades: readonly [AttentionGrade, AttentionGrade, AttentionGrade];
  abandon: 'no-shift';
}

const LABEL = 'Atender a un cliente';

export const ATTENTION: AttentionMinigame = {
  minigameId: 'decathlon-cliente',
  type: 'drag-to-customer',
  inputs: ['pointer-drag', 'tap-tap', 'keyboard'],
  roundMs: 15000,
  lockMs: 400,
  points: { exact: 3, near: 1, wrong: 0, speedBonus: 1, speedAbove: 0.4 },
  maxPoints: 12,
  abandon: 'no-shift',
  cases: [
    {
      id: 'corredor-novel',
      customer: 'Un chico en chándal',
      opening: '«Perdona, ¿me echas una mano? Quiero empezar a correr y no sé ni por dónde mirar.»',
      rounds: [
        {
          hint: '«Nada serio, ¿eh? Dos o tres veces por semana por el parque, para ponerme en forma.»',
          exact: 'running',
          near: ['calzado-hombre'],
          shelf: ['running', 'calzado-hombre', 'sportswear', 'fitness-hombre', 'ciclismo'],
        },
        {
          hint: '«Con estas zapatillas viejas acabo con ampollas. Algo que amortigüe y que no pase de setenta euros.»',
          exact: 'calzado-hombre',
          near: ['running'],
          shelf: ['calzado-hombre', 'running', 'calzado-mujer', 'futbol', 'baloncesto'],
        },
        {
          hint: '«Y una camiseta que no se empape de sudor. Lo más barato que tengáis, que esto acaba de empezar.»',
          exact: 'sportswear',
          near: ['running'],
          shelf: ['sportswear', 'running', 'kids', 'montana-hombre', 'natacion'],
        },
      ],
      replies: {
        exact: '«¡Justo esto! Qué rápido.»',
        near: '«Mmm, se parece… pero no es del todo lo que busco.»',
        wrong: '«Creo que no me has entendido.»',
        timeout: '«Bueno, ya miro yo por mi cuenta.»',
      },
    },
    {
      id: 'padel-jueves',
      customer: 'Una señora con una pala rajada',
      opening: '«Hola, buenas. Mira cómo tengo la pala… ¿me ayudas a dejarlo todo listo para el jueves?»',
      rounds: [
        {
          hint: '«Juego al pádel con unas amigas los jueves, nivel de andar por casa. Necesito una pala nueva, que esta ya no aguanta.»',
          exact: 'raqueta-padel',
          near: ['raqueta'],
          shelf: ['raqueta-padel', 'raqueta', 'golf', 'baloncesto', 'accesorios'],
        },
        {
          hint: '«En la pista de cristal resbalo muchísimo. Unas zapatillas que agarren, del 38.»',
          exact: 'calzado-mujer',
          near: ['raqueta-padel'],
          shelf: ['calzado-mujer', 'raqueta-padel', 'calzado-hombre', 'escalada', 'roller'],
        },
        {
          hint: '«Y unos overgrips para el mango, que con el calor se me escurre. Cosa de pocos euros.»',
          exact: 'raqueta',
          near: ['accesorios'],
          shelf: ['raqueta', 'accesorios', 'salud', 'pesca', 'golf'],
        },
      ],
      replies: {
        exact: '«Eso es. Se nota que juegas.»',
        near: '«Casi… pero no es esto lo que necesito.»',
        wrong: '«Uy, no, esto no tiene nada que ver.»',
        timeout: '«Mira, déjalo, que me están esperando.»',
      },
    },
    {
      id: 'acampada-sierra',
      customer: 'Un padre con un mapa de la sierra',
      opening: '«Buenas. Este finde me llevo a mi hija a la sierra y vamos a ir de cero, a ver si me orientas.»',
      rounds: [
        {
          hint: '«Vamos a dormir fuera una noche. Nunca hemos acampado: una tienda sencilla para dos, que se monte fácil.»',
          exact: 'camping',
          near: ['camping-2'],
          shelf: ['camping', 'camping-2', 'pesca', 'caza', 'kayak'],
        },
        {
          hint: '«Para el camino, una mochila de día, de unos treinta litros. No quiero gastarme un dineral.»',
          exact: 'mochilas',
          near: ['montana-hombre'],
          shelf: ['mochilas', 'montana-hombre', 'accesorios', 'ciclismo', 'roller'],
        },
        {
          hint: '«Y ella tiene nueve años: unas botas para pisar piedras sin que le hagan daño en los tobillos.»',
          exact: 'montana-jr',
          near: ['kids'],
          shelf: ['montana-jr', 'kids', 'montana-mujer', 'escalada', 'futbol'],
        },
      ],
      replies: {
        exact: '«Perfecto, esto es lo que necesitábamos.»',
        near: '«Puede servir, pero no me convence del todo.»',
        wrong: '«Esto no es para lo que te he dicho, ¿no?»',
        timeout: '«Nada, preguntaré a otro compañero.»',
      },
    },
  ],
  grades: [
    {
      id: 'excellent',
      min: 10,
      patienceMin: 0,
      choice: { label: LABEL, score: 1, bonus: 6, energy: -3, line: 'Marta lo ha visto desde las cajas: «Así se atiende. Ese cliente vuelve seguro».' },
    },
    {
      id: 'good',
      min: 5,
      patienceMin: 5,
      choice: { label: LABEL, score: 0, line: 'El cliente se va con lo suyo, aunque le has hecho dar alguna vuelta de más.' },
    },
    {
      id: 'poor',
      min: 0,
      patienceMin: 20,
      choice: { label: LABEL, score: -1, line: '«Ya, gracias», y el cliente se marcha sin nada. Marta lo apunta.' },
    },
  ],
};
